// =============================================================
// GET /api/gmail/sync — Busca correos de las últimas 48h y
// los cruza con dominios de empresas activas en el pipeline.
// Guarda matches en correos_detectados.
// =============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getRecentMessages,
  refreshAccessToken,
  extractDomain,
  extractSenderDomain,
} from "@/lib/gmail";
import type { Empresa, Integracion } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  const supabase = getSupabase();

  // ── Cargar integración activa ────────────────────────────
  const { data: intData } = await supabase
    .from("integraciones")
    .select("*")
    .eq("tipo", "gmail")
    .eq("activo", true)
    .maybeSingle();

  if (!intData) {
    return NextResponse.json({ error: "Gmail no conectado. Ve a Configuración." }, { status: 400 });
  }

  const integracion = intData as Integracion;
  let accessToken = integracion.access_token;

  // Refrescar token si expiró o expira en menos de 5 minutos
  if (integracion.refresh_token) {
    const expira = integracion.expira_en ? new Date(integracion.expira_en).getTime() : 0;
    if (Date.now() > expira - 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(integracion.refresh_token);
      accessToken = refreshed.access_token;
      const nuevaExpiracion = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabase
        .from("integraciones")
        .update({ access_token: accessToken, expira_en: nuevaExpiracion, actualizado_en: new Date().toISOString() })
        .eq("id", integracion.id);
    }
  }

  // ── Cargar empresas activas con URL ──────────────────────
  const { data: empresasData } = await supabase
    .from("empresas")
    .select("id, nombre, url")
    .neq("estado", "perdido")
    .not("url", "is", null);

  const empresas = (empresasData ?? []) as Pick<Empresa, "id" | "nombre" | "url">[];

  // Mapa dominio → empresa_id
  const dominioMap = new Map<string, string>();
  for (const emp of empresas) {
    const dominio = extractDomain(emp.url);
    if (dominio) dominioMap.set(dominio, emp.id);
  }

  if (dominioMap.size === 0) {
    return NextResponse.json({ detectados: 0, mensaje: "No hay empresas activas con URL registrada." });
  }

  // ── Leer Gmail ───────────────────────────────────────────
  const mensajes = await getRecentMessages(accessToken, 48);

  let detectados = 0;
  const errores: string[] = [];

  for (const msg of mensajes) {
    const senderDomain = extractSenderDomain(msg.from);
    if (!senderDomain) continue;

    const empresaId = dominioMap.get(senderDomain);
    if (!empresaId) continue;

    // Parsear fecha del header (formato RFC 2822)
    let fechaISO: string;
    try {
      fechaISO = new Date(msg.date).toISOString();
    } catch {
      fechaISO = new Date().toISOString();
    }

    // Insertar ignorando duplicados (gmail_message_id es UNIQUE)
    const { error } = await supabase.from("correos_detectados").insert({
      empresa_id: empresaId,
      gmail_thread_id: msg.threadId,
      gmail_message_id: msg.id,
      asunto: msg.subject || null,
      remitente: msg.from || null,
      fecha: fechaISO,
      snippet: msg.snippet.slice(0, 200) || null,
      analizado: false,
    });

    if (error && !error.message.includes("duplicate")) {
      errores.push(`${msg.id}: ${error.message}`);
    } else if (!error) {
      detectados++;
    }
  }

  // Actualizar timestamp de último sync
  await supabase
    .from("integraciones")
    .update({ actualizado_en: new Date().toISOString() })
    .eq("id", integracion.id);

  return NextResponse.json({
    detectados,
    revisados: mensajes.length,
    errores: errores.length > 0 ? errores : undefined,
  });
}
