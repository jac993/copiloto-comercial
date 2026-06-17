// =============================================================
// POST /api/investigar — Investiga una empresa con IA
// Usa Server-Sent Events para enviar progreso en tiempo real.
// REGLA: Solo se activa cuando el usuario aprieta "Investigar".
// =============================================================

import Anthropic from "@anthropic-ai/sdk";
import { scrapeEmpresa, buscarConPerplexity, normalizarUrl } from "@/lib/scraper";
import { guardarEmpresaDesdeFicha } from "@/lib/queries";
import { PROMPT_INVESTIGADOR } from "@/lib/prompts";
import type { FichaIA } from "@/lib/types";

// Tiempo máximo de la función serverless (en segundos)
export const maxDuration = 300;

const encoder = new TextEncoder();

// Envía un evento SSE al stream
function enviarEvento(
  controller: ReadableStreamDefaultController,
  tipo: string,
  payload: Record<string, unknown>
) {
  const data = JSON.stringify({ type: tipo, ...payload });
  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
}

// Limpia texto de entrada antes de enviarlo a Claude para evitar que
// caracteres especiales rompan el JSON que Claude genera en su respuesta.
function sanitizarTexto(texto: string, maxChars = 3000): string {
  return texto
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")  // control chars excepto \t \n \r
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\t/g, " ")
    .replace(/"/g, "'")
    .replace(/\\/g, "/")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")               // fuera del rango ASCII imprimible + latin-1
    .slice(0, maxChars)
    .trim();
}

// Extrae JSON de la respuesta de Claude con 4 intentos progresivamente más agresivos.
// Si todo falla devuelve null en vez de lanzar excepción — el caller decide qué hacer.
function extraerJsonSeguro(texto: string): FichaIA | null {
  // Intento 1: parse directo
  try { return JSON.parse(texto) as FichaIA; } catch {}

  // Intento 2: extraer de bloque markdown ```json ... ```
  const mdMatch = texto.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1]) as FichaIA; } catch {}
  }

  // Intento 3: primer objeto JSON del texto
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]) as FichaIA; } catch {}

    // Intento 4: limpiar el JSON extraído y reintentar
    try {
      const limpio = jsonMatch[0]
        .replace(/[\x00-\x1F]/g, " ")          // todos los control chars → espacio
        .replace(/,(\s*[}\]])/g, "$1")          // comas finales antes de } o ]
        .replace(/([{,]\s*)(\w+)(\s*):/g, '$1"$2"$3:');  // claves sin comillas → con comillas
      return JSON.parse(limpio) as FichaIA;
    } catch {}
  }

  return null;
}

// Ficha mínima de fallback cuando Claude devuelve JSON inválido.
// Permite guardar la empresa aunque el análisis esté incompleto.
function fichaFallback(nombreDetectado: string, urlSitio: string): FichaIA {
  return {
    nombre: nombreDetectado || urlSitio,
    industria: "Por determinar",
    descripcion: "Análisis pendiente — el sitio web no devolvió suficiente información.",
    que_fabrican_o_venden: "Por determinar",
    por_que_necesitan_etiquetas: "Por determinar",
    productos_etiquetas: [],
    tamano_estimado: "mediana",
    region: "Por determinar",
    senales_oportunidad: [],
    decisores: [],
    angulo_entrada: "Investigación incompleta. Vuelve a investigar esta empresa.",
    tecnica_recomendada: "consultiva",
    razon_tecnica: "Por determinar",
    preguntas_spin: ["Por determinar", "Por determinar", "Por determinar"],
    objeciones_probables: [],
    resumen_ejecutivo: "No se pudo generar la ficha completa. Vuelve a intentarlo.",
    verificacion_contexto: [],
  };
}

