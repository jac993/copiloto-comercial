// POST /api/empresas/[id]/regenerar
// Reinvestiga la empresa: scraping + Perplexity en paralelo → una sola llamada Claude.
// Acepta campos opcionales para actualizar URL, razón social, notas.
// REGLA: requiere clic explícito del usuario (⚡ usa créditos).

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { getEmpresaById, actualizarFichaCompleta } from "@/lib/queries";
import { scrapeEmpresa, buscarConPerplexity, normalizarUrl } from "@/lib/scraper";
import { PROMPT_INVESTIGADOR } from "@/lib/prompts";
import { sanitizarTexto, extraerJsonSeguro } from "@/lib/json-parser";
import type { FichaIA, BusquedaWebRaw } from "@/lib/types";

// Cliente Supabase con service role — no depende de cookies ni de next/headers
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const maxDuration = 180;

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
  req: Request,
  { params }: { params: { id: string } }
) {
  console.log("[regenerar] handler iniciado");
  try {
    const empresa = await getEmpresaById(params.id);
    if (!empresa) {
      return Response.json({ error: "Empresa no encontrada" }, { status: 404 });
    }
    console.log(`[regenerar] empresa: ${empresa.nombre}`);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
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
    try {
      body = await req.json();
    } catch {
      // body vacío es válido
    }

    const urlUsada = limpiarUrl(body.url?.trim() || empresa.url || "");
    if (!urlUsada) {
      return Response.json({ error: "Esta empresa no tiene URL para reinvestigar." }, { status: 422 });
    }
    console.log(`[regenerar] URL: ${urlUsada}`);

    // Actualizar campos en DB si el usuario los cambió
    const supabase = getSupabaseAdmin();
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

    // ── Scraping + Perplexity en paralelo ──────────────────────
    console.log("[regenerar] scraping + Perplexity...");
    const [scrapeResult, perplexityResult] = await Promise.all([
      scrapeEmpresa(urlUsada, () => {}),
      buscarConPerplexity(
        opcionesExtra.razonSocial || empresa.nombre,
        dominio,
        "Chile",
        opcionesExtra
      ).catch((err) => {
        console.error("[regenerar] Perplexity falló:", String(err));
        return { contactosTexto: "", inteligenciaTexto: "", fuentes: [] };
      }),
    ]);

    const { texto, nombreDetectado } = scrapeResult;
    console.log(`[regenerar] scraping: ${texto?.length ?? 0} chars | Perplexity: ${perplexityResult.contactosTexto.length + perplexityResult.inteligenciaTexto.length} chars`);

    if (!texto || texto.length < 50) {
      return Response.json({ error: "No se pudo leer el sitio web. Verifica que la URL sea accesible." }, { status: 422 });
    }

    // ── Una sola llamada a Claude ───────────────────────────────
    const anthropic = new Anthropic({ apiKey });

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

    const nombreEmpresa = nombreDetectado || opcionesExtra.razonSocial || empresa.nombre;

    const prompt =
      `${PROMPT_INVESTIGADOR}\n\n` +
      `URL: ${urlUsada}\nNombre detectado: ${nombreEmpresa}\nDominio: ${dominio}\n\n` +
      `${datosExtraBloque}${notasBloque}` +
      `--- TEXTO DEL SITIO WEB ---\n${textoWeb}` +
      perplexityBloque;

    console.log(`[regenerar] llamando a Claude | prompt: ${prompt.length} chars`);

    let mensaje: Awaited<ReturnType<typeof anthropic.messages.create>>;
    try {
      mensaje = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 6000,
        messages: [{ role: "user", content: prompt }],
      });
    } catch (claudeErr) {
      console.error("[regenerar] ERROR Claude:", claudeErr instanceof Error ? claudeErr.message : claudeErr);
      throw claudeErr;
    }

    const textoRespuesta = mensaje.content[0]?.type === "text" ? mensaje.content[0].text : "";
    console.log(`[regenerar] Claude respondió: ${textoRespuesta.length} chars | stop_reason: ${mensaje.stop_reason} | tokens: ${mensaje.usage?.output_tokens ?? "?"}`);

    // ── Parsear y completar decisores con LinkedIn URL ──────────
    const fichaParseada = extraerJsonSeguro<FichaIA>(textoRespuesta);
    if (!fichaParseada) {
      console.error("[regenerar] JSON no parseado. Últimos 500 chars:", textoRespuesta.slice(-500));
    }
    const fichaBase = fichaParseada ?? fichaFallback(empresa.nombre, urlUsada);

    const ficha: FichaIA = {
      ...fichaBase,
      decisores: fichaBase.decisores.map((d) => ({
        ...d,
        linkedin_url: d.persona_encontrada?.linkedin_url ||
          `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(d.cargo + " " + fichaBase.nombre)}`,
      })),
    };

    console.log(`[regenerar] ficha: nombre="${ficha.nombre}" | decisores: ${ficha.decisores.length}`);

    const busquedaWebRaw: BusquedaWebRaw | null = contactosLimpio || inteligenciaLimpia
      ? { contactosTexto: perplexityResult.contactosTexto, inteligenciaTexto: perplexityResult.inteligenciaTexto, fuentes: perplexityResult.fuentes, buscado_en: new Date().toISOString() }
      : null;

    // ── Guardar en DB ───────────────────────────────────────────
    await actualizarFichaCompleta(params.id, ficha);
    console.log("[regenerar] ficha guardada");

    if (ficha.decisores.length > 0) {
      const contactosDecisores = ficha.decisores.map((d) => ({
        empresa_id: params.id,
        nombre: d.persona_encontrada?.nombre ?? d.cargo,
        cargo: d.cargo,
        area: d.area as "adquisiciones" | "calidad" | "operaciones" | "gerencia" | "otro",
        notas_ia: [
          d.por_que_es_clave,
          `Dolor específico: ${d.dolor_especifico}`,
          `Buscar en LinkedIn: ${d.query_linkedin}`,
          d.persona_encontrada?.nombre ? `Persona encontrada: ${d.persona_encontrada.nombre} (confianza: ${d.persona_encontrada.confianza})` : null,
        ].filter(Boolean).join("\n\n"),
        linkedin_url: (d as FichaIA["decisores"][number] & { linkedin_url?: string }).linkedin_url ?? null,
        es_decisor: true,
      }));
      const { error: contactosErr } = await supabase
        .from("contactos")
        .upsert(contactosDecisores, { onConflict: "empresa_id,cargo", ignoreDuplicates: true });
      if (contactosErr) {
        console.error("[regenerar] error guardando contactos:", contactosErr);
      } else {
        console.log(`[regenerar] contactos guardados: ${contactosDecisores.length}`);
      }
    }

    if (busquedaWebRaw) {
      await supabase.from("empresas").update({ busqueda_web_raw: busquedaWebRaw }).eq("id", params.id);
    }

    revalidatePath(`/cuentas/${params.id}`);
    console.log(`[regenerar] completado: "${ficha.nombre}"`);

    return Response.json({ ok: true, nombre: ficha.nombre });
  } catch (error) {
    console.error("[regenerar] ERROR:", error instanceof Error ? error.message : error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
