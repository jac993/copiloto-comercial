// POST /api/empresas/[id]/regenerar
// Reinvestiga la empresa: scraping + Perplexity + Claude.
// Acepta campos opcionales para actualizar URL, razón social, notas.
// REGLA: requiere clic explícito del usuario (⚡ usa créditos).

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getEmpresaById, actualizarFichaCompleta } from "@/lib/queries";
import { scrapeEmpresa, buscarConPerplexity, normalizarUrl } from "@/lib/scraper";
import { PROMPT_INVESTIGADOR } from "@/lib/prompts";
import { sanitizarTexto, extraerJsonSeguro } from "@/lib/json-parser";
import { getSupabaseServer } from "@/lib/supabase";
import type { FichaIA, BusquedaWebRaw } from "@/lib/types";

export const maxDuration = 120;

function limpiarUrl(url: string): string {
  return url.split("?")[0].split("#")[0].trim();
}

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
  req: NextRequest,
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

    // Leer campos opcionales del body
    let body: {
      url?: string;
      razon_social?: string;
      rut?: string;
      ciudad?: string;
      rubro?: string;
      notas_vendedor?: string;
    } = {};
    try { body = await req.json(); } catch { /* body vacío es válido */ }

    // Resolver URL a usar (preferir la del body si viene; limpiar parámetros)
    const urlUsada = limpiarUrl(body.url?.trim() || empresa.url || "");
    if (!urlUsada) {
      return Response.json({ error: "Esta empresa no tiene URL para reinvestigar." }, { status: 422 });
    }

    // Actualizar campos en DB si el usuario los cambió
    const supabase = await getSupabaseServer();
    const actualizaciones: Record<string, string | null> = { url: urlUsada };
    if (body.razon_social !== undefined) actualizaciones.razon_social = body.razon_social.trim() || null;
    if (body.rut !== undefined) actualizaciones.rut = body.rut.trim() || null;
    if (body.notas_vendedor !== undefined) actualizaciones.notas_vendedor = body.notas_vendedor.trim() || null;
    await supabase.from("empresas").update(actualizaciones).eq("id", params.id);

    const urlNorm = normalizarUrl(urlUsada);
    let dominio = "";
    try { dominio = new URL(urlNorm).hostname.replace(/^www\./, ""); } catch { dominio = urlUsada; }
    const opcionesExtra = {
      razonSocial: body.razon_social?.trim() || empresa.razon_social || undefined,
      rut: body.rut?.trim() || empresa.rut || undefined,
      ciudad: body.ciudad?.trim(),
      rubro: body.rubro?.trim(),
    };

    // ── Scraping + Perplexity en paralelo ────────────────────
    const [scrapeResult, perplexityResult] = await Promise.all([
      scrapeEmpresa(urlUsada, () => {}),
      buscarConPerplexity(
        opcionesExtra.razonSocial || empresa.nombre,
        dominio,
        "Chile",
        opcionesExtra
      ).catch(() => ({ contactosTexto: "", inteligenciaTexto: "", fuentes: [] })),
    ]);

    const { texto, nombreDetectado } = scrapeResult;
    if (!texto || texto.length < 50) {
      return Response.json({ error: "No se pudo leer el sitio web. Verifica que la URL sea accesible." }, { status: 422 });
    }

    // ── Claude con todo el contexto ───────────────────────────
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const textoWeb = sanitizarTexto(texto, 15000);
    const contactosLimpio = sanitizarTexto(perplexityResult.contactosTexto, 3000);
    const inteligenciaLimpia = sanitizarTexto(perplexityResult.inteligenciaTexto, 3000);

    const perplexityBloque = contactosLimpio || inteligenciaLimpia
      ? `\n\n--- CONTACTOS (Perplexity) ---\n${contactosLimpio || "Sin resultados."}\n\n--- INTELIGENCIA COMERCIAL (Perplexity) ---\n${inteligenciaLimpia || "Sin resultados."}\n\nFUENTES: ${perplexityResult.fuentes.join(", ") || "ninguna"}`
      : "";

    const notasBloque = (body.notas_vendedor?.trim() || empresa.notas_vendedor)
      ? `CONTEXTO PREVIO DEL VENDEDOR:\n${body.notas_vendedor?.trim() || empresa.notas_vendedor}\n\n`
      : "";

    const datosExtra = [
      opcionesExtra.razonSocial ? `Razón social oficial: ${opcionesExtra.razonSocial}` : "",
      opcionesExtra.rut ? `RUT: ${opcionesExtra.rut}` : "",
      body.ciudad?.trim() ? `Ciudad/Región: ${body.ciudad.trim()}` : "",
      body.rubro?.trim() ? `Rubro declarado: ${body.rubro.trim()}` : "",
    ].filter(Boolean).join("\n");
    const datosExtraBloque = datosExtra ? `DATOS ADICIONALES PROVISTOS:\n${datosExtra}\n\n` : "";

    const mensaje = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content:
          `${PROMPT_INVESTIGADOR}\n\nURL: ${urlUsada}\nNombre detectado: ${nombreDetectado || empresa.nombre}\nDominio: ${dominio}\n\n` +
          `${datosExtraBloque}${notasBloque}--- TEXTO DEL SITIO WEB ---\n${textoWeb}${perplexityBloque}`,
      }],
    });

    const textoRespuesta = mensaje.content[0]?.type === "text" ? mensaje.content[0].text : "";
    const ficha = extraerJsonSeguro<FichaIA>(textoRespuesta) ?? fichaFallback(empresa.nombre, urlUsada);

    // Guardar raw de Perplexity si hubo resultados
    const busquedaWebRaw: BusquedaWebRaw | null = contactosLimpio || inteligenciaLimpia
      ? { contactosTexto: perplexityResult.contactosTexto, inteligenciaTexto: perplexityResult.inteligenciaTexto, fuentes: perplexityResult.fuentes, buscado_en: new Date().toISOString() }
      : null;

    await actualizarFichaCompleta(params.id, ficha);
    if (busquedaWebRaw) {
      await supabase.from("empresas").update({ busqueda_web_raw: busquedaWebRaw }).eq("id", params.id);
    }

    // Invalidar caché de Next.js para que router.refresh() sirva datos frescos
    revalidatePath(`/cuentas/${params.id}`);

    return Response.json({ ok: true, nombre: ficha.nombre });
  } catch (error) {
    console.error("[regenerar] error:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
