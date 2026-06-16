// =============================================================
// GET /api/gmail/callback — Recibe el código OAuth2 de Google,
// intercambia por tokens y guarda en tabla integraciones.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exchangeCode, getAccountEmail } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/configuracion?error=acceso_denegado`);
  }

  try {
    const tokens = await exchangeCode(code);
    const email = await getAccountEmail(tokens.access_token);

    const expiraEn = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Desactivar integraciones Gmail previas
    await supabase
      .from("integraciones")
      .update({ activo: false })
      .eq("tipo", "gmail");

    // Insertar nueva integración activa
    await supabase.from("integraciones").insert({
      tipo: "gmail",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      email,
      activo: true,
      expira_en: expiraEn,
    });

    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/configuracion?connected=true`);
  } catch (err) {
    console.error("[gmail/callback]", err);
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/configuracion?error=fallo_oauth`);
  }
}
