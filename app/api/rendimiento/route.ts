// =============================================================
// GET /api/rendimiento — Carga métricas ejecutivas y últimas
// 8 evaluaciones semanales. Sin costo de IA; solo lectura.
// =============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getEvaluacionesSemana, getRendimientoEjecutivo } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 30);
  const hace30Str = hace30.toISOString().split("T")[0];

  // Calcular cumplimiento de tareas desde interacciones reales (últimos 30 días).
  // No depende de evaluaciones_semanales, así que siempre hay datos útiles.
  const [rendimiento, evaluaciones, { data: tareasRaw }] = await Promise.all([
    getRendimientoEjecutivo(),
    getEvaluacionesSemana(8),
    supabase
      .from("interacciones")
      .select("resuelta, no_realizada")
      .not("proximo_paso", "is", null)
      .gte("proximo_paso_fecha", hace30Str),
  ]);

  const total = tareasRaw?.length ?? 0;
  const resueltas = (tareasRaw ?? []).filter(
    (r) => r.resuelta === true && r.no_realizada !== true
  ).length;
  const cumplimiento_tareas = {
    total,
    resueltas,
    porcentaje: total > 0 ? Math.round((resueltas / total) * 100) : null,
  };

  return NextResponse.json({ rendimiento, evaluaciones, cumplimiento_tareas });
}
