// POST /api/empresas/[id]/regenerar-decisores
// Re-investiga la empresa completa: scraping + Perplexity + Claude.
// Actualiza ficha_ia completa incluyendo resumen ejecutivo, decisores con
// persona_encontrada e inteligencia_comercial.
// REGLA: requiere clic explícito del usuario.

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { getEmpresaById, actualizarFichaCompleta } from "@/lib/queries";
import { scrapeEmpresa, buscarConPerplexity, normalizarUrl } from "@/lib/scraper";
import { PROMPT_INVESTIGADOR } from "@/lib/prompts";
import type { FichaIA } from "@/lib/types";

export const maxDuration = 120;

function sanitizar(t: string): string {
  return t
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/"/g, "'")
    .replace(/\\/g, "/")
    .slice(0, 3000);
}

function extraerJson(texto: string): FichaIA {
  try { return JSON.parse(texto) as FichaIA; } catch {}
  const md = texto.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (md) { try { return JSON.parse(md[1]) as FichaIA; } catch {} }
  const match = texto.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]) as FichaIA; } catch {
      const s = match[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ").replace(/\t/g, " ");
      return JSON.parse(s) as FichaIA;
    }
  }
  throw new Error("No se pudo extraer JSON de la respuesta de Claude");
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

    // Scraping + Perplexity en paralelo
    const [scrapeResult, perplexityResult] = await Promise.all([
      scrapeEmpresa(empresa.url, () => {}),
      buscarConPerplexity(empresa.nombre, dominio, "Chile"),
    ]);

    const { texto } = scrapeResult;
    if (!texto || texto.length < 50) {
      return Response.json({ error: "No se pudo leer el sitio web. Verifica que la URL sea accesible." }, { status: 422 });
    }

    const perplexityBloque = perplexityResult.contactosTexto || perplexityResult.inteligenciaTexto
      ? `\n\n--- CONTACTOS (Perplexity) ---\n${sanitizar(perplexityResult.contactosTexto || "Sin resultados.")}\n\n--- INTELIGENCIA COMERCIAL (Perplexity) ---\n${sanitizar(perplexityResult.inteligenciaTexto || "Sin resultados.")}\n\nFUENTES: ${perplexityResult.fuentes.join(", ") || "ninguna"}`
      : "";

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const mensaje = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 5000,
      messages: [
        {
          role: "user",
          content: `${PROMPT_INVESTIGADOR}\n\nURL analizada: ${empresa.url}\nNombre detectado: ${empresa.nombre}\n\n--- TEXTO DEL SITIO WEB ---\n${texto}${perplexityBloque}`,
        },
      ],
    });

    const contenido = mensaje.content[0];
    if (contenido.type !== "text") throw new Error("Respuesta inesperada de Claude");

    const ficha = extraerJson(contenido.text);

    await actualizarFichaCompleta(params.id, ficha);

    return Response.json({ ok: true, nombre: ficha.nombre });

  } catch (error) {
    console.error("[regenerar-decisores] error:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
