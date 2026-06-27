// GET /api/interacciones/vencidas
// Devuelve interacciones de tipo whatsapp/email/linkedin cuyo plazo de 48h
// ya venció (fecha + 48h < ahora) dentro de los últimos 7 días.
// Usado por el badge global de alertas y la página /alertas.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { InteraccionVencida } from "@/lib/types";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const ahora = Date.now();
  const limite48h = new Date(ahora - 48 * 60 * 60 * 1000).toISOString();
  const limite7d  = new Date(ahora - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("interacciones")
    .select("id, empresa_id, tipo, fecha, transcripcion, contacto_id, empresas(nombre, conversacion_pausada_at)")
    .in("tipo", ["whatsapp", "email", "linkedin"])
    .eq("resuelta", false)
    .is("empresas.conversacion_pausada_at", null)
    .lt("fecha", limite48h)
    .gt("fecha", limite7d)
    .order("fecha", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const vencidas: InteraccionVencida[] = (data ?? []).map((row) => ({
    id: row.id as string,
    empresa_id: row.empresa_id as string,
    empresa_nombre: (row.empresas as unknown as { nombre: string } | null)?.nombre ?? "Empresa",
    tipo: row.tipo as InteraccionVencida["tipo"],
    fecha: row.fecha as string,
    transcripcion: row.transcripcion as string | null,
    contacto_id: row.contacto_id as string | null,
  }));

  return NextResponse.json({ vencidas, total: vencidas.length });
}
