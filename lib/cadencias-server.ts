// =============================================================
// Helpers de servidor para el sistema de cadencias.
// Comparte la lógica de "crear tarea de un paso" y "avanzar al
// siguiente paso" entre /api/cadencias/asignar y el hook de
// /api/tareas/completar. Solo lee/escribe Supabase — CERO IA.
// Patrón de datos: queries separadas + Map, nunca joins.
// =============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyCL, sumarDiasHabilesDesde } from "@/lib/fecha";
import {
  canalesDisponibles,
  resolverCanal,
  canalATipoInteraccion,
  tipoInteraccionACanal,
  CANAL_PASO_LABEL,
} from "@/lib/cadencias";
import type { CadenciaPaso, CadenciaAsignacion, CanalCadenciaPaso } from "@/lib/types";

// Prefijo estándar del proximo_paso de una tarea de cadencia.
// metricas/hoy lo usa para extraer la intención limpia.
export const PREFIJO_CADENCIA = /^\[Cadencia (\d+)\/(\d+) · [^\]]+\]\s*/;

export async function getPasosDeCadencia(
  supabase: SupabaseClient,
  cadenciaId: string
): Promise<CadenciaPaso[]> {
  const { data, error } = await supabase
    .from("cadencia_pasos")
    .select("*")
    .eq("cadencia_id", cadenciaId)
    .order("orden", { ascending: true });
  if (error) throw new Error(`getPasosDeCadencia: ${error.message}`);
  return (data ?? []) as CadenciaPaso[];
}

// Crea la fila de interacciones que representa la tarea de un paso.
// transcripcion/resumen_ia = null → invisible en el historial (regla
// establecida: el historial solo muestra lo ingresado manualmente).
export async function crearTareaDePaso(
  supabase: SupabaseClient,
  opts: {
    asignacionId: string;
    empresaId: string;
    contactoId: string;
    canal: CanalCadenciaPaso;
    orden: number;
    totalPasos: number;
    intencion: string;
    fechaTarea: string; // YYYY-MM-DD
  }
): Promise<void> {
  const { error } = await supabase.from("interacciones").insert({
    empresa_id: opts.empresaId,
    contacto_id: opts.contactoId,
    parent_id: null,
    tipo: canalATipoInteraccion(opts.canal),
    fecha: new Date().toISOString(),
    audio_url: null,
    transcripcion: null,
    resumen_ia: null,
    compromisos: null,
    sentimiento: null,
    tecnica_usada: null,
    coaching_ia: null,
    proximo_paso: `[Cadencia ${opts.orden}/${opts.totalPasos} · ${CANAL_PASO_LABEL[opts.canal]}] ${opts.intencion}`,
    proximo_paso_fecha: opts.fechaTarea,
    badge_estado: null,
    decision_sugerida: null,
    remitente: "vendedor",
    resuelta: false,
    no_realizada: false,
    cadencia_asignacion_id: opts.asignacionId,
  });
  if (error) throw new Error(`crearTareaDePaso: ${error.message}`);
}

// Avanza la asignación al siguiente paso ejecutable después de que la
// tarea del paso actual fue completada. Recalcula los canales del
// contacto EN ESTE MOMENTO (pueden haber cambiado desde la asignación).
// Si no quedan pasos ejecutables → completada con motivo 'agotada'.
export async function avanzarCadencia(
  supabase: SupabaseClient,
  asignacionId: string,
  canalPasoCompletado: CanalCadenciaPaso | null
): Promise<void> {
  const { data: asigData } = await supabase
    .from("cadencia_asignaciones")
    .select("*")
    .eq("id", asignacionId)
    .eq("estado", "activa")
    .maybeSingle();
  if (!asigData) return; // cerrada/cancelada mientras tanto — nada que avanzar
  const asignacion = asigData as CadenciaAsignacion;

  const [pasos, { data: contacto }] = await Promise.all([
    getPasosDeCadencia(supabase, asignacion.cadencia_id),
    supabase
      .from("contactos")
      .select("email, telefono, linkedin_url")
      .eq("id", asignacion.contacto_id)
      .maybeSingle(),
  ]);

  const disponibles = canalesDisponibles(contacto ?? {});
  const totalPasos = pasos.length;
  const pendientes = pasos.filter((p) => p.orden > asignacion.paso_actual);

  const canalAnterior = canalPasoCompletado;
  for (const paso of pendientes) {
    const canal = resolverCanal(paso, disponibles, canalAnterior);
    if (canal === null) continue; // paso omitido — su offset no se acumula
    await crearTareaDePaso(supabase, {
      asignacionId: asignacion.id,
      empresaId: asignacion.empresa_id,
      contactoId: asignacion.contacto_id,
      canal,
      orden: paso.orden,
      totalPasos,
      intencion: paso.intencion,
      fechaTarea: sumarDiasHabilesDesde(hoyCL(), paso.dia_offset),
    });
    await supabase
      .from("cadencia_asignaciones")
      .update({ paso_actual: paso.orden })
      .eq("id", asignacion.id);
    return;
  }

  // Sin pasos ejecutables restantes → secuencia agotada
  await supabase
    .from("cadencia_asignaciones")
    .update({ estado: "completada", motivo_cierre: "agotada" })
    .eq("id", asignacion.id);
}

// Cierra la asignación activa de una empresa (si existe) y cancela sus
// tareas pendientes. Usado por el cierre manual, el auto-cierre al
// responder el prospecto, y el endpoint /api/cadencias/cerrar.
export async function cerrarAsignacion(
  supabase: SupabaseClient,
  asignacionId: string,
  motivo: "respondio" | "manual" | "agotada"
): Promise<void> {
  const estado = motivo === "manual" ? "cancelada" : "completada";
  await supabase
    .from("cadencia_asignaciones")
    .update({ estado, motivo_cierre: motivo })
    .eq("id", asignacionId);
  // Tareas de cadencia pendientes → canceladas (no borradas: métricas intactas)
  await supabase
    .from("interacciones")
    .update({ resuelta: true, no_realizada: true })
    .eq("cadencia_asignacion_id", asignacionId)
    .eq("resuelta", false);
}

// Cierre automático cuando el prospecto responde: busca la asignación
// activa de la empresa y la completa con motivo 'respondio'.
export async function cerrarPorRespuesta(
  supabase: SupabaseClient,
  empresaId: string
): Promise<void> {
  const { data } = await supabase
    .from("cadencia_asignaciones")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("estado", "activa")
    .maybeSingle();
  if (!data) return;
  await cerrarAsignacion(supabase, data.id as string, "respondio");
}

export { tipoInteraccionACanal };
