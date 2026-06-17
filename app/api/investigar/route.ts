// =============================================================
// POST /api/investigar — Investiga una empresa con IA
// Flujo dividido en 2 llamadas paralelas a Claude para evitar
// JSONs demasiado grandes que fallan al parsear.
// REGLA: Solo se activa cuando el usuario aprieta "Investigar".
// =============================================================

import Anthropic from "@anthropic-ai/sdk";
import { scrapeEmpresa, buscarConPerplexity, normalizarUrl } from "@/lib/scraper";
import { guardarEmpresaDesdeFicha } from "@/lib/queries";
import { PROMPT_FICHA_BASICA, PROMPT_DECISORES_PERPLEXITY } from "@/lib/prompts";
import { sanitizarTexto, extraerJsonSeguro } from "@/lib/json-parser";
import type { FichaIA, DecisorIA, InteligenciaComercial } from "@/lib/types";

export const maxDuration = 300;

const encoder = new TextEncoder();

function enviarEvento(
  controller: ReadableStreamDefaultController,
  tipo: string,
  payload: Record<string, unknown>
) {
  const data = JSON.stringify({ type: tipo, ...payload });
  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
}

// Ficha mínima de fallback cuando Claude devuelve JSON inválido.
function fichaFallback(nombreDetectado: string, urlSitio: string): Omit<FichaIA, "decisores" | "inteligencia_comercial"> {
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
    angulo_entrada: "Investigación incompleta. Vuelve a investigar esta empresa.",
    tecnica_recomendada: "consultiva",
    razon_tecnica: "Por determinar",
    preguntas_spin: ["Por determinar", "Por determinar", "Por determinar"],
    objeciones_probables: [],
    resumen_ejecutivo: "No se pudo generar la ficha completa. Vuelve a intentarlo.",
    verificacion_contexto: [],
  };
}

interface FichaDecisores {
  decisores: DecisorIA[];
  inteligencia_comercial: InteligenciaComercial | null;
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Falta ANTHROPIC_API_KEY en .env.local" }, { status: 500 });
  }

  const { url, contexto_vendedor } = (await request.json()) as {
    url?: string;
    contexto_vendedor?: string;
  };

  if (!url?.trim()) {
    return Response.json({ error: "URL requerida" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (tipo: string, payload: Record<string, unknown>) =>
        enviarEvento(controller, tipo, payload);

      try {
        // ── PASO A: Scraping + Perplexity en paralelo ─────────
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
          throw new Error("No se pudo leer el sitio web. Verifica que la URL sea correcta y accesible.");
        }

        // ── PASO B: Dos llamadas Claude en paralelo ────────────
        send("progreso", { mensaje: "Analizando empresa con IA..." });

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const contextoBloque = contexto_vendedor?.trim()
          ? `CONTEXTO PREVIO DEL VENDEDOR:\n${contexto_vendedor.trim()}\n\n`
          : "";

        // Sanitizar todos los textos externos antes de inyectarlos
        const textoWeb = sanitizarTexto(texto, 15000);
        const contactosLimpio = sanitizarTexto(perplexityResult.contactosTexto || "", 3000);
        const inteligenciaLimpia = sanitizarTexto(perplexityResult.inteligenciaTexto || "", 3000);

        const perplexityBloque = contactosLimpio || inteligenciaLimpia
          ? `--- CONTACTOS (Perplexity) ---\n${contactosLimpio || "Sin resultados."}\n\n--- INTELIGENCIA COMERCIAL (Perplexity) ---\n${inteligenciaLimpia || "Sin resultados."}\n\nFUENTES: ${perplexityResult.fuentes.join(", ") || "ninguna"}`
          : "";

        // Llamada 1: ficha básica desde sitio web (sin Perplexity)
        const llamada1 = anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `${PROMPT_FICHA_BASICA}\n\nURL: ${url.trim()}\nNombre detectado: ${nombreDetectado}\n\n${contextoBloque}--- TEXTO DEL SITIO WEB ---\n${textoWeb}`,
          }],
        });

        // Llamada 2: decisores + inteligencia desde Perplexity (en paralelo)
        const llamada2 = perplexityBloque
          ? anthropic.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 2000,
              messages: [{
                role: "user",
                content: `${PROMPT_DECISORES_PERPLEXITY}\n\nEmpresa: ${nombreDetectado || nombreBase}\nDominio: ${dominio}\n\n${perplexityBloque}`,
              }],
            })
          : Promise.resolve(null);

        const [res1, res2] = await Promise.all([llamada1, llamada2]);

        // ── PASO C: Combinar resultados ────────────────────────
        const texto1 = res1.content[0]?.type === "text" ? res1.content[0].text : "";
        const texto2 = res2?.content[0]?.type === "text" ? res2.content[0].text : "";

        const fichaBasica = extraerJsonSeguro<Omit<FichaIA, "decisores" | "inteligencia_comercial">>(texto1)
          ?? fichaFallback(nombreDetectado, url.trim());

        const fichaDecisores = texto2
          ? (extraerJsonSeguro<FichaDecisores>(texto2) ?? null)
          : null;

        const fichaFinal: FichaIA = {
          ...fichaBasica,
          decisores: fichaDecisores?.decisores ?? [],
          inteligencia_comercial: fichaDecisores?.inteligencia_comercial ?? null,
        };

        // ── PASO D: Guardar en Supabase ────────────────────────
        send("progreso", { mensaje: "Guardando ficha en tu base de datos..." });

        const empresa = await guardarEmpresaDesdeFicha(
          fichaFinal,
          url.trim(),
          contexto_vendedor?.trim() || null
        );

        send("resultado", { empresaId: empresa.id, nombre: empresa.nombre });

      } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
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
