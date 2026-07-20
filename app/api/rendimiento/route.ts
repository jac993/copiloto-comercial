// =============================================================
// GET /api/rendimiento — Carga métricas ejecutivas y últimas
// 8 evaluaciones semanales. Sin costo de IA; solo lectura.
// =============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getEvaluacionesSemana, getRendimientoEjecutivo } from "@/lib/queries";
import { hoyCL } from "@/lib/fecha";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const hace30 = new Date(hoyCL() + "T12:00:00Z");
  hace30.setUTCDate(hace30.getUTCDate() - 30);
  const hace30Str = hace30.toISOString().split("T")[0];

  // Calcular cumplimiento de tareas de los últimos 30 días combinando:
  // • tareas manuales (interacciones con proximo_paso)
  // • prioridades de IA (prioridades_diarias)
  // No depende de evaluaciones_semanales, así que siempre hay datos útiles.
  // Primer día del mes actual (calendario chileno) — ventana de "ganado este mes"
  const inicioMes = hoyCL().slice(0, 8) + "01";

  const [rendimiento, evaluaciones, { data: tareasRaw }, { data: prioRaw }, { data: empresasRaw }] =
    await Promise.all([
      getRendimientoEjecutivo(),
      getEvaluacionesSemana(8),
      supabase
        .from("interacciones")
        .select("resuelta, no_realizada")
        .not("proximo_paso", "is", null)
        .gte("proximo_paso_fecha", hace30Str),
      supabase
        .from("prioridades_diarias")
        .select("completada, no_realizada")
        .gte("fecha", hace30Str),
      // Montos del pipeline: estado_desde registra cuándo entró a "ganado"
      supabase
        .from("empresas")
        .select("estado, estado_desde, valor_estimado_clp")
        .not("valor_estimado_clp", "is", null),
    ]);

  const manualTotal = tareasRaw?.length ?? 0;
  const manualHechas = (tareasRaw ?? []).filter(
    (r) => r.resuelta === true && r.no_realizada !== true
  ).length;
  const manualNoRealizadas = (tareasRaw ?? []).filter((r) => r.no_realizada === true).length;

  const iaTotal = prioRaw?.length ?? 0;
  const iaHechas = (prioRaw ?? []).filter(
    (r) => r.completada === true && r.no_realizada !== true
  ).length;
  const iaNoRealizadas = (prioRaw ?? []).filter((r) => r.no_realizada === true).length;

  const total = manualTotal + iaTotal;
  const resueltas = manualHechas + iaHechas;
  const no_realizadas = manualNoRealizadas + iaNoRealizadas;
  const cumplimiento_tareas = {
    total,
    resueltas,
    no_realizadas,
    pendientes: total - resueltas - no_realizadas,
    porcentaje: total > 0 ? Math.round((resueltas / total) * 100) : null,
  };

  // Montos: ganado este mes (entró a "ganado" desde el día 1) vs pipeline
  // abierto (todas las etapas activas). Cero IA — suma directa en memoria.
  let ganadoMes = 0;
  let pipelineAbierto = 0;
  for (const e of empresasRaw ?? []) {
    const valor = e.valor_estimado_clp as number;
    if (e.estado === "ganado") {
      const desde = e.estado_desde as string | null;
      if (desde && desde >= inicioMes) ganadoMes += valor;
    } else if (e.estado !== "perdido") {
      pipelineAbierto += valor;
    }
  }
  const montos = { ganado_mes: ganadoMes, pipeline_abierto: pipelineAbierto };

  return NextResponse.json({ rendimiento, evaluaciones, cumplimiento_tareas, montos });
}
