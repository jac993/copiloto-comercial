// =============================================================
// POST /api/interacciones/[id]/analizar
// Analiza con Claude una interacción ya guardada sin análisis.
// Lee la transcripcion del registro, carga el contexto de la
// empresa, llama a Claude y actualiza el registro con el resultado.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  getInteraccionById,
  getEmpresaCompleta,
  getHistorialResumido,
  updateInteraccion,
} from "@/lib/queries";
import { PROMPT_COACH_ESCRITO } from "@/lib/prompts";
import { registrarUso } from "@/lib/registrarUso";
import type { ResultadoAnalisis } from "@/lib/types";

export const maxDuration = 60;

const TIPO_LABEL: Record<string, string> = {
  llamada: "Transcripción de llamada",
  email: "Correo electrónico",
  linkedin: "Conversación de LinkedIn",
  whatsapp: "Conversación de WhatsApp",
  sin_respuesta: "Sin respuesta",
};

function sumarDiasHabiles(n: number): string {
  const fecha = new Date();
  let contados = 0;
  while (contados < n) {
    fecha.setDate(fecha.getDate() + 1);
    const dia = fecha.getDay();
    if (dia !== 0 && dia !== 6) contados++;
  }
  return fecha.toISOString().split("T")[0];
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const interaccion = await getInteraccionById(params.id);
    if (!interaccion) {
      return NextResponse.json({ error: "Interacción no encontrada" }, { status: 404 });
    }

    const texto = interaccion.transcripcion?.trim();
    if (!texto) {
      return NextResponse.json({ error: "Esta interacción no tiene texto para analizar" }, { status: 400 });
    }

    const [empresa, historial] = await Promise.all([
      getEmpresaCompleta(interaccion.empresa_id),
      getHistorialResumido(interaccion.empresa_id),
    ]);

    if (!empresa) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const fichaResumen = empresa.ficha_ia
      ? [
          `Resumen ejecutivo: ${empresa.ficha_ia.resumen_ejecutivo}`,
          `Ángulo de entrada: ${empresa.ficha_ia.angulo_entrada}`,
          `Técnica sugerida: ${empresa.ficha_ia.tecnica_recomendada} — ${empresa.ficha_ia.razon_tecnica}`,
        ].join("\n")
      : "Sin ficha de IA disponible.";

    const mensajeAnalisis = `
EMPRESA: ${empresa.nombre}
INDUSTRIA: ${empresa.industria ?? "No especificada"}
ESTADO EN EL PIPELINE: ${empresa.estado}
NOTAS DEL VENDEDOR: ${empresa.notas_vendedor ?? "Ninguna"}

FICHA COMERCIAL:
${fichaResumen}

HISTORIAL DE INTERACCIONES PREVIAS:
${historial}

---
TIPO DE INTERACCIÓN: ${TIPO_LABEL[interaccion.tipo] ?? interaccion.tipo}
FECHA: ${new Date(interaccion.fecha).toLocaleDateString("es-CL")}

CONTENIDO A ANALIZAR:
${texto}
`.trim();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: PROMPT_COACH_ESCRITO,
      messages: [{ role: "user", content: mensajeAnalisis }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") throw new Error("Claude no devolvió texto");
    registrarUso({ api: "claude", endpoint: "claude-sonnet-4-6", input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens, empresa_id: interaccion.empresa_id });

    let resultado: ResultadoAnalisis;
    try {
      const jsonLimpio = textContent.text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
      resultado = JSON.parse(jsonLimpio) as ResultadoAnalisis;
    } catch {
      throw new Error("Error parseando respuesta de IA. Intenta de nuevo.");
    }

    const proximoPasoFecha = resultado.compromisos.length > 0
      ? sumarDiasHabiles(3)
      : sumarDiasHabiles(7);

    const proximoPasoTexto = resultado.proximo_paso?.trim()
      || (resultado.compromisos[0]
        ? `${resultado.compromisos[0].quien}: ${resultado.compromisos[0].que}`
        : "Revisar resultado del análisis");

    const actualizada = await updateInteraccion(params.id, {
      resumen_ia: resultado.resumen,
      compromisos: resultado.compromisos.map((c) => ({
        descripcion: `${c.quien}: ${c.que}`,
        responsable: c.quien,
        fecha: c.cuando !== "sin fecha definida" ? c.cuando : null,
      })),
      sentimiento: resultado.sentimiento_prospecto,
      tecnica_usada: resultado.tecnica_recomendada,
      coaching_ia: JSON.stringify({
        coaching: resultado.coaching,
        senales_detectadas: resultado.senales_detectadas,
        lo_que_no_respondio: resultado.lo_que_no_respondio,
        borrador_respuesta: resultado.borrador_respuesta,
        estado_sugerido: resultado.estado_sugerido,
      }),
      proximo_paso: proximoPasoTexto,
      proximo_paso_fecha: proximoPasoFecha,
      badge_estado: resultado.badge_estado ?? null,
      decision_sugerida: resultado.decision_sugerida ?? null,
    });

    return NextResponse.json({ ok: true, interaccion: actualizada, resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
