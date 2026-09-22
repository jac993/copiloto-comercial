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

// Prefijo de la tarea "identificar respondente". Mismo truco que
// PREFIJO_CADENCIA: el texto de proximo_paso es el único canal para marcar
// el tipo de tarea, porque interacciones.tipo es una unión cerrada de 6
// valores (lib/types.ts) y agregarle uno nuevo rompería TIPO_CONF y los 4
// componentes que la consumen.
export const PREFIJO_IDENTIFICAR = /^\[¿Quién respondió\?\]\s*/;

// Cierre automático cuando el prospecto responde.
//
// Política (opción C del plan M3):
//   1. Con contactoId            → se cierra SU cadencia. El usuario ya eligió.
//   2. Sin contactoId, 1 activa  → se cierra. Solo pudo ser esa persona.
//   3. Sin contactoId, 2+ activas → NO se adivina. Se crea una tarea en Hoy
//      para que el vendedor identifique quién respondió.
//
// El caso 3 es INALCANZABLE hasta que corra la migración de M3: hoy el índice
// idx_asignacion_activa_unica limita a UNA asignación activa por empresa, así
// que activas.length nunca pasa de 1. El código queda listo para cuando el
// índice pase a ser por contacto_id.
export async function cerrarPorRespuesta(
  supabase: SupabaseClient,
  empresaId: string,
  contactoId?: string | null
): Promise<void> {
  // ── Caso 1: sabemos quién respondió ──────────────────────────
  if (contactoId) {
    const { data, error } = await supabase
      .from("cadencia_asignaciones")
      .select("id")
      .eq("contacto_id", contactoId)
      .eq("estado", "activa");
    if (error) throw new Error(`cerrarPorRespuesta: ${error.message}`);
    for (const a of data ?? []) {
      await cerrarAsignacion(supabase, a.id as string, "respondio");
    }
    return;
  }

  // ── Sin contacto: cuántas cadencias activas tiene la empresa ──
  // Sin maybeSingle() a propósito: con 2+ filas devuelve data=null y setea
  // error, y como antes solo se leía data, el cierre fallaba EN SILENCIO.
  const { data: activas, error } = await supabase
    .from("cadencia_asignaciones")
    .select("id, contacto_id")
    .eq("empresa_id", empresaId)
    .eq("estado", "activa");
  if (error) throw new Error(`cerrarPorRespuesta: ${error.message}`);
  if (!activas || activas.length === 0) return;

  // ── Caso 2: una sola, no hay ambigüedad ──────────────────────
  if (activas.length === 1) {
    await cerrarAsignacion(supabase, activas[0].id as string, "respondio");
    return;
  }

  // ── Caso 3: varias. Preguntar en vez de adivinar ─────────────
  await crearTareaIdentificarRespondente(
    supabase,
    empresaId,
    activas.map((a) => a.contacto_id as string)
  );
}

// Crea la tarea "¿quién respondió?" como fila de interacciones con
// proximo_paso. Así aparece sola en Hoy por el pipeline de tareas que ya
// existe (metricas/hoy toma toda interacción con proximo_paso y resuelta
// distinto de true). No hace falta tabla nueva ni migración.
//
// cadencia_asignacion_id queda null a propósito: NO es una tarea de cadencia
// y no debe excluirse de Hoy como sí se excluyen esas.
export async function crearTareaIdentificarRespondente(
  supabase: SupabaseClient,
  empresaId: string,
  contactoIds: string[]
): Promise<void> {
  // Si ya hay una pendiente para esta empresa, no duplicar.
  const { data: yaExiste } = await supabase
    .from("interacciones")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("resuelta", false)
    .like("proximo_paso", "[¿Quién respondió?]%")
    .limit(1);
  if (yaExiste && yaExiste.length > 0) return;

  const [{ data: empresa }, { data: contactos }] = await Promise.all([
    supabase.from("empresas").select("nombre").eq("id", empresaId).maybeSingle(),
    supabase.from("contactos").select("id, nombre, cargo").in("id", contactoIds),
  ]);

  const nombreEmpresa = (empresa?.nombre as string | undefined) ?? "esta empresa";
  const opciones = (contactos ?? [])
    .map((c) => {
      const nombre = (c.nombre as string | null) ?? "Sin nombre";
      const cargo = c.cargo as string | null;
      return cargo ? `${nombre} (${cargo})` : nombre;
    })
    .join(" · ");

  const { error } = await supabase.from("interacciones").insert({
    empresa_id: empresaId,
    contacto_id: null,
    parent_id: null,
    // tipo debe ser uno de los 6 de TipoInteraccion. "llamada" es el fallback
    // de inferirTipoInteraccion() y el canal natural para resolver esto.
    tipo: "llamada",
    fecha: new Date().toISOString(),
    audio_url: null,
    transcripcion: null,
    resumen_ia: null,
    compromisos: null,
    sentimiento: null,
    tecnica_usada: null,
    coaching_ia: null,
    proximo_paso: `[¿Quién respondió?] Alguien de ${nombreEmpresa} respondió y hay ${contactoIds.length} cadencias activas. ¿Quién fue? ${opciones}`,
    proximo_paso_fecha: hoyCL(),
    badge_estado: null,
    decision_sugerida: null,
    remitente: "vendedor",
    resuelta: false,
    no_realizada: false,
    cadencia_asignacion_id: null,
  });
  if (error) throw new Error(`crearTareaIdentificarRespondente: ${error.message}`);
}

export { tipoInteraccionACanal };
