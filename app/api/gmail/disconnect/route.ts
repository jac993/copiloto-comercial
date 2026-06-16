// POST /api/gmail/disconnect — Desactiva la integración Gmail
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await supabase
    .from("integraciones")
    .update({ activo: false })
    .eq("tipo", "gmail");

  return NextResponse.json({ ok: true });
}
