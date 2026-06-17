// POST /api/empresas/[id]/buscar-web
// Busca información pública de la empresa con Perplexity,
// luego Claude analiza y extrae personas + inteligencia comercial.
// REGLA: requiere clic explícito del usuario (⚡ usa créditos).

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { getEmpresaById } from "@/lib/queries";
import { buscarConPerplexity, normalizarUrl } from "@/lib/scraper";
import { PROMPT_ANALISIS_WEB } from "@/lib/prompts";
import { sanitizarTexto, extraerJsonSeguro } from "@/lib/json-parser";
import { getSupabaseServer } from "@/lib/supabase";
import type { BusquedaWebRaw, AnalisisWeb } from "@/lib/types";

export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const empresa = await getEmpresaById(params.id);
    if (!empresa) {
      return Response.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });
    }

    // Obtener dominio desde URL guardada o usar el nombre
    let dominio = "";
    if (empresa.url) {
      try {
        dominio = new URL(normalizarUrl(empresa.url)).hostname.replace(/^www\./, "");
      } catch {
        dominio = empresa.nombre;
      }
    }

    // ── PASO 1: Perplexity ────────────────────────────────────
    const perplexityResult = await buscarConPerplexity(
      empresa.nombre,
      dominio,
      "Chile"
    );

    const rawData: BusquedaWebRaw = {
      contactosTexto: perplexityResult.contactosTexto,
      inteligenciaTexto: perplexityResult.inteligenciaTexto,
      fuentes: perplexityResult.fuentes,
      buscado_en: new Date().toISOString(),
    };

    // ── PASO 2: Guardar raw en DB ─────────────────────────────
    const supabase = await getSupabaseServer();
    await supabase
      .from("empresas")
      .update({ busqueda_web_raw: rawData })
      .eq("id", params.id);

    // ── PASO 3: Claude analiza el resultado de Perplexity ─────
    const contactosLimpio = sanitizarTexto(perplexityResult.contactosTexto, 3000);
    const inteligenciaLimpia = sanitizarTexto(perplexityResult.inteligenciaTexto, 3000);

    const perplexityBloque =
      `--- CONTACTOS (Perplexity) ---\n${contactosLimpio || "Sin resultados."}\n\n` +
      `--- INTELIGENCIA COMERCIAL (Perplexity) ---\n${inteligenciaLimpia || "Sin resultados."}\n\n` +
      `FUENTES: ${perplexityResult.fuentes.join(", ") || "ninguna"}`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const mensaje = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `${PROMPT_ANALISIS_WEB}\n\nEmpresa: ${empresa.nombre}\nIndustria: ${empresa.industria || "Desconocida"}\nDominio: ${dominio}\n\n${perplexityBloque}`,
        },
      ],
    });

    const contenido = mensaje.content[0];
    const textoRespuesta = contenido.type === "text" ? contenido.text : "";

    const analisis = extraerJsonSeguro<AnalisisWeb>(textoRespuesta);

    // ── PASO 4: Guardar análisis en DB ────────────────────────
    if (analisis) {
      await supabase
        .from("empresas")
        .update({ busqueda_web_analisis: analisis })
        .eq("id", params.id);
    }

    return Response.json({
      ok: true,
      raw: rawData,
      analisis: analisis ?? null,
    });
  } catch (error) {
    console.error("[buscar-web] error:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
