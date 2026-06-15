// DELETE /api/interacciones/[id]
// Elimina una interacción de la base de datos.
// Solo elimina si la interacción pertenece a una empresa del usuario.

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY no configurada" }, { status: 500 });
  }

  const { id } = params;
  if (!id) {
    return Response.json({ error: "id requerido" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await supabase
    .from("interacciones")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
