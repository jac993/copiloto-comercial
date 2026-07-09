// =============================================================
// GET /api/costos — Resumen de uso y costos de APIs del mes actual.
// Usa service role server-side (no expone keys). Lo consume el panel
// de "Costos y uso" dentro de Configuración (client component).
// =============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

interface ResumenApi {
  api: string;
  total_usd: number;
  llamadas: number;
}

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  // Resumen por API del mes actual
  const { data: rawMes } = await supabase
    .from("api_usage")
    .select("api, costo_usd")
    .gte("created_at", inicioMes.toISOString());

  // Últimas 20 llamadas
  const { data: ultimas } = await supabase
    .from("api_usage")
    .select("id, created_at, api, endpoint, input_tokens, output_tokens, audio_seconds, costo_usd")
    .order("created_at", { ascending: false })
    .limit(20);

  const resumenMap = new Map<string, ResumenApi>();
  for (const row of rawMes ?? []) {
    const entry = resumenMap.get(row.api) ?? { api: row.api, total_usd: 0, llamadas: 0 };
    entry.total_usd += row.costo_usd ?? 0;
    entry.llamadas += 1;
    resumenMap.set(row.api, entry);
  }
  const resumen = Array.from(resumenMap.values()).sort((a, b) => b.total_usd - a.total_usd);
  const totalMes = resumen.reduce((acc, r) => acc + r.total_usd, 0);

  return NextResponse.json({
    resumen,
    totalMes,
    totalLlamadas: (rawMes ?? []).length,
    ultimas: ultimas ?? [],
  });
}
