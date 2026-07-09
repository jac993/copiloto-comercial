// GET /api/gmail/status — Estado de la integración Gmail
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Integracion } from "@/lib/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await supabase
    .from("integraciones")
    .select("email, activo, actualizado_en")
    .eq("tipo", "gmail")
    .eq("activo", true)
    .maybeSingle();

  if (!data) return NextResponse.json({ conectado: false });

  const integracion = data as Pick<Integracion, "email" | "activo" | "actualizado_en">;
  return NextResponse.json({
    conectado: true,
    email: integracion.email,
    ultimo_sync: integracion.actualizado_en,
  });
}
