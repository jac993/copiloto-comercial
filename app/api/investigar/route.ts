// =============================================================
// POST /api/investigar — Investiga una empresa con IA
// Flujo: scraping + Perplexity en paralelo → Claude con todo.
// Perplexity es opcional — si falla, sigue solo con el sitio web.
// REGLA: Solo se activa cuando el usuario aprieta "Investigar".
// =============================================================

import Anthropic from "@anthropic-ai/sdk";
import { scrapeEmpresa, buscarConPerplexity, normalizarUrl } from "@/lib/scraper";
import { guardarEmpresaDesdeFicha } from "@/lib/queries";
import { PROMPT_INVESTIGADOR } from "@/lib/prompts";
import { sanitizarTexto, extraerJsonSeguro } from "@/lib/json-parser";
import type { FichaIA, BusquedaWebRaw } from "@/lib/types";

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
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Falta ANTHROPIC_API_KEY en .env.local" }, { status: 500 });
  }

  const { url, contexto_vendedor, razon_social, rut, ciudad, rubro } = (await request.json()) as {
    url?: string;
    contexto_vendedor?: string;
    razon_social?: string;
    rut?: string;
    ciudad?: string;
    rubro?: string;
  };

  if (!url?.trim()) {
    return Response.json({ error: "URL requerida" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (tipo: string, payload: Record<string, unknown>) =>
        enviarEvento(controller, tipo, payload);

      try {
        const urlNorm = normalizarUrl(url.trim().split("?")[0].split("#")[0].trim());
        let dominio = "";
        try {
          dominio = new URL(urlNorm).hostname.replace(/^www\./, "");
        } catch {
          dominio = url.trim();
        }
        const nombreBase = dominio.split(".")[0];

        // ── PASO A: Scraping + Perplexity en paralelo ─────────
        send("progreso", { mensaje: "Leyendo el sitio web..." });

        const opcionesExtra = {
          razonSocial: razon_social?.trim(),
          rut: rut?.trim(),
          ciudad: ciudad?.trim(),
          rubro: rubro?.trim(),
        };

        const [scrapeResult, perplexityResult] = await Promise.all([
          scrapeEmpresa(url.trim(), (msg) => send("progreso", { mensaje: msg })),
          (async () => {
            send("progreso", { mensaje: "Buscando en internet..." });
            try {
              return await buscarConPerplexity(nombreBase, dominio, "Chile", opcionesExtra);
            } catch {
              return { contactosTexto: "", inteligenciaTexto: "", fuentes: [] };
            }
          })(),
        ]);

        const { texto, nombreDetectado } = scrapeResult;

        if (!texto || texto.length < 50) {
          throw new Error(
            "No se pudo leer el sitio web. Verifica que la URL sea correcta y accesible."
          );
        }

        // ── PASO B: Claude con todo el contexto ───────────────
        send("progreso", { mensaje: "Analizando con IA..." });

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const contextoBloque = contexto_vendedor?.trim()
          ? `CONTEXTO PREVIO DEL VENDEDOR:\n${contexto_vendedor.trim()}\n\n`
          : "";

        const datosExtra = [
          razon_social?.trim() ? `Razón social oficial: ${razon_social.trim()}` : "",
          rut?.trim() ? `RUT: ${rut.trim()}` : "",
          ciudad?.trim() ? `Ciudad/Región: ${ciudad.trim()}` : "",
          rubro?.trim() ? `Rubro declarado: ${rubro.trim()}` : "",
        ].filter(Boolean).join("\n");
        const datosExtraBloque = datosExtra ? `DATOS ADICIONALES PROVISTOS:\n${datosExtra}\n\n` : "";

        const textoWeb = sanitizarTexto(texto, 15000);
        const contactosLimpio = sanitizarTexto(perplexityResult.contactosTexto, 3000);
        const inteligenciaLimpia = sanitizarTexto(perplexityResult.inteligenciaTexto, 3000);

        const perplexityBloque =
          contactosLimpio || inteligenciaLimpia
            ? `\n\n--- CONTACTOS (Perplexity) ---\n${contactosLimpio || "Sin resultados."}\n\n--- INTELIGENCIA COMERCIAL (Perplexity) ---\n${inteligenciaLimpia || "Sin resultados."}\n\nFUENTES: ${perplexityResult.fuentes.join(", ") || "ninguna"}`
            : "";

        const mensaje = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content:
                `${PROMPT_INVESTIGADOR}\n\nURL: ${url.trim()}\nNombre detectado: ${nombreDetectado}\nDominio: ${dominio}\n\n` +
                `${datosExtraBloque}${contextoBloque}--- TEXTO DEL SITIO WEB ---\n${textoWeb}${perplexityBloque}`,
            },
          ],
        });

        const contenido = mensaje.content[0];
        if (contenido.type !== "text") {
          throw new Error("Respuesta inesperada de Claude");
        }

        const ficha =
          extraerJsonSeguro<FichaIA>(contenido.text) ??
          fichaFallback(nombreDetectado, url.trim());

        // Guardar raw de Perplexity junto con la empresa
        const busquedaWebRaw: BusquedaWebRaw | null =
          contactosLimpio || inteligenciaLimpia
            ? {
                contactosTexto: perplexityResult.contactosTexto,
                inteligenciaTexto: perplexityResult.inteligenciaTexto,
                fuentes: perplexityResult.fuentes,
                buscado_en: new Date().toISOString(),
              }
            : null;

        // ── PASO C: Guardar en Supabase ────────────────────────
        send("progreso", { mensaje: "Guardando ficha..." });

        const empresa = await guardarEmpresaDesdeFicha(
          ficha,
          url.trim(),
          contexto_vendedor?.trim() || null,
          busquedaWebRaw,
          { razonSocial: razon_social?.trim(), rut: rut?.trim() }
        );

        send("resultado", { empresaId: empresa.id, nombre: empresa.nombre });
        send("progreso", { mensaje: "¡Listo!" });
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
