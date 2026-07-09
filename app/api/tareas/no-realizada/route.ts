// =============================================================
// POST /api/tareas/no-realizada
// Cierra una tarea/prioridad sin interacción real: el vendedor
// indica que no la realizó. Desaparecerá al día siguiente.
// Body: { tarea_id: string, origen: 'manual' | 'ia' }
// Response: { ok: true }
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const body = await req.json() as { tarea_id?: string; origen?: "manual" | "ia" };
  const { tarea_id, origen } = body;

  if (!tarea_id || !origen) {
    return NextResponse.json(
      { error: "tarea_id y origen son requeridos" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  if (origen === "manual") {
    const { error } = await supabase
      .from("interacciones")
      .update({ resuelta: true, no_realizada: true })
      .eq("id", tarea_id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("prioridades_diarias")
      .update({
        completada: true,
        completada_en: new Date().toISOString(),
        no_realizada: true,
      })
      .eq("id", tarea_id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
