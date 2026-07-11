// =============================================================
// GET /api/cadencias — Plantillas de cadencia activas con sus
// pasos, para el selector de UI (preview se calcula en cliente
// con adaptarCadencia, que es pura). Sin IA, solo lectura.
// =============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { CadenciaPlantilla, CadenciaPaso } from "@/lib/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Dos queries separadas + Map — nunca joins de Supabase
  const [{ data: cadenciasRaw, error: e1 }, { data: pasosRaw, error: e2 }] = await Promise.all([
    supabase.from("cadencias").select("*").eq("activa", true).order("nombre"),
    supabase.from("cadencia_pasos").select("*").order("orden", { ascending: true }),
  ]);

  if (e1 || e2) {
    return NextResponse.json({ error: e1?.message ?? e2?.message }, { status: 500 });
  }

  const pasosPorCadencia = new Map<string, CadenciaPaso[]>();
  for (const p of (pasosRaw ?? []) as CadenciaPaso[]) {
    const arr = pasosPorCadencia.get(p.cadencia_id) ?? [];
    arr.push(p);
    pasosPorCadencia.set(p.cadencia_id, arr);
  }

  const cadencias = ((cadenciasRaw ?? []) as CadenciaPlantilla[]).map((c) => ({
    ...c,
    pasos: pasosPorCadencia.get(c.id) ?? [],
  }));

  return NextResponse.json({ cadencias });
}
