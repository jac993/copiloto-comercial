// =============================================================
// GET /api/interacciones/feed
// Devuelve todas las interacciones de los últimos N días
// con el nombre de la empresa incluido. Usado por el
// feed global /llamadas (renombrado a "Interacciones").
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Interaccion, Empresa } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface InteraccionFeed extends Interaccion {
  empresa_nombre: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const dias = parseInt(searchParams.get("dias") ?? "7", 10);

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: interacciones, error } = await supabase
    .from("interacciones")
    .select("*")
    .gte("fecha", desde.toISOString())
    .order("fecha", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!interacciones || interacciones.length === 0) {
    return NextResponse.json({ interacciones: [] });
  }

  // Cargar nombres de empresas únicas
  const empresaIds = Array.from(new Set((interacciones as Interaccion[]).map((i) => i.empresa_id)));
  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, nombre")
    .in("id", empresaIds);

  const nombreMap = new Map<string, string>();
  (empresas ?? []).forEach((e: Pick<Empresa, "id" | "nombre">) => nombreMap.set(e.id, e.nombre));

  const feed: InteraccionFeed[] = (interacciones as Interaccion[]).map((i) => ({
    ...i,
    empresa_nombre: nombreMap.get(i.empresa_id) ?? "Empresa desconocida",
  }));

  return NextResponse.json({ interacciones: feed });
}
