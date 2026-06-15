// =============================================================
// GET /api/rendimiento — Carga métricas ejecutivas y últimas
// 8 evaluaciones semanales. Sin costo de IA; solo lectura.
// =============================================================

import { NextResponse } from "next/server";
import { getEvaluacionesSemana, getRendimientoEjecutivo } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const [rendimiento, evaluaciones] = await Promise.all([
    getRendimientoEjecutivo(),
    getEvaluacionesSemana(8),
  ]);

  return NextResponse.json({ rendimiento, evaluaciones });
}
