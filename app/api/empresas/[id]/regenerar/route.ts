// POST /api/empresas/[id]/regenerar
// Reinvestiga la empresa: scraping + Perplexity + Claude (2 llamadas).
// Acepta campos opcionales para actualizar URL, razón social, notas.
// REGLA: requiere clic explícito del usuario (⚡ usa créditos).
//
// Divide la llamada en dos para evitar truncamiento JSON:
//   Llamada 1: PROMPT_FICHA_BASICA  → ficha base sin decisores (2500 tokens)
//   Llamada 2: PROMPT_DECISORES_PERPLEXITY → decisores + inteligencia (2500 tokens)

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { getEmpresaById, actualizarFichaCompleta } from "@/lib/queries";
import { scrapeEmpresa, buscarConPerplexity, normalizarUrl } from "@/lib/scraper";
import { PROMPT_FICHA_BASICA, PROMPT_DECISORES_PERPLEXITY } from "@/lib/prompts";
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

type FichaBasicaIA = Omit<FichaIA, "decisores" | "inteligencia_comercial">;
type DecisoresIA = Pick<FichaIA, "decisores" | "inteligencia_comercial">;

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
  console.log(`[regenerar] iniciando para empresa ${params.id}`);
  try {
    const empresa = await getEmpresaById(params.id);
    if (!empresa) {
      console.error(`[regenerar] empresa ${params.id} no encontrada en DB`);
      return Response.json({ error: "Empresa no encontrada" }, { status: 404 });
    }
    console.log(`[regenerar] empresa encontrada: ${empresa.nombre} | url actual: ${empresa.url}`);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log("[regenerar] ANTHROPIC_API_KEY presente:", !!apiKey, "| longitud:", apiKey?.length ?? 0);
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
      console.log("[regenerar] body recibido:", JSON.stringify(body));
    } catch (bodyErr) {
      console.log("[regenerar] body vacío o inválido:", String(bodyErr));
    }

    // Resolver URL a usar
    const urlUsada = limpiarUrl(body.url?.trim() || empresa.url || "");
    if (!urlUsada) {
      console.error("[regenerar] empresa sin URL y body sin url");
      return Response.json({ error: "Esta empresa no tiene URL para reinvestigar." }, { status: 422 });
    }
    console.log(`[regenerar] URL a usar: ${urlUsada}`);

    // Actualizar campos en DB si el usuario los cambió
    const supabase = getSupabaseAdmin();
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

    const { texto, nombreDetectado } = scrapeResult;
    console.log(`[regenerar] scraping: ${texto?.length ?? 0} chars | nombreDetectado: "${nombreDetectado}"`);
    console.log(`[regenerar] Perplexity: contactos ${perplexityResult.contactosTexto.length} chars | inteligencia ${perplexityResult.inteligenciaTexto.length} chars`);

    if (!texto || texto.length < 50) {
      console.error(`[regenerar] texto scrapeado demasiado corto: ${texto?.length ?? 0} chars`);
      return Response.json({ error: "No se pudo leer el sitio web. Verifica que la URL sea accesible." }, { status: 422 });
    }

    const anthropic = new Anthropic({ apiKey });

    const textoWeb = sanitizarTexto(texto, 15000);
    const contactosLimpio = sanitizarTexto(perplexityResult.contactosTexto, 3000);
    const inteligenciaLimpia = sanitizarTexto(perplexityResult.inteligenciaTexto, 3000);

    const perplexityBloque = contactosLimpio || inteligenciaLimpia
      ? `--- CONTACTOS (Perplexity) ---\n${contactosLimpio || "Sin resultados."}\n\n--- INTELIGENCIA COMERCIAL (Perplexity) ---\n${inteligenciaLimpia || "Sin resultados."}\n\nFUENTES: ${perplexityResult.fuentes.join(", ") || "ninguna"}`
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

    // ── Llamada 1: ficha base (sin decisores) ─────────────────
    const prompt1 =
      `${PROMPT_FICHA_BASICA}\n\n` +
      `URL: ${urlUsada}\nNombre detectado: ${nombreDetectado || empresa.nombre}\nDominio: ${dominio}\n\n` +
      `${datosExtraBloque}${notasBloque}--- TEXTO DEL SITIO WEB ---\n${textoWeb}`;

    console.log(`[regenerar] llamada 1 Claude (ficha base) | prompt: ${prompt1.length} chars`);

    let msg1: Awaited<ReturnType<typeof anthropic.messages.create>>;
    try {
      msg1 = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt1 }],
      });
    } catch (claudeErr) {
      console.error("[regenerar] ERROR llamada 1 Claude:", claudeErr instanceof Error ? claudeErr.message : claudeErr);
      throw claudeErr;
    }

    const texto1 = msg1.content[0]?.type === "text" ? msg1.content[0].text : "";
    console.log(`[regenerar] llamada 1 respondió: ${texto1.length} chars | stop_reason: ${msg1.stop_reason} | tokens: ${msg1.usage?.output_tokens ?? "?"}`);
    console.log("[regenerar] llamada 1 primeros 300 chars:", texto1.slice(0, 300));

    const fichaBasica = extraerJsonSeguro<FichaBasicaIA>(texto1);
    if (!fichaBasica) {
      console.error("[regenerar] llamada 1: JSON no parseado. Últimos 300 chars:", texto1.slice(-300));
    } else {
      console.log(`[regenerar] llamada 1 OK: nombre="${fichaBasica.nombre}"`);
    }

    // ── Llamada 2: decisores + inteligencia ───────────────────
    const nombreEmpresa = fichaBasica?.nombre || nombreDetectado || empresa.nombre;
    const industriaEmpresa = fichaBasica?.industria || body.rubro?.trim() || "Por determinar";

    const prompt2 =
      `${PROMPT_DECISORES_PERPLEXITY}\n\n` +
      `Empresa: ${nombreEmpresa}\n` +
      `Industria: ${industriaEmpresa}\n` +
      `Qué fabrican/venden: ${fichaBasica?.que_fabrican_o_venden || "Por determinar"}\n\n` +
      (perplexityBloque || "Sin resultados de búsqueda en internet.");

    console.log(`[regenerar] llamada 2 Claude (decisores) | prompt: ${prompt2.length} chars`);

    let msg2: Awaited<ReturnType<typeof anthropic.messages.create>>;
    try {
      msg2 = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt2 }],
      });
    } catch (claudeErr) {
      console.error("[regenerar] ERROR llamada 2 Claude:", claudeErr instanceof Error ? claudeErr.message : claudeErr);
      throw claudeErr;
    }

    const texto2 = msg2.content[0]?.type === "text" ? msg2.content[0].text : "";
    console.log(`[regenerar] llamada 2 respondió: ${texto2.length} chars | stop_reason: ${msg2.stop_reason} | tokens: ${msg2.usage?.output_tokens ?? "?"}`);

    const decisoresParsed = extraerJsonSeguro<DecisoresIA>(texto2);
    if (!decisoresParsed) {
      console.error("[regenerar] llamada 2: JSON no parseado. Últimos 300 chars:", texto2.slice(-300));
    } else {
      console.log(`[regenerar] llamada 2 OK: decisores: ${decisoresParsed.decisores?.length ?? 0}`);
    }

    // ── Fusionar ambos JSONs ───────────────────────────────────
    const fichaBase = fichaBasica ?? fichaFallback(empresa.nombre, urlUsada);
    const ficha: FichaIA = {
      ...fichaBase,
      decisores: decisoresParsed?.decisores ?? [],
      inteligencia_comercial: decisoresParsed?.inteligencia_comercial ?? undefined,
    };
    console.log(`[regenerar] ficha fusionada: nombre="${ficha.nombre}" | decisores: ${ficha.decisores.length}`);

    // Guardar raw de Perplexity
    const busquedaWebRaw: BusquedaWebRaw | null = contactosLimpio || inteligenciaLimpia
      ? { contactosTexto: perplexityResult.contactosTexto, inteligenciaTexto: perplexityResult.inteligenciaTexto, fuentes: perplexityResult.fuentes, buscado_en: new Date().toISOString() }
      : null;

    console.log("[regenerar] guardando ficha en DB...");
    await actualizarFichaCompleta(params.id, ficha);
    console.log("[regenerar] actualizarFichaCompleta OK");

    if (busquedaWebRaw) {
      const { error: rawErr } = await supabase.from("empresas").update({ busqueda_web_raw: busquedaWebRaw }).eq("id", params.id);
      if (rawErr) console.error("[regenerar] error guardando busqueda_web_raw:", rawErr);
      else console.log("[regenerar] busqueda_web_raw guardado OK");
    }

    revalidatePath(`/cuentas/${params.id}`);
    console.log(`[regenerar] completado exitosamente: nombre="${ficha.nombre}"`);

    return Response.json({ ok: true, nombre: ficha.nombre });
  } catch (error) {
    console.error("[regenerar] ERROR no manejado:", error);
    console.error("[regenerar] stack:", error instanceof Error ? error.stack : "no stack");
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
