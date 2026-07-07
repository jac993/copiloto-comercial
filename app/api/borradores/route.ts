// =============================================================
// GET /api/borradores
// Retorna el último borrador no usado para una combinación
// empresa + contacto + canal. Usado por tab-chat (tab "Consultar")
// para cargar el borrador guardado sin gastar créditos de IA.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { BorradorCanalResult } from "@/app/api/preparacion/route";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const empresaId = searchParams.get("empresaId");
  const contactoId = searchParams.get("contactoId");
  const canal = searchParams.get("canal");

  if (!empresaId || !canal) {
    return NextResponse.json({ borrador: null });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let query = supabase
    .from("borradores")
    .select("id, contenido, tipo, canal, creado_en")
    .eq("empresa_id", empresaId)
    .eq("canal", canal)
    .eq("usado", false)
    .order("creado_en", { ascending: false })
    .limit(1);

  if (contactoId && contactoId !== "null") {
    query = query.eq("contacto_id", contactoId);
  } else {
    query = query.is("contacto_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return NextResponse.json({ borrador: null });

  let borradorData: BorradorCanalResult;
  try {
    borradorData = JSON.parse(data.contenido as string) as BorradorCanalResult;
  } catch {
    return NextResponse.json({ borrador: null });
  }

  return NextResponse.json({
    id: data.id,
    borrador: borradorData,
    tipo: data.tipo,
    creado_en: data.creado_en,
  });
}
