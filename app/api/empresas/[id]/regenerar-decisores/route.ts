// POST /api/empresas/[id]/regenerar-decisores
// Busca contactos reales e inteligencia comercial con Perplexity,
// los procesa con Claude y guarda el resultado en ficha_ia.
// REGLA: requiere clic explícito del usuario (botón "↻ Actualizar con Perplexity").

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { getEmpresaById, actualizarContactosReales } from "@/lib/queries";
import { buscarConPerplexity } from "@/lib/scraper";
import { PROMPT_BUSCAR_CONTACTOS } from "@/lib/prompts";
import type { ContactoReal, InteligenciaComercial } from "@/lib/types";

export const maxDuration = 60;

// Sanitiza texto de Perplexity antes de inyectarlo en el prompt de Claude
function sanitizar(t: string): string {
  return t
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/"/g, "'")
    .replace(/\\/g, "/")
    .slice(0, 3000);
}

interface ContactosResult {
  contactos_reales: ContactoReal[];
  inteligencia_comercial: InteligenciaComercial | null;
}

function extraerJson(texto: string): ContactosResult {
  // Intento 1: parse directo
  try { return JSON.parse(texto) as ContactosResult; } catch {}

  // Intento 2: extraer de bloque markdown
  const md = texto.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (md) { try { return JSON.parse(md[1]) as ContactosResult; } catch {} }

  // Intento 3: primer objeto JSON del texto
  const match = texto.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]) as ContactosResult; } catch {
      const sanitizado = match[0]
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
        .replace(/\t/g, " ");
      return JSON.parse(sanitizado) as ContactosResult;
    }
  }

  throw new Error("No se pudo extraer JSON de la respuesta de IA");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Obtener empresa
    const empresa = await getEmpresaById(params.id);
    if (!empresa) {
      return Response.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const nombre = empresa.nombre;
    const dominio = empresa.url
      ?.replace(/https?:\/\//, "")
      ?.split("/")[0] ?? "";

    // 2. Buscar con Perplexity
    const perplexity = await buscarConPerplexity(nombre, dominio, "Chile");

    if (!perplexity.contactosTexto && !perplexity.inteligenciaTexto) {
      return Response.json(
        { error: "Perplexity no devolvió información para esta empresa." },
        { status: 422 }
      );
    }

    // 3. Procesar con Claude
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const bloquePerplexity = `
--- BÚSQUEDA DE CONTACTOS (Perplexity) ---
${sanitizar(perplexity.contactosTexto || "Sin resultados.")}

--- INTELIGENCIA COMERCIAL (Perplexity) ---
${sanitizar(perplexity.inteligenciaTexto || "Sin resultados.")}

FUENTES: ${perplexity.fuentes.join(", ") || "ninguna"}
    `.trim();

    const mensaje = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: `${PROMPT_BUSCAR_CONTACTOS}\n\nEmpresa: ${nombre}\nDominio: ${dominio}\n\n${bloquePerplexity}`,
        },
      ],
    });

    const contenido = mensaje.content[0];
    if (contenido.type !== "text") {
      throw new Error("Respuesta inesperada de Claude");
    }

    const resultado = extraerJson(contenido.text);

    // 4. Guardar contactos_reales e inteligencia_comercial en ficha_ia
    await actualizarContactosReales(
      params.id,
      resultado.contactos_reales ?? [],
      resultado.inteligencia_comercial ?? null
    );

    return Response.json({ ok: true });

  } catch (error) {
    console.error("[regenerar-decisores] error:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
