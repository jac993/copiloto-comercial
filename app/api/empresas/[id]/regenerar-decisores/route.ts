// POST /api/empresas/[id]/regenerar-decisores
// Re-investiga la empresa completa: scraping + Perplexity + 2 llamadas Claude paralelas.
// REGLA: requiere clic explícito del usuario.

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { getEmpresaById, actualizarFichaCompleta } from "@/lib/queries";
import { scrapeEmpresa, buscarConPerplexity, normalizarUrl } from "@/lib/scraper";
import { PROMPT_FICHA_BASICA, PROMPT_DECISORES_PERPLEXITY } from "@/lib/prompts";
import { sanitizarTexto, extraerJsonSeguro } from "@/lib/json-parser";
import type { FichaIA, DecisorIA, InteligenciaComercial } from "@/lib/types";

export const maxDuration = 120;

interface FichaDecisores {
  decisores: DecisorIA[];
  inteligencia_comercial: InteligenciaComercial | null;
}

function fichaFallback(nombre: string, url: string): Omit<FichaIA, "decisores" | "inteligencia_comercial"> {
  return {
    nombre,
    industria: "Por determinar",
    descripcion: "Análisis pendiente.",
    que_fabrican_o_venden: "Por determinar",
    por_que_necesitan_etiquetas: "Por determinar",
    productos_etiquetas: [],
    tamano_estimado: "mediana",
    region: "Por determinar",
    senales_oportunidad: [],
    angulo_entrada: `Reinvestigar en ${url}`,
    tecnica_recomendada: "consultiva",
    razon_tecnica: "Por determinar",
    preguntas_spin: ["Por determinar", "Por determinar", "Por determinar"],
    objeciones_probables: [],
    resumen_ejecutivo: "No se pudo generar la ficha. Vuelve a intentarlo.",
    verificacion_contexto: [],
  };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const empresa = await getEmpresaById(params.id);
    if (!empresa) {
      return Response.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    if (!empresa.url) {
      return Response.json({ error: "Esta empresa no tiene URL para reinvestigar." }, { status: 422 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });
    }

    const urlNorm = normalizarUrl(empresa.url);
    let dominio = "";
    try { dominio = new URL(urlNorm).hostname.replace(/^www\./, ""); } catch { dominio = empresa.url; }
    const nombreBase = dominio.split(".")[0];

    // Scraping + Perplexity en paralelo
    const [scrapeResult, perplexityResult] = await Promise.all([
      scrapeEmpresa(empresa.url, () => {}),
      buscarConPerplexity(empresa.nombre || nombreBase, dominio, "Chile"),
    ]);

    const { texto, nombreDetectado } = scrapeResult;
    if (!texto || texto.length < 50) {
      return Response.json({ error: "No se pudo leer el sitio web. Verifica que la URL sea accesible." }, { status: 422 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Sanitizar textos externos
    const textoWeb = sanitizarTexto(texto, 15000);
    const contactosLimpio = sanitizarTexto(perplexityResult.contactosTexto || "", 3000);
    const inteligenciaLimpia = sanitizarTexto(perplexityResult.inteligenciaTexto || "", 3000);

    const perplexityBloque = contactosLimpio || inteligenciaLimpia
      ? `--- CONTACTOS (Perplexity) ---\n${contactosLimpio || "Sin resultados."}\n\n--- INTELIGENCIA COMERCIAL (Perplexity) ---\n${inteligenciaLimpia || "Sin resultados."}\n\nFUENTES: ${perplexityResult.fuentes.join(", ") || "ninguna"}`
      : "";

    // Llamada 1: ficha básica desde sitio web
    const llamada1 = anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `${PROMPT_FICHA_BASICA}\n\nURL: ${empresa.url}\nNombre detectado: ${nombreDetectado || empresa.nombre}\n\n--- TEXTO DEL SITIO WEB ---\n${textoWeb}`,
      }],
    });

    // Llamada 2: decisores + inteligencia desde Perplexity
    const llamada2 = perplexityBloque
      ? anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `${PROMPT_DECISORES_PERPLEXITY}\n\nEmpresa: ${nombreDetectado || empresa.nombre}\nDominio: ${dominio}\n\n${perplexityBloque}`,
          }],
        })
      : Promise.resolve(null);

    const [res1, res2] = await Promise.all([llamada1, llamada2]);

    // Combinar resultados
    const texto1 = res1.content[0]?.type === "text" ? res1.content[0].text : "";
    const texto2 = res2?.content[0]?.type === "text" ? res2.content[0].text : "";

    const fichaBasica = extraerJsonSeguro<Omit<FichaIA, "decisores" | "inteligencia_comercial">>(texto1)
      ?? fichaFallback(empresa.nombre || nombreBase, empresa.url);

    const fichaDecisores = texto2
      ? (extraerJsonSeguro<FichaDecisores>(texto2) ?? null)
      : null;

    const fichaFinal: FichaIA = {
      ...fichaBasica,
      decisores: fichaDecisores?.decisores ?? [],
      inteligencia_comercial: fichaDecisores?.inteligencia_comercial ?? null,
    };

    await actualizarFichaCompleta(params.id, fichaFinal);

    return Response.json({ ok: true, nombre: fichaFinal.nombre });

  } catch (error) {
    console.error("[regenerar-decisores] error:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
