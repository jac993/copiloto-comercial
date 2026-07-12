// =============================================================
// GET /api/metricas/hoy — Métricas diarias reales del vendedor.
// Cuenta interacciones de hoy, calcula racha y retorna
// empresas para reactivar. Se llama al cargar pantalla Hoy
// y al volver al foco de la ventana.
// =============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Empresa, TareaPendiente } from "@/lib/types";
import { hoyCL, rangoDiaChileUTC } from "@/lib/fecha";
import { tipoInteraccionACanal } from "@/lib/cadencias";
import { PREFIJO_CADENCIA } from "@/lib/cadencias-server";

export const dynamic = "force-dynamic";
// Sin esto, Next.js cachea los fetch() internos de supabase-js (Data Cache)
// y el GET devuelve datos viejos de la BD aunque la ruta sea force-dynamic.
export const fetchCache = "force-no-store";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const supabase = getSupabase();
  const hoy = hoyCL();

  // Ventana del día calendario CHILENO (Fix 5): sin esto el filtro corría
  // en UTC y una interacción de las ~21:00 Chile no contaba para hoy.
  const { desde: diaDesde, hasta: diaHasta } = rangoDiaChileUTC(hoy);

  // Contar interacciones REALES de hoy. Fix 1: excluir las filas de tarea de
  // cadencia (cadencia_asignacion_id no nulo) — son recordatorios de "enviar",
  // no contactos; el contacto real es la interacción separada que se registra.
  const { count: contactosHoy } = await supabase
    .from("interacciones")
    .select("*", { count: "exact", head: true })
    .gte("fecha", diaDesde)
    .lt("fecha", diaHasta)
    .is("cadencia_asignacion_id", null);

  // Contar llamadas de hoy específicamente (misma exclusión de cadencia)
  const { count: llamadasHoy } = await supabase
    .from("interacciones")
    .select("*", { count: "exact", head: true })
    .eq("tipo", "llamada")
    .gte("fecha", diaDesde)
    .lt("fecha", diaHasta)
    .is("cadencia_asignacion_id", null);

  // Contar negocios ganados este mes (en zona horaria Chile)
  const [hoyY, hoyM] = hoy.split("-");
  const inicioMesISO = `${hoyY}-${hoyM}-01T00:00:00Z`;
  const { count: ganadosMes } = await supabase
    .from("empresas")
    .select("*", { count: "exact", head: true })
    .eq("estado", "ganado")
    .gte("actualizado_en", inicioMesISO);

  const META = 5;
  const contactos = contactosHoy ?? 0;
  const llamadas = llamadasHoy ?? 0;
  const ganados = ganadosMes ?? 0;
  const metaCumplida = contactos >= META;

  // Upsert métrica de hoy (crea la fila si no existe)
  await supabase.from("metricas_diarias").upsert(
    {
      fecha: hoy,
      contactos_hechos: contactos,
      meta_cumplida: metaCumplida,
      reuniones_logradas: 0,
      cotizaciones_enviadas: 0,
      negocios_ganados: ganados,
      racha_dias: 0,
    },
    { onConflict: "fecha", ignoreDuplicates: false }
  );

  // Calcular racha: días consecutivos desde hoy hacia atrás con meta cumplida
  const hace31 = new Date(hoy + "T12:00:00Z");
  hace31.setUTCDate(hace31.getUTCDate() - 31);
  const { data: metricas } = await supabase
    .from("metricas_diarias")
    .select("fecha, meta_cumplida")
    .gte("fecha", hace31.toISOString().split("T")[0])
    .order("fecha", { ascending: false });

  let racha = 0;
  if (metricas) {
    const hoyTs = new Date(hoy).getTime();
    for (const m of metricas) {
      const diffDias = Math.round((hoyTs - new Date(m.fecha).getTime()) / 86400000);
      if (diffDias === racha && m.meta_cumplida) {
        racha++;
      } else if (diffDias > racha) {
        break;
      }
    }
  }

  // Guardar racha calculada
  await supabase
    .from("metricas_diarias")
    .update({ racha_dias: racha })
    .eq("fecha", hoy);

  // Empresas para reactivar: perdidas con fecha_reactivacion <= hoy
  const { data: reactivaciones } = await supabase
    .from("empresas")
    .select("*")
    .eq("estado", "perdido")
    .lte("fecha_reactivacion", hoy)
    .not("fecha_reactivacion", "is", null)
    .order("fecha_reactivacion", { ascending: true });

  // Tareas pendientes: interacciones con proximo_paso y no resueltas.
  // tipo + cadencia_asignacion_id permiten mostrar badge de canal y
  // el botón "Generar borrador" en las tareas de cadencia.
  const { data: tareasRaw, error: tareasError } = await supabase
    .from("interacciones")
    .select("id, empresa_id, contacto_id, proximo_paso, proximo_paso_fecha, tipo, cadencia_asignacion_id")
    .not("proximo_paso", "is", null)
    .neq("resuelta", true)             // captura false Y null de rows antiguas
    .order("proximo_paso_fecha", { ascending: true })
    .limit(50);

  console.log('[TAREAS_RAW]', tareasRaw?.length, tareasError?.message);

  // Tareas realizadas HOY (día chileno) — alimentan la pestaña "Realizadas".
  // Manuales: interacciones con proximo_paso marcadas Hecho hoy.
  // IA: prioridades_diarias marcadas Hecho hoy (incluye vencidas completadas hoy).
  const { desde: hoyDesde, hasta: hoyHasta } = rangoDiaChileUTC(hoy);
  const [{ data: realizadasManualRaw }, { data: realizadasIARaw }] = await Promise.all([
    supabase
      .from("interacciones")
      .select("id, empresa_id, contacto_id, proximo_paso, proximo_paso_fecha, actualizado_en")
      .not("proximo_paso", "is", null)
      .eq("resuelta", true)
      .eq("no_realizada", false)
      .gte("actualizado_en", hoyDesde)
      .lt("actualizado_en", hoyHasta)
      .order("actualizado_en", { ascending: false })
      .limit(50),
    supabase
      .from("prioridades_diarias")
      .select("id, empresa_id, nombre_empresa, accion_sugerida, fecha, completada_en")
      .eq("completada", true)
      .eq("no_realizada", false)
      .gte("completada_en", hoyDesde)
      .lt("completada_en", hoyHasta)
      .order("completada_en", { ascending: false }),
  ]);

  // Resolver nombres de empresas y contactos en queries separadas
  // (incluye las de tareas realizadas para reusar los mismos mapas)
  const empresaIds = Array.from(new Set([
    ...(tareasRaw ?? []).map((r) => r.empresa_id as string),
    ...(realizadasManualRaw ?? []).map((r) => r.empresa_id as string),
  ]));
  const { data: empresasRaw } = empresaIds.length > 0
    ? await supabase.from("empresas").select("id, nombre").in("id", empresaIds)
    : { data: [] };
  const empresasMap = new Map((empresasRaw ?? []).map((e) => [e.id, e.nombre as string]));

  const contactoIds = [...(tareasRaw ?? []), ...(realizadasManualRaw ?? [])]
    .map((r) => r.contacto_id as string | null)
    .filter(Boolean) as string[];
  const { data: contactosRaw } = contactoIds.length > 0
    ? await supabase.from("contactos").select("id, nombre").in("id", contactoIds)
    : { data: [] };
  const contactosMap = new Map((contactosRaw ?? []).map((c) => [c.id, c.nombre as string]));

  const tareasPendientes: TareaPendiente[] = (tareasRaw ?? []).map((r) => {
    const base: TareaPendiente = {
      id: r.id as string,
      empresa_id: r.empresa_id as string,
      empresa_nombre: empresasMap.get(r.empresa_id as string) ?? "Empresa",
      contacto_nombre: contactosMap.get(r.contacto_id as string) ?? null,
      proximo_paso: r.proximo_paso as string,
      proximo_paso_fecha: r.proximo_paso_fecha as string,
    };
    // Tareas de cadencia: canal (badge) + intención limpia (sin el prefijo
    // "[Cadencia X/Y · Canal]") para inyectarla al borrador de Consultar.
    if (r.cadencia_asignacion_id) {
      const canal = tipoInteraccionACanal(r.tipo as string);
      if (canal) base.canal = canal;
      base.cadencia_asignacion_id = r.cadencia_asignacion_id as string;
      base.intencion = (r.proximo_paso as string).replace(PREFIJO_CADENCIA, "");
      if (r.contacto_id) base.contacto_id = r.contacto_id as string;
    }
    return base;
  });
  console.log('[TAREAS_PENDIENTES]', tareasPendientes.length);

  // Unificar realizadas manuales + IA al mismo shape que TareaPendiente
  const tareasRealizadas: TareaPendiente[] = [
    ...(realizadasManualRaw ?? []).map((r) => ({
      id: r.id as string,
      empresa_id: r.empresa_id as string,
      empresa_nombre: empresasMap.get(r.empresa_id as string) ?? "Empresa",
      contacto_nombre: contactosMap.get(r.contacto_id as string) ?? null,
      proximo_paso: r.proximo_paso as string,
      proximo_paso_fecha: (r.proximo_paso_fecha as string | null) ?? hoy,
    })),
    ...(realizadasIARaw ?? []).map((r) => ({
      id: r.id as string,
      empresa_id: r.empresa_id as string,
      empresa_nombre: r.nombre_empresa as string,
      contacto_nombre: null,
      proximo_paso: r.accion_sugerida as string,
      proximo_paso_fecha: r.fecha as string,
      origen: "ia" as const,
    })),
  ];

  // Prioridades de hoy sin ejecutar — fuente de verdad: prioridades_diarias
  const { data: prioridadesHoyRaw } = await supabase
    .from("prioridades_diarias")
    .select("id, empresa_id, nombre_empresa, industria, score, razon, accion_sugerida, urgencia")
    .eq("fecha", hoy)
    .eq("completada", false)
    .order("score", { ascending: false });

  // Prioridades de días anteriores no ejecutadas → aparecen en "Vencidas"
  const { data: prioridadesVencidasRaw } = await supabase
    .from("prioridades_diarias")
    .select("id, empresa_id, nombre_empresa, accion_sugerida, urgencia, fecha")
    .lt("fecha", hoy)
    .eq("completada", false)
    .order("fecha", { ascending: true }); // más antigua primero

  // Resumen del día y timestamp de generación (para la lógica de auto-trigger)
  const { data: metricaHoy } = await supabase
    .from("metricas_diarias")
    .select("prioridades_generadas_en, notas_dia")
    .eq("fecha", hoy)
    .maybeSingle();

  console.log("[METRICAS_HOY] prioridades_hoy ids/nombres:", (prioridadesHoyRaw ?? []).map((p) => `${p.empresa_id}:${p.nombre_empresa}`));

  return NextResponse.json(
    {
      contactos_hoy: contactos,
      meta: META,
      racha_actual: racha,
      llamadas_hoy: llamadas,
      ganados_mes: ganados,
      reactivaciones: (reactivaciones ?? []) as Empresa[],
      prioridades_hoy: prioridadesHoyRaw ?? [],
      prioridades_vencidas_ia: prioridadesVencidasRaw ?? [],
      prioridades_generadas_en: metricaHoy?.prioridades_generadas_en ?? null,
      resumen_dia_cache: metricaHoy?.notas_dia ?? null,
      tareas_pendientes: tareasPendientes,
      tareas_realizadas: tareasRealizadas,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
