// =============================================================
// POST /api/gmail/send — Envía un correo ya aprobado por el vendedor.
// Modo copiloto: esta ruta solo se llama desde un clic explícito en
// "Aprobar y enviar"; nunca hay envíos automáticos.
// Después de enviar: marca el borrador como usado (si vino) y registra
// la interacción tipo email para que el CRM quede al día sin tipear.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, refreshAccessToken } from "@/lib/gmail";
import { insertInteraccion } from "@/lib/queries";
import type { Integracion, InteraccionInsert } from "@/lib/types";

export const dynamic = "force-dynamic";

// Cuenta única autorizada en OAuth; se usa si la integración no guardó email.
const REMITENTE_POR_DEFECTO = "jac@onelabel.cl";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface SendBody {
  empresaId: string;
  borradorId?: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}

export async function POST(req: NextRequest) {
  let payload: SendBody;
  try {
    payload = await req.json() as SendBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
  }

  const { empresaId, borradorId, to, subject, body, threadId } = payload;
  if (!empresaId || !to?.trim() || !subject?.trim() || !body?.trim()) {
    return NextResponse.json(
      { error: "Faltan datos: empresaId, destinatario, asunto y cuerpo son obligatorios" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  // ── Cargar integración y asegurar token vigente ──────────
  // Misma lógica que /api/gmail/sync: refresca si expira en < 5 min.
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

  try {
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
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error al refrescar token de Gmail";
    return NextResponse.json({ error: mensaje }, { status: 502 });
  }

  // ── Enviar ────────────────────────────────────────────────
  let enviado: { messageId: string; threadId: string };
  try {
    enviado = await sendEmail(accessToken, {
      to,
      subject,
      body,
      threadId,
      from: integracion.email ?? REMITENTE_POR_DEFECTO,
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "No se pudo enviar el correo";
    return NextResponse.json({ error: mensaje }, { status: 502 });
  }

  // ── Registrar en el CRM ───────────────────────────────────
  // El correo YA salió: si algo falla aquí no devolvemos error (el usuario
  // reintentaría y enviaría un duplicado). Se informa en `advertencias`.
  const advertencias: string[] = [];

  if (borradorId) {
    const { error } = await supabase
      .from("borradores")
      .update({ usado: true })
      .eq("id", borradorId);
    if (error) advertencias.push(`No se pudo marcar el borrador como usado: ${error.message}`);
  }

  // interacciones no tiene columnas descripcion ni gmail_thread_id: el texto
  // va en transcripcion (igual que /api/interacciones/crear para emails).
  const interaccion: InteraccionInsert = {
    empresa_id: empresaId,
    contacto_id: null,
    parent_id: null,
    tipo: "email",
    fecha: new Date().toISOString(),
    audio_url: null,
    transcripcion: `Email enviado: ${subject.trim()}\n\n${body.trim()}`,
    resumen_ia: null,
    compromisos: null,
    sentimiento: null,
    tecnica_usada: null,
    coaching_ia: null,
    proximo_paso: null,
    proximo_paso_fecha: null,
    badge_estado: null,
    decision_sugerida: null,
    remitente: "vendedor",
    // Mensaje del vendedor = queda esperando respuesta del prospecto.
    resuelta: false,
    no_realizada: false,
  };

  try {
    await insertInteraccion(interaccion);
  } catch (err) {
    advertencias.push(err instanceof Error ? err.message : "No se pudo registrar la interacción");
  }

  return NextResponse.json({
    ok: true,
    messageId: enviado.messageId,
    threadId: enviado.threadId,
    ...(advertencias.length > 0 ? { advertencias } : {}),
  });
}
