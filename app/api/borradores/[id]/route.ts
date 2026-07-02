// =============================================================
// PATCH /api/borradores/[id]
// Marca un borrador como usado (usado: true).
// Se llama desde tab-preparacion al presionar "Marcar como usado".
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json() as { usado?: boolean };

  if (typeof body.usado !== "boolean") {
    return NextResponse.json({ error: "Se requiere campo 'usado' (boolean)" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("borradores")
    .update({ usado: body.usado })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
