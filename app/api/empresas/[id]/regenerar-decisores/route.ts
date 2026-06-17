// POST /api/empresas/[id]/regenerar-decisores
// Lee la ficha_ia existente y regenera solo el array de decisores con Claude.
// Reemplaza ficha_ia.decisores en Supabase sin tocar la tabla contactos.
// Los contactos agregados manualmente (en tabla contactos) no se ven afectados.

import Anthropic from "@anthropic-ai/sdk";
import { getEmpresaById } from "@/lib/queries";
import { PROMPT_REGENERAR_DECISORES } from "@/lib/prompts";
import { buscarConPerplexity } from "@/lib/scraper";
import type { DecisorIA, ContactoReal, InteligenciaComercial } from "@/lib/types";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const { id } = params;
  const empresa = await getEmpresaById(id);

  if (!empresa?.ficha_ia) {
    return Response.json({ error: "Empresa sin ficha de IA" }, { status: 404 });
  }

  const ficha = empresa.ficha_ia;

  // Perplexity + Claude en paralelo
  const dominio = empresa.url
    ? (() => { try { return new URL(empresa.url!).hostname.replace(/^www\./, ""); } catch { return ""; } })()
    : "";

  const [perplexityResult, mensaje] = await Promise.all([
    buscarConPerplexity(ficha.nombre, dominio, ficha.region ?? "Chile"),
    new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `${PROMPT_REGENERAR_DECISORES}

FICHA DE LA EMPRESA:
Nombre: ${ficha.nombre}
Industria: ${ficha.industria}
Qué fabrican o venden: ${ficha.que_fabrican_o_venden}
Por qué necesitan etiquetas: ${ficha.por_que_necesitan_etiquetas}
Tamaño: ${ficha.tamano_estimado}
Región: ${ficha.region}
Resumen: ${ficha.resumen_ejecutivo}`,
        },
      ],
    }),
  ]);

  const contenido = mensaje.content[0];
  if (contenido.type !== "text") {
    return Response.json({ error: "Respuesta inesperada de Claude" }, { status: 500 });
  }

  const jsonMatch = contenido.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return Response.json({ error: "No se pudo extraer JSON de la respuesta" }, { status: 500 });
  }

  const resultado = JSON.parse(jsonMatch[0]) as { decisores: DecisorIA[] };

  // Extraer contactos_reales e inteligencia_comercial del texto de Perplexity con un mini-prompt a Claude
  let contactosRealesActualizados: ContactoReal[] = ficha.contactos_reales ?? [];
  let inteligenciaActualizada: InteligenciaComercial | null = ficha.inteligencia_comercial ?? null;

  if (perplexityResult.contactosTexto || perplexityResult.inteligenciaTexto) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const respEnriquecida = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `Extrae contactos reales e inteligencia comercial de estos datos de búsqueda.
Empresa: ${ficha.nombre} — Industria: ${ficha.industria}

BÚSQUEDA DE CONTACTOS (Perplexity):
${perplexityResult.contactosTexto || "Sin resultados."}

INTELIGENCIA COMERCIAL (Perplexity):
${perplexityResult.inteligenciaTexto || "Sin resultados."}

FUENTES: ${perplexityResult.fuentes.join(", ") || "ninguna"}

Responde ÚNICAMENTE con este JSON (sin markdown):
{
  "contactos_reales": [{"nombre":null,"cargo":null,"email":null,"telefono":null,"linkedin_url":null,"como_contactar":"string","fuente":"string","confianza":"alta|media|baja","relevancia_venta":"alta|media|baja"}],
  "inteligencia_comercial": {"situacion_mercado":"string","prioridades_actuales":"string","dolores_probables":"string","clientes_y_exigencias":"string","debilidades_proveedor_actual":"string","propuesta_valor_especifica":"string","fuentes":["url"]}
}
REGLA: NUNCA inventes datos. Si no hay información real, devuelve arrays vacíos y strings con "Sin información pública disponible."`,
        }],
      });
      const respTexto = respEnriquecida.content[0];
      if (respTexto.type === "text") {
        const jsonRaw = respTexto.text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
        const jsonM = jsonRaw.match(/\{[\s\S]*\}/);
        if (jsonM) {
          const parsed = JSON.parse(jsonM[0]) as { contactos_reales: ContactoReal[]; inteligencia_comercial: InteligenciaComercial };
          contactosRealesActualizados = parsed.contactos_reales ?? [];
          inteligenciaActualizada = parsed.inteligencia_comercial ?? null;
        }
      }
    } catch { /* Perplexity enrich failed — keep existing */ }
  }

  // Actualizar ficha_ia: decisores + contactos_reales + inteligencia_comercial
  const fichaActualizada = {
    ...ficha,
    decisores: resultado.decisores,
    contactos_reales: contactosRealesActualizados,
    inteligencia_comercial: inteligenciaActualizada,
  };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await supabase
    .from("empresas")
    .update({ ficha_ia: fichaActualizada })
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    decisores: resultado.decisores,
    contactos_reales: contactosRealesActualizados,
    inteligencia_comercial: inteligenciaActualizada,
  });
}
