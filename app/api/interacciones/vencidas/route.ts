// GET /api/interacciones/vencidas
// Devuelve interacciones de tipo whatsapp/email/linkedin cuyo plazo de 48h
// ya venció (fecha + 48h < ahora) dentro de los últimos 7 días.
// Usado por el badge global de alertas y la página /alertas.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calcularCadencia, type InteraccionCadencia } from "@/lib/cadencia";
import type { InteraccionVencida } from "@/lib/types";

// Sin esto, Next.js puede tratar este GET() sin parámetros como estático
// y cachear la respuesta en el Full Route Cache — el badge de alertas
// quedaría congelado en producción aunque el cliente reintente el poll.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const ahora = Date.now();
  const limite48h = new Date(ahora - 48 * 60 * 60 * 1000).toISOString();
  const limite7d  = new Date(ahora - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Obtener IDs de empresas con conversación pausada para excluirlas
  const { data: pausadas } = await supabase
    .from("empresas")
    .select("id")
    .not("conversacion_pausada_at", "is", null);
  const idsPausadas = (pausadas ?? []).map((e) => e.id as string);

  let query = supabase
    .from("interacciones")
    .select("id, empresa_id, tipo, fecha, transcripcion, contacto_id, empresas(nombre)")
    .in("tipo", ["whatsapp", "email", "linkedin"])
    .eq("resuelta", false)
    .lt("fecha", limite48h)
    .gt("fecha", limite7d)
    .order("fecha", { ascending: false });

  if (idsPausadas.length > 0) {
    query = query.not("empresa_id", "in", `(${idsPausadas.join(",")})`);
  }

  const { data, error } = await query;

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

  // Cadencia por contacto: se calcula sobre TODO el historial de cada contacto
  // involucrado (no solo la fila vencida) y se adjunta a cada alerta.
  const contactoIds = Array.from(
    new Set(vencidas.map((v) => v.contacto_id).filter((id): id is string => !!id))
  );
  if (contactoIds.length > 0) {
    const { data: histRows } = await supabase
      .from("interacciones")
      .select("tipo, fecha, remitente, sentimiento, contacto_id")
      .in("contacto_id", contactoIds)
      .order("fecha", { ascending: true });

    const porContacto = new Map<string, InteraccionCadencia[]>();
    for (const r of (histRows ?? []) as InteraccionCadencia[]) {
      if (!r.contacto_id) continue;
      const lista = porContacto.get(r.contacto_id) ?? [];
      lista.push(r);
      porContacto.set(r.contacto_id, lista);
    }

    for (const v of vencidas) {
      if (!v.contacto_id) continue;
      v.cadencia = calcularCadencia(porContacto.get(v.contacto_id) ?? [], v.contacto_id);
    }
  }

  return NextResponse.json({ vencidas, total: vencidas.length });
}
