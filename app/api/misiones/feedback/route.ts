// =============================================================
// POST /api/misiones/feedback — Guarda el resultado del día
// para cada empresa priorizada. Sin costo de IA; solo persiste
// lo que el vendedor reportó con un clic por empresa.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ResultadoMision } from "@/lib/types";

interface ItemFeedback {
  empresa_id: string;
  accion_sugerida: string;
  resultado: ResultadoMision;
  detalle?: string;
}

interface BodyFeedback {
  misiones: ItemFeedback[];
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const { misiones } = (await req.json()) as BodyFeedback;

  if (!Array.isArray(misiones) || misiones.length === 0) {
    return NextResponse.json({ error: "misiones requerido" }, { status: 400 });
  }

  const supabase = getSupabase();
  const hoy = new Date().toISOString().split("T")[0];

  // Borrar misiones previas de hoy para estas empresas y volver a insertar
  // (permite que el vendedor corrija si reportó mal)
  const empresaIds = misiones.map((m) => m.empresa_id);
  await supabase
    .from("misiones_diarias")
    .delete()
    .eq("fecha", hoy)
    .in("empresa_id", empresaIds);

  const rows = misiones.map((m) => ({
    empresa_id: m.empresa_id,
    fecha: hoy,
    accion_sugerida: m.accion_sugerida,
    resultado: m.resultado,
    detalle_vendedor: m.detalle?.trim() || null,
    feedback_ia: null,
  }));

  const { error } = await supabase.from("misiones_diarias").insert(rows);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, guardadas: rows.length });
}