export async function POST(request: Request) {
  // Validar que hay API key de Anthropic
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Falta ANTHROPIC_API_KEY en .env.local" },
      { status: 500 }
    );
  }

  const { url, contexto_vendedor } = (await request.json()) as {
    url?: string;
    contexto_vendedor?: string;
  };

  if (!url?.trim()) {
    return Response.json({ error: "URL requerida" }, { status: 400 });
  }

  // Stream SSE — el cliente lee este stream para mostrar progreso
  const stream = new ReadableStream({
    async start(controller) {
      const send = (tipo: string, payload: Record<string, unknown>) =>
        enviarEvento(controller, tipo, payload);

      try {
        // PASO A: Scraping + Perplexity en paralelo
        const urlNorm = normalizarUrl(url.trim());
        let dominio = "";
        try { dominio = new URL(urlNorm).hostname.replace(/^www\./, ""); } catch { dominio = url.trim(); }
        const nombreBase = dominio.split(".")[0];

        send("progreso", { mensaje: "Leyendo sitio web y buscando en internet..." });

        const [scrapeResult, perplexityResult] = await Promise.all([
          scrapeEmpresa(url.trim(), (msg) => send("progreso", { mensaje: msg })),
          buscarConPerplexity(nombreBase, dominio, "Chile"),
        ]);

        const { texto, nombreDetectado } = scrapeResult;

        if (!texto || texto.length < 50) {
          throw new Error(
            "No se pudo leer el sitio web. Verifica que la URL sea correcta y accesible."
          );
        }

        // PASO B: Análisis con Claude (sitio web + Perplexity)
        send("progreso", { mensaje: "Analizando con IA..." });

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const contextoBloque = contexto_vendedor?.trim()
          ? `CONTEXTO PREVIO DEL VENDEDOR (priorizar esta información sobre lo que dice el sitio web):\n${contexto_vendedor.trim()}\n\n`
          : "";

        // Sanitizar TODOS los textos externos antes de inyectarlos en el prompt
        const textoWeb = sanitizarTexto(texto, 15000);
        const contactosLimpio = sanitizarTexto(perplexityResult.contactosTexto || "", 3000);
        const inteligenciaLimpia = sanitizarTexto(perplexityResult.inteligenciaTexto || "", 3000);

        const perplexityBloque = contactosLimpio || inteligenciaLimpia
          ? `\n\n--- CONTACTOS (Perplexity) ---\n${contactosLimpio || "Sin resultados."}\n\n--- INTELIGENCIA COMERCIAL (Perplexity) ---\n${inteligenciaLimpia || "Sin resultados."}\n\nFUENTES: ${perplexityResult.fuentes.join(", ") || "ninguna"}`
          : "";

        const mensaje = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 5000,
          messages: [
            {
              role: "user",
              content: `${PROMPT_INVESTIGADOR}\n\nURL analizada: ${url.trim()}\nNombre detectado: ${nombreDetectado}\n\n${contextoBloque}--- TEXTO DEL SITIO WEB ---\n${textoWeb}${perplexityBloque}`,
            },
          ],
        });

        const contenido = mensaje.content[0];
        if (contenido.type !== "text") {
          throw new Error("Respuesta inesperada de Claude");
        }

        // Usar parser robusto con fallback — nunca crashear por JSON inválido
        const ficha = extraerJsonSeguro(contenido.text) ?? fichaFallback(nombreDetectado, url.trim());

        // PASO C: Guardar en Supabase (contexto_vendedor se guarda en notas_vendedor)
        send("progreso", { mensaje: "Guardando ficha en tu base de datos..." });

        console.log("[investigar] Guardando empresa:", ficha.nombre, url.trim());
        const empresa = await guardarEmpresaDesdeFicha(
          ficha,
          url.trim(),
          contexto_vendedor?.trim() || null
        );
        console.log("[investigar] Empresa guardada con ID:", empresa.id);

        send("resultado", {
          empresaId: empresa.id,
          nombre: empresa.nombre,
        });
      } catch (error) {
        const mensaje =
          error instanceof Error ? error.message : "Error desconocido";
        send("error", { mensaje });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
