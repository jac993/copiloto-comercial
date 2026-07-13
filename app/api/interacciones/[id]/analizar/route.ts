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
import { PROMPT_COACH_ESCRITO, SYSTEM_PROMPT_VALE } from "@/lib/prompts";
import { registrarUso } from "@/lib/registrarUso";
import { extraerJsonSeguro } from "@/lib/json-parser";
import { hoyCL, resolverFechaSeguimiento } from "@/lib/fecha";
import type { ResultadoAnalisis } from "@/lib/types";

export const maxDuration = 60;

const TIPO_LABEL: Record<string, string> = {
  llamada: "Transcripción de llamada",
  email: "Correo electrónico",
  linkedin: "Conversación de LinkedIn",
  whatsapp: "Conversación de WhatsApp",
  sin_respuesta: "Sin respuesta",
};

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

    // Ancla temporal: permite a Claude resolver fechas relativas del prospecto
    // ("el jueves 17", "la próxima semana") contra el día real en Chile.
    const hoy = hoyCL();
    const diaSemana = new Date(hoy + "T12:00:00Z").toLocaleDateString("es-CL", { weekday: "long", timeZone: "America/Santiago" });

    const mensajeAnalisis = `
EMPRESA: ${empresa.nombre}
INDUSTRIA: ${empresa.industria ?? "No especificada"}
ESTADO EN EL PIPELINE: ${empresa.estado}

FICHA COMERCIAL:
${fichaResumen}

HISTORIAL DE INTERACCIONES PREVIAS:
${historial}

---
TIPO DE INTERACCIÓN: ${TIPO_LABEL[interaccion.tipo] ?? interaccion.tipo}
FECHA: ${new Date(interaccion.fecha).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}
HOY (Chile): ${hoy} (${diaSemana})

CONTENIDO A ANALIZAR:
${texto}
`.trim();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: `${SYSTEM_PROMPT_VALE}\n\n${PROMPT_COACH_ESCRITO}`,
      messages: [{ role: "user", content: mensajeAnalisis }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") throw new Error("Claude no devolvió texto");
    registrarUso({ api: "claude", endpoint: "claude-sonnet-4-6", input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens, empresa_id: interaccion.empresa_id });

    const resultado = extraerJsonSeguro<ResultadoAnalisis>(textContent.text);
    if (resultado === null) {
      throw new Error("Error parseando respuesta de IA. Intenta de nuevo.");
    }

    const { fecha: proximoPasoFecha, motivo: motivoFechaSugerida } = resolverFechaSeguimiento({
      fechaMencionada: resultado.fecha_mencionada,
      diasHabilesSugeridos: resultado.dias_habiles_sugeridos,
      motivo: resultado.motivo_fecha_sugerida,
      hayCompromisos: resultado.compromisos.length > 0,
    });

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
      motivo_fecha_sugerida: motivoFechaSugerida || null,
      badge_estado: resultado.badge_estado ?? null,
      decision_sugerida: resultado.decision_sugerida ?? null,
    });

    return NextResponse.json({ ok: true, interaccion: actualizada, resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
