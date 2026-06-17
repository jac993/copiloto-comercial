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
  console.log(`[regenerar] iniciando para empresa ${params.id}`);
  try {
    const empresa = await getEmpresaById(params.id);
    if (!empresa) {
      console.error(`[regenerar] empresa ${params.id} no encontrada en DB`);
      return Response.json({ error: "Empresa no encontrada" }, { status: 404 });
    }
    console.log(`[regenerar] empresa encontrada: ${empresa.nombre} | url actual: ${empresa.url}`);

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("[regenerar] falta ANTHROPIC_API_KEY");
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
      console.log("[regenerar] body recibido:", JSON.stringify(body));
    } catch (bodyErr) {
      console.log("[regenerar] body vacío o inválido (normal si se llama sin body):", String(bodyErr));
    }

    // Resolver URL a usar (preferir la del body si viene; limpiar parámetros)
    const urlUsada = limpiarUrl(body.url?.trim() || empresa.url || "");
    if (!urlUsada) {
      console.error("[regenerar] empresa sin URL y body sin url");
      return Response.json({ error: "Esta empresa no tiene URL para reinvestigar." }, { status: 422 });
    }
    console.log(`[regenerar] URL a usar: ${urlUsada}`);

    // Actualizar campos en DB si el usuario los cambió
    const supabase = await getSupabaseServer();
    const actualizaciones: Record<string, string | null> = { url: urlUsada };
    if (body.razon_social !== undefined) actualizaciones.razon_social = body.razon_social.trim() || null;
    if (body.rut !== undefined) actualizaciones.rut = body.rut.trim() || null;
    if (body.notas_vendedor !== undefined) actualizaciones.notas_vendedor = body.notas_vendedor.trim() || null;
    const { error: updateErr } = await supabase.from("empresas").update(actualizaciones).eq("id", params.id);
    if (updateErr) {
      console.error("[regenerar] error actualizando campos en DB:", updateErr);
    } else {
      console.log("[regenerar] campos actualizados en DB:", actualizaciones);
    }

    const urlNorm = normalizarUrl(urlUsada);
    let dominio = "";
    try { dominio = new URL(urlNorm).hostname.replace(/^www\./, ""); } catch { dominio = urlUsada; }
    const opcionesExtra = {
      razonSocial: body.razon_social?.trim() || empresa.razon_social || undefined,
      rut: body.rut?.trim() || empresa.rut || undefined,
      ciudad: body.ciudad?.trim(),
      rubro: body.rubro?.trim(),
    };
    console.log(`[regenerar] dominio: ${dominio} | opcionesExtra:`, opcionesExtra);

    // ── Scraping + Perplexity en paralelo ────────────────────
    console.log("[regenerar] iniciando scraping + Perplexity en paralelo...");
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

    console.log(`[regenerar] scraping completo: ${scrapeResult.texto?.length ?? 0} chars | nombreDetectado: "${scrapeResult.nombreDetectado}"`);
    console.log(`[regenerar] Perplexity: contactos ${perplexityResult.contactosTexto.length} chars | inteligencia ${perplexityResult.inteligenciaTexto.length} chars | fuentes: ${perplexityResult.fuentes.length}`);

    const { texto, nombreDetectado } = scrapeResult;
    if (!texto || texto.length < 50) {
      console.error(`[regenerar] texto scrapeado demasiado corto: ${texto?.length ?? 0} chars`);
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

    const promptCompleto =
      `${PROMPT_INVESTIGADOR}\n\nURL: ${urlUsada}\nNombre detectado: ${nombreDetectado || empresa.nombre}\nDominio: ${dominio}\n\n` +
      `${datosExtraBloque}${notasBloque}--- TEXTO DEL SITIO WEB ---\n${textoWeb}${perplexityBloque}`;

    console.log(`[regenerar] llamando a Claude... modelo: claude-sonnet-4-6 | max_tokens: 4000 | prompt: ${promptCompleto.length} chars`);

    const mensaje = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: promptCompleto }],
    });

    const textoRespuesta = mensaje.content[0]?.type === "text" ? mensaje.content[0].text : "";
    console.log(`[regenerar] Claude respondió: ${textoRespuesta.length} chars | stop_reason: ${mensaje.stop_reason} | tokens usados: ${mensaje.usage?.output_tokens ?? "?"}`);
    console.log("[regenerar] primeros 300 chars de respuesta:", textoRespuesta.slice(0, 300));

    const fichaParseada = extraerJsonSeguro<FichaIA>(textoRespuesta);
    if (!fichaParseada) {
      console.error("[regenerar] extraerJsonSeguro retornó null — JSON malformado o truncado. Usando fichaFallback.");
      console.error("[regenerar] últimos 300 chars de respuesta:", textoRespuesta.slice(-300));
    } else {
      console.log(`[regenerar] JSON parseado OK: nombre="${fichaParseada.nombre}" | decisores: ${fichaParseada.decisores?.length ?? 0}`);
    }
    const ficha = fichaParseada ?? fichaFallback(empresa.nombre, urlUsada);

    // Guardar raw de Perplexity si hubo resultados
    const busquedaWebRaw: BusquedaWebRaw | null = contactosLimpio || inteligenciaLimpia
      ? { contactosTexto: perplexityResult.contactosTexto, inteligenciaTexto: perplexityResult.inteligenciaTexto, fuentes: perplexityResult.fuentes, buscado_en: new Date().toISOString() }
      : null;

    console.log("[regenerar] guardando ficha en DB con actualizarFichaCompleta...");
    await actualizarFichaCompleta(params.id, ficha);
    console.log("[regenerar] actualizarFichaCompleta OK");

    if (busquedaWebRaw) {
      const { error: rawErr } = await supabase.from("empresas").update({ busqueda_web_raw: busquedaWebRaw }).eq("id", params.id);
      if (rawErr) console.error("[regenerar] error guardando busqueda_web_raw:", rawErr);
      else console.log("[regenerar] busqueda_web_raw guardado OK");
    }

    // Invalidar caché de Next.js para que router.refresh() sirva datos frescos
    revalidatePath(`/cuentas/${params.id}`);
    console.log(`[regenerar] revalidatePath /cuentas/${params.id} OK`);
    console.log(`[regenerar] completado exitosamente: nombre="${ficha.nombre}"`);

    return Response.json({ ok: true, nombre: ficha.nombre });
  } catch (error) {
    console.error("[regenerar] ERROR no manejado:", error);
    console.error("[regenerar] stack:", error instanceof Error ? error.stack : "no stack");
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
