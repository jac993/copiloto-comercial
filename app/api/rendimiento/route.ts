// =============================================================
// GET /api/rendimiento — Carga métricas ejecutivas y últimas
// 8 evaluaciones semanales. Sin costo de IA; solo lectura.
// =============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getEvaluacionesSemana, getRendimientoEjecutivo } from "@/lib/queries";
import { hoyCL } from "@/lib/fecha";

export const dynamic = "force-dynamic";

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
  const [rendimiento, evaluaciones, { data: tareasRaw }, { data: prioRaw }] = await Promise.all([
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

  return NextResponse.json({ rendimiento, evaluaciones, cumplimiento_tareas });
}
