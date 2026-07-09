// =============================================================
// POST /api/analizar-interaccion
// Recibe texto de una interacción (transcripción, correo, etc.),
// carga el contexto completo de la empresa, llama a Claude con
// PROMPT_COACH_ESCRITO y guarda el resultado en tabla interacciones.
// Para tipo "sin_respuesta": no llama a Claude, solo guarda registro.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  getEmpresaCompleta,
  getHistorialResumido,
  insertInteraccion,
} from "@/lib/queries";
import { PROMPT_COACH_ESCRITO, SYSTEM_PROMPT_VALE } from "@/lib/prompts";
import { extraerJsonSeguro, sanitizarTexto } from "@/lib/json-parser";
import { registrarUso } from "@/lib/registrarUso";
import type {
  ResultadoAnalisis,
  TipoInteraccion,
  InteraccionInsert,
} from "@/lib/types";

export const maxDuration = 60;

// Suma N días hábiles a partir de hoy (excluye sábado y domingo)
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

const TIPO_LABEL: Record<TipoInteraccion, string> = {
  llamada: "Transcripción de llamada",
  email: "Correo electrónico",
  linkedin: "Conversación de LinkedIn",
  whatsapp: "Conversación de WhatsApp",
  reunion: "Reunión presencial o videollamada",
  sin_respuesta: "Sin respuesta",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      empresa_id: string;
      contacto_id?: string;
      tipo: TipoInteraccion;
      texto?: string;
      audio_url?: string;
      asunto?: string; // para emails
      fecha?: string;  // ISO string — si el usuario cambió la fecha/hora
    };

    const { empresa_id, contacto_id, tipo, texto, audio_url, asunto, fecha } = body;

    if (!empresa_id || !tipo) {
      return NextResponse.json(
        { error: "empresa_id y tipo son requeridos" },
        { status: 400 }
      );
    }

    // ── CASO: sin_respuesta — solo registrar, sin llamar a Claude ──
    if (tipo === "sin_respuesta") {
      const interaccion = await insertInteraccion({
        empresa_id,
        contacto_id: contacto_id ?? null,
        parent_id: null,
        tipo,
        fecha: new Date().toISOString(),
        audio_url: null,
        transcripcion: null,
        resumen_ia: "Sin respuesta al intento de contacto.",
        compromisos: null,
        sentimiento: "sin_respuesta",
        tecnica_usada: null,
        coaching_ia: null,
        proximo_paso: "Intentar contacto nuevamente",
        proximo_paso_fecha: sumarDiasHabiles(5),
        badge_estado: "sin_respuesta",
        decision_sugerida: null,
        remitente: "vendedor",
        resuelta: false,
        no_realizada: false,
      });

      return NextResponse.json({ ok: true, interaccion_id: interaccion.id, resultado: null });
    }

    if (!texto?.trim()) {
      return NextResponse.json(
        { error: "texto requerido para analizar" },
        { status: 400 }
      );
    }

    // ── Cargar contexto completo de la empresa + historial previo ──
    const [empresa, historial] = await Promise.all([
      getEmpresaCompleta(empresa_id),
      getHistorialResumido(empresa_id),
    ]);

    if (!empresa) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    // ── Construir el mensaje con todo el contexto para Claude ──
    const fichaResumen = empresa.ficha_ia
      ? [
          `Resumen ejecutivo: ${empresa.ficha_ia.resumen_ejecutivo}`,
          `Ángulo de entrada: ${empresa.ficha_ia.angulo_entrada}`,
          `Técnica sugerida: ${empresa.ficha_ia.tecnica_recomendada} — ${empresa.ficha_ia.razon_tecnica}`,
        ].join("\n")
      : "Sin ficha de IA disponible.";

    const encabezadoEmail = asunto ? `Asunto: ${asunto}\n\n` : "";

    // Tope de 15.000 caracteres — mismo límite que regenerar/route.ts.
    // Sin esto, una transcripción de una llamada larga (30-60 min) puede
    // presionar la salida hacia el límite de max_tokens y cortar el JSON.
    const textoSanitizado = sanitizarTexto(texto.trim(), 15000);

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
TIPO DE INTERACCIÓN: ${TIPO_LABEL[tipo]}
FECHA: ${new Date(fecha ?? new Date()).toLocaleString("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}

CONTENIDO A ANALIZAR:
${encabezadoEmail}${textoSanitizado}

Responde ÚNICAMENTE con el JSON. Sin markdown, sin texto adicional, sin explicaciones fuera del JSON.
`.trim();

    // ── Llamar a Claude con el prompt de coaching ──
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      system: `${SYSTEM_PROMPT_VALE}\n\n${PROMPT_COACH_ESCRITO}`,
      messages: [{ role: "user", content: mensajeAnalisis }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("Claude no devolvió texto");
    }
    console.log(`[analizar-interaccion] Claude respondió: ${textContent.text.length} chars | stop_reason: ${response.stop_reason} | tokens: ${response.usage?.output_tokens ?? "?"}`);
    registrarUso({ api: "claude", endpoint: "claude-sonnet-4-6", input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens, empresa_id });

    // ── Parsear JSON de Claude ──
    const resultadoRaw = extraerJsonSeguro<ResultadoAnalisis>(textContent.text);
    if (!resultadoRaw) {
      console.error('[ANALIZAR_PARSE_FAIL] Raw Claude output:', textContent.text.substring(0, 500));
      throw new Error("Error parseando respuesta de IA. Intenta de nuevo.");
    }
    const resultado = resultadoRaw;

    // ── Próximo paso ──
    // Prefiere el campo proximo_paso generado por Claude (más específico y accionable).
    // Fallback: deriva del primer compromiso. Fecha: 3 días si hay compromisos, 7 si no.
    const proximoPasoFecha = resultado.compromisos.length > 0
      ? sumarDiasHabiles(3)
      : sumarDiasHabiles(7);

    const primerCompromiso = resultado.compromisos[0];
    const proximoPasoTexto = resultado.proximo_paso?.trim()
      || (primerCompromiso
        ? `${primerCompromiso.quien}: ${primerCompromiso.que}`
        : "Revisar resultado del análisis");

    // ── Guardar interacción en DB ──
    // El análisis completo (coaching + borrador + señales) se persiste en coaching_ia
    const interaccionData: InteraccionInsert = {
      empresa_id,
      contacto_id: contacto_id ?? null,
      parent_id: null,
      tipo,
      fecha: fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
      audio_url: audio_url ?? null,
      transcripcion: tipo === "llamada" ? texto : null,
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
      remitente: "vendedor",
      resuelta: false,
      no_realizada: false,
    };

    const interaccion = await insertInteraccion(interaccionData);

    return NextResponse.json({
      ok: true,
      resultado,
      interaccion_id: interaccion.id,
    });

  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error('[ANALIZAR_INTERACCION_ERROR]', mensaje, err);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
