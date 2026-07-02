// =============================================================
// PATCH /api/borradores/[id]
// Actualiza un borrador: marca como usado y/o guarda el motivo
// de rechazo para que Claude no repita los mismos errores.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json() as { usado?: boolean; feedback_rechazo?: string };

  const cambios: Record<string, unknown> = {};
  if (typeof body.usado === "boolean") cambios.usado = body.usado;
  if (typeof body.feedback_rechazo === "string") {
    cambios.feedback_rechazo = body.feedback_rechazo.trim() || null;
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Sin cambios válidos (usado o feedback_rechazo)" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("borradores")
    .update(cambios)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
