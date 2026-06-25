// DELETE /api/interacciones/[id]  — Elimina una interacción.
// PATCH  /api/interacciones/[id]  — Actualiza tipo, contacto, fecha, resumen, sentimiento.

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { TipoInteraccion, SentimientoInteraccion } from "@/lib/types";

const TIPOS_VALIDOS: TipoInteraccion[] = ["llamada", "email", "whatsapp", "linkedin", "reunion", "sin_respuesta"];
const SENTIMIENTOS_VALIDOS: SentimientoInteraccion[] = ["positivo", "neutro", "negativo", "sin_respuesta"];

export async function PATCH(
  req: NextRequest,
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

  const body = await req.json() as Record<string, unknown>;
  const { tipo, contacto_id, fecha, texto, sentimiento, resuelta } = body;

  const cambios: Record<string, unknown> = {};
  if (typeof tipo === "string" && TIPOS_VALIDOS.includes(tipo as TipoInteraccion)) {
    cambios.tipo = tipo;
  }
  if (contacto_id !== undefined) {
    cambios.contacto_id = typeof contacto_id === "string" ? contacto_id || null : null;
  }
  if (typeof fecha === "string") {
    cambios.fecha = new Date(fecha).toISOString();
  }
  if (typeof texto === "string") {
    cambios.transcripcion = texto.trim() || null;
    cambios.resumen_ia = null; // limpia resumen de IA para que muestre el texto editado
  }
  if (typeof sentimiento === "string") {
    cambios.sentimiento = SENTIMIENTOS_VALIDOS.includes(sentimiento as SentimientoInteraccion)
      ? sentimiento
      : null;
  }
  if (typeof resuelta === "boolean") {
    cambios.resuelta = resuelta;
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Sin campos para actualizar" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("interacciones")
    .update(cambios)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, interaccion: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[DELETE interaccion] SUPABASE_SERVICE_ROLE_KEY no configurada");
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY no configurada" }, { status: 500 });
  }

  const { id } = params;
  console.log(`[DELETE interaccion] id recibido: "${id}"`);

  if (!id) {
    return Response.json({ error: "id requerido" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error, count } = await supabase
    .from("interacciones")
    .delete({ count: "exact" })
    .eq("id", id);

  console.log(`[DELETE interaccion] resultado: filas eliminadas=${count ?? "??"} error=${error?.message ?? "ninguno"}`);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, count });
}
