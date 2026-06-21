// =============================================================
// POST /api/empresas/[id]/chat — Chat contextual persistente.
// Persiste cada pregunta/respuesta en chat_empresa.
// DELETE /api/empresas/[id]/chat — Limpia el historial.
// GET  /api/empresas/[id]/chat — Carga historial guardado.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  getEmpresaCompleta,
  getHistorialResumido,
  getChatHistorial,
  insertChatMensaje,
  limpiarChatEmpresa,
} from "@/lib/queries";
import { registrarUso } from "@/lib/registrarUso";
import { SYSTEM_PROMPT_VALE } from "@/lib/prompts";

export const maxDuration = 60;

// ── GET — cargar historial guardado ──────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const historial = await getChatHistorial(params.id);
  return NextResponse.json({ historial });
}

// ── DELETE — limpiar historial ────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await limpiarChatEmpresa(params.id);
  return NextResponse.json({ ok: true });
}

// ── POST — enviar mensaje y obtener respuesta ─────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });
  }

  const { id } = params;
  const { mensaje } = (await req.json()) as { mensaje: string };

  if (!mensaje?.trim()) {
    return NextResponse.json({ error: "mensaje requerido" }, { status: 400 });
  }

  // Cargar contexto de la empresa + historial de chat guardado en paralelo
  const [empresa, historialInteracciones, historialChat] = await Promise.all([
    getEmpresaCompleta(id),
    getHistorialResumido(id),
    getChatHistorial(id, 20),
  ]);

  if (!empresa) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const ficha = empresa.ficha_ia;

  const contactosResumen =
    empresa.contactos.length > 0
      ? empresa.contactos
          .map((c) => `- ${c.nombre} (${c.cargo ?? "sin cargo"}, ${c.area ?? "sin área"})`)
          .join("\n")
      : "Sin contactos registrados aún.";

  const decisoresResumen =
    ficha?.decisores && ficha.decisores.length > 0
      ? ficha.decisores
          .map(
            (d) =>
              `- ${d.cargo}: ${d.dolor_especifico ?? d.por_que_es_clave ?? ""} | Query LinkedIn: ${d.query_linkedin}`
          )
          .join("\n")
      : "Sin análisis de decisores disponible.";

  const systemPrompt = `Eres el copiloto comercial de un vendedor B2B de etiquetas autoadhesivas e imprenta industrial en Chile. Tienes acceso completo al historial y análisis de esta cuenta.

Responde preguntas específicas sobre cómo avanzar con esta empresa. Sé directo, práctico y breve. Máximo 5 líneas por respuesta. Usa el contexto real de la cuenta — nunca respondas con generalidades.

Si te piden redactar un mensaje, hazlo listo para copiar y pegar. Si te piden una estrategia, dame 3 pasos concretos. Si la pregunta no tiene respuesta con la información disponible, dilo y sugiere qué dato obtener primero.

━━━ CONTEXTO DE LA CUENTA ━━━

EMPRESA: ${empresa.nombre}
INDUSTRIA: ${empresa.industria ?? "No especificada"}
ESTADO EN EL PIPELINE: ${empresa.estado}
SCORE DE PRIORIDAD: ${empresa.score_prioridad}/100
RAZÓN DE CONTACTO ACTUAL: ${empresa.razon_de_contacto_actual ?? "Sin definir"}

NOTAS DEL VENDEDOR:
${empresa.notas_vendedor ?? "Sin notas."}

RESUMEN EJECUTIVO (análisis IA):
${ficha?.resumen_ejecutivo ?? "Sin ficha de IA disponible."}

ÁNGULO DE ENTRADA RECOMENDADO:
${ficha?.angulo_entrada ?? "Sin definir."}

TÉCNICA DE VENTA RECOMENDADA: ${ficha?.tecnica_recomendada ?? "Sin definir"}
RAZÓN: ${ficha?.razon_tecnica ?? ""}

DECISORES SUGERIDOS POR LA IA:
${decisoresResumen}

CONTACTOS REGISTRADOS:
${contactosResumen}

HISTORIAL DE INTERACCIONES (últimas 5):
${historialInteracciones}

OBJECIONES PROBABLES:
${
  ficha?.objeciones_probables && ficha.objeciones_probables.length > 0
    ? ficha.objeciones_probables
        .map((o) => `- "${o.objecion}" → ${o.como_responderla}`)
        .join("\n")
    : "Sin análisis de objeciones disponible."
}

INTELIGENCIA COMERCIAL ADICIONAL:
${ficha?.inteligencia_comercial ?? "Sin inteligencia comercial adicional."}`;

  // Reconstruir historial de chat guardado como mensajes Anthropic
  const mensajesHistorial: Anthropic.MessageParam[] = historialChat.flatMap((h) => [
    { role: "user" as const, content: h.pregunta },
    { role: "assistant" as const, content: h.respuesta },
  ]);

  const mensajes: Anthropic.MessageParam[] = [
    ...mensajesHistorial,
    { role: "user", content: mensaje.trim() },
  ];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: `${SYSTEM_PROMPT_VALE}\n\n${systemPrompt}`,
    messages: mensajes,
  });

  const textContent = response.content.find((c) => c.type === "text");
  const respuesta =
    textContent?.type === "text" ? textContent.text : "Sin respuesta de la IA.";
  registrarUso({ api: "claude", endpoint: "claude-haiku-4-5-20251001", input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens, empresa_id: id });

  // Persistir pregunta + respuesta
  await insertChatMensaje({
    empresa_id: id,
    pregunta: mensaje.trim(),
    respuesta,
  });

  return NextResponse.json({ respuesta });
}
