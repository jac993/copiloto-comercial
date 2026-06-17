// POST /api/empresas/[id]/regenerar
// Reinvestiga la empresa desde cero: scraping del sitio web + Claude.
// Actualiza la ficha_ia completa. Sin Perplexity (eso es /buscar-web).
// REGLA: requiere clic explícito del usuario (⚡ usa créditos).

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { getEmpresaById, actualizarFichaCompleta } from "@/lib/queries";
import { scrapeEmpresa, normalizarUrl } from "@/lib/scraper";
import { PROMPT_INVESTIGADOR } from "@/lib/prompts";
import { sanitizarTexto, extraerJsonSeguro } from "@/lib/json-parser";
import type { FichaIA } from "@/lib/types";

export const maxDuration = 120;

function fichaFallback(nombre: string, url: string): FichaIA {
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
    decisores: [],
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
      return Response.json(
        { error: "Esta empresa no tiene URL para reinvestigar." },
        { status: 422 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });
    }

    const urlNorm = normalizarUrl(empresa.url);
    let dominio = "";
    try {
      dominio = new URL(urlNorm).hostname.replace(/^www\./, "");
    } catch {
      dominio = empresa.url;
    }

    // ── PASO 1: Scraping ──────────────────────────────────────
    const { texto, nombreDetectado } = await scrapeEmpresa(empresa.url, () => {});

    if (!texto || texto.length < 50) {
      return Response.json(
        { error: "No se pudo leer el sitio web. Verifica que la URL sea accesible." },
        { status: 422 }
      );
    }

    // ── PASO 2: Claude ────────────────────────────────────────
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const textoWeb = sanitizarTexto(texto, 15000);

    const mensaje = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `${PROMPT_INVESTIGADOR}\n\nURL: ${empresa.url}\nNombre detectado: ${nombreDetectado || empresa.nombre}\nDominio: ${dominio}\n\n--- TEXTO DEL SITIO WEB ---\n${textoWeb}`,
        },
      ],
    });

    const contenido = mensaje.content[0];
    const textoRespuesta = contenido.type === "text" ? contenido.text : "";

    const ficha =
      extraerJsonSeguro<FichaIA>(textoRespuesta) ??
      fichaFallback(empresa.nombre, empresa.url);

    // ── PASO 3: Guardar ───────────────────────────────────────
    await actualizarFichaCompleta(params.id, ficha);

    return Response.json({ ok: true, nombre: ficha.nombre });
  } catch (error) {
    console.error("[regenerar] error:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
