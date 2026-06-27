// PATCH /api/empresas/[id]/pausar
// Pausa o reactiva la conversación de una empresa.
// { pausar: true }  → conversacion_pausada_at = now()
// { pausar: false } → conversacion_pausada_at = null

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY no configurada" }, { status: 500 });
  }

  const { id } = params;
  const body = await req.json() as { pausar: boolean };

  if (typeof body.pausar !== "boolean") {
    return NextResponse.json({ error: "pausar (boolean) requerido" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from("empresas")
    .update({ conversacion_pausada_at: body.pausar ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id, conversacion_pausada_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, empresa: data });
}
