// DELETE /api/chat-mensaje/[id]
// Elimina un par pregunta/respuesta individual del historial de chat.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY no configurada" }, { status: 500 });
  }

  const { id } = params;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await supabase.from("chat_empresa").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
