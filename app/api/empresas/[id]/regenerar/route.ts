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

// Genera los 6 decisores fijos para cualquier empresa manufacturera chilena.
// No dependen del JSON de Claude — se construyen con los cargos estándar y
// una LinkedIn URL de búsqueda programática para que el vendedor encuentre a la persona.
function crearDecisoresHardcoded(nombreEmpresa: string, industria: string): FichaIA["decisores"] {
  const industiaBrief = industria ? ` en ${industria}` : "";
  const cargos: Array<{
    cargo: string;
    area: FichaIA["decisores"][number]["area"];
    dolor_especifico: string;
    por_que_es_clave: string;
    tecnica_recomendada: string;
    query_linkedin: string;
  }> = [
    {
      cargo: "Jefe/a de Calidad",
      area: "calidad",
      dolor_especifico: `Lotes rechazados, no conformidades y auditorías fallidas por problemas de etiquetado${industiaBrief}.`,
      por_que_es_clave: "Sufre el dolor más intenso: rechazos, re-etiquetados y devoluciones. El aliado ideal para construir el caso de negocio.",
      tecnica_recomendada: "SPIN",
      query_linkedin: `Jefe Calidad ${nombreEmpresa} Chile`,
    },
    {
      cargo: "Jefe/Gerente de Operaciones",
      area: "operaciones",
      dolor_especifico: `Paros de línea, retrasos y re-etiquetados que impactan el OEE${industiaBrief}.`,
      por_que_es_clave: "Siente el impacto en producción cuando las etiquetas fallan. Convierte el dolor en caso de negocio interno.",
      tecnica_recomendada: "consultiva",
      query_linkedin: `Jefe Operaciones ${nombreEmpresa} Chile`,
    },
    {
      cargo: "Jefe/a de Logística o Despacho",
      area: "operaciones",
      dolor_especifico: `Errores de despacho y picking por etiquetas ilegibles o incorrectas${industiaBrief}.`,
      por_que_es_clave: "Depende de etiquetas logísticas fiables para cumplir plazos y evitar devoluciones de clientes.",
      tecnica_recomendada: "consultiva",
      query_linkedin: `Jefe Logística ${nombreEmpresa} Chile`,
    },
    {
      cargo: "Gerente de Planta",
      area: "operaciones",
      dolor_especifico: `KPIs de planta afectados por inconsistencias de adhesivos, colores o troqueles${industiaBrief}.`,
      por_que_es_clave: "Aprueba o bloquea cambios de proveedor que afectan la línea. Necesita ROI claro antes de mover el proceso.",
      tecnica_recomendada: "challenger",
      query_linkedin: `Gerente Planta ${nombreEmpresa} Chile`,
    },
    {
      cargo: "Jefe/Gerente de Compras o Adquisiciones",
      area: "adquisiciones",
      dolor_especifico: `Presión de costos, riesgo de desabastecimiento y homologación de nuevos proveedores${industiaBrief}.`,
      por_que_es_clave: "Guardián formal del cambio de proveedor. Resistente al cambio; requiere datos de costo total y condiciones claras.",
      tecnica_recomendada: "relacional",
      query_linkedin: `Jefe Compras ${nombreEmpresa} Chile`,
    },
    {
      cargo: "Gerente General o Dueño",
      area: "gerencia",
      dolor_especifico: `Riesgo reputacional, regulatorio o de mercado asociado a fallas de etiquetado${industiaBrief}.`,
      por_que_es_clave: "En PYMEs decide todo. Visión global: crecimiento, riesgo y continuidad operacional.",
      tecnica_recomendada: "challenger",
      query_linkedin: `Gerente General ${nombreEmpresa} Chile`,
    },
  ];

  return cargos.map((c) => ({
    cargo: c.cargo,
    area: c.area,
    dolor_especifico: c.dolor_especifico,
    por_que_es_clave: c.por_que_es_clave,
    tecnica_recomendada: c.tecnica_recomendada,
    persona_encontrada: null,
    query_linkedin: c.query_linkedin,
    linkedin_url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(c.query_linkedin)}`,
  }));
}

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
    const contactosLimpio = sanitizarTexto(perplexityResult.contactosTexto, 3000).slice(0, 2000);
    const inteligenciaLimpia = sanitizarTexto(perplexityResult.inteligenciaTexto, 3000).slice(0, 2000);

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
        system: "Eres un analizador de empresas B2B chilenas. Respondes ÚNICAMENTE con un objeto JSON válido. Nunca escribes texto fuera del JSON. Nunca te disculpas ni explicas. Solo JSON.",
        messages: [{ role: "user", content: prompt }],
      });
    } catch (claudeErr) {
      console.error("[regenerar] ERROR Claude:", claudeErr instanceof Error ? claudeErr.message : claudeErr);
      throw claudeErr;
    }

    const textoRespuesta = mensaje.content[0]?.type === "text" ? mensaje.content[0].text : "";
    console.log(`[regenerar] Claude respondió: ${textoRespuesta.length} chars | stop_reason: ${mensaje.stop_reason} | tokens: ${mensaje.usage?.output_tokens ?? "?"}`);

    // ── Parsear ficha + generar 6 decisores hardcodeados ────────
    const fichaParseada = extraerJsonSeguro<FichaIA>(textoRespuesta);
    if (!fichaParseada) {
      console.error("[regenerar] JSON no parseado. Últimos 500 chars:", textoRespuesta.slice(-500));
    }
    const fichaBase = fichaParseada ?? fichaFallback(empresa.nombre, urlUsada);

    const ficha: FichaIA = {
      ...fichaBase,
      preguntas_spin: fichaBase.preguntas_spin?.slice(0, 2) ?? [],
      decisores: crearDecisoresHardcoded(fichaBase.nombre, fichaBase.industria ?? ""),
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
        nombre: d.cargo,
        cargo: d.cargo,
        area: d.area,
        notas_ia: `${d.por_que_es_clave}\n\nDolor: ${d.dolor_especifico}\n\nLinkedIn: ${d.query_linkedin}`,
        linkedin_url: d.linkedin_url ?? null,
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
