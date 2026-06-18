// =============================================================
// POST /api/investigar — Investiga una empresa con IA
// Flujo: scraping + Perplexity en paralelo → una sola llamada Claude
// REGLA: Solo se activa cuando el usuario aprieta "Investigar".
// =============================================================

import Anthropic from "@anthropic-ai/sdk";
import { scrapeEmpresa, buscarConPerplexity, normalizarUrl } from "@/lib/scraper";
import { guardarEmpresaDesdeFicha } from "@/lib/queries";
import { PROMPT_INVESTIGADOR } from "@/lib/prompts";
import { sanitizarTexto, extraerJsonSeguro } from "@/lib/json-parser";
import type { FichaIA, BusquedaWebRaw } from "@/lib/types";

export const maxDuration = 180;

// Genera los 6 decisores fijos — no dependen del JSON de Claude.
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

const encoder = new TextEncoder();

function enviarEvento(
  controller: ReadableStreamDefaultController,
  tipo: string,
  payload: Record<string, unknown>
) {
  const data = JSON.stringify({ type: tipo, ...payload });
  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
}

function fichaFallback(nombreDetectado: string, urlSitio: string): FichaIA {
  return {
    nombre: nombreDetectado || urlSitio,
    industria: "Por determinar",
    descripcion: "Análisis pendiente — el sitio web no devolvió suficiente información.",
    que_fabrican_o_venden: "Por determinar",
    por_que_necesitan_etiquetas: "Por determinar",
    productos_etiquetas: [],
    tamano_estimado: "mediana",
    region: "Por determinar",
    senales_oportunidad: [],
    decisores: [],
    angulo_entrada: "Investigación incompleta. Vuelve a investigar esta empresa.",
    tecnica_recomendada: "consultiva",
    razon_tecnica: "Por determinar",
    preguntas_spin: ["Por determinar", "Por determinar", "Por determinar"],
    objeciones_probables: [],
    resumen_ejecutivo: "No se pudo generar la ficha completa. Vuelve a intentarlo.",
    verificacion_contexto: [],
  };
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Falta ANTHROPIC_API_KEY en .env.local" }, { status: 500 });
  }

  const { url, contexto_vendedor, razon_social, rut, ciudad, rubro } = (await request.json()) as {
    url?: string;
    contexto_vendedor?: string;
    razon_social?: string;
    rut?: string;
    ciudad?: string;
    rubro?: string;
  };

  if (!url?.trim()) {
    return Response.json({ error: "URL requerida" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (tipo: string, payload: Record<string, unknown>) =>
        enviarEvento(controller, tipo, payload);

      try {
        const urlLimpia = url.trim().split("?")[0].split("#")[0].trim();
        const urlNorm = normalizarUrl(urlLimpia);
        let dominio = "";
        try {
          dominio = new URL(urlNorm).hostname.replace(/^www\./, "");
        } catch {
          dominio = urlLimpia;
        }

        const opcionesExtra = {
          razonSocial: razon_social?.trim(),
          rut: rut?.trim(),
          ciudad: ciudad?.trim(),
          rubro: rubro?.trim(),
        };

        // ── Scraping + Perplexity en paralelo ─────────────────
        send("progreso", { mensaje: "Leyendo el sitio web..." });

        const [scrapeResult, perplexityResult] = await Promise.all([
          scrapeEmpresa(urlLimpia, (msg) => send("progreso", { mensaje: msg })),
          (async () => {
            send("progreso", { mensaje: "Buscando en internet..." });
            try {
              return await buscarConPerplexity(
                razon_social?.trim() || dominio.split(".")[0],
                dominio,
                "Chile",
                opcionesExtra
              );
            } catch {
              return { contactosTexto: "", inteligenciaTexto: "", fuentes: [] };
            }
          })(),
        ]);

        const { texto, nombreDetectado } = scrapeResult;

        if (!texto || texto.length < 50) {
          throw new Error(
            "No se pudo leer el sitio web. Verifica que la URL sea correcta y accesible."
          );
        }

        // ── Una sola llamada a Claude ──────────────────────────
        send("progreso", { mensaje: "Analizando con IA..." });

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const textoWeb = sanitizarTexto(texto, 15000);
        const contactosLimpio = sanitizarTexto(perplexityResult.contactosTexto, 3000).slice(0, 2000);
        const inteligenciaLimpia = sanitizarTexto(perplexityResult.inteligenciaTexto, 3000).slice(0, 2000);

        const perplexityBloque = contactosLimpio || inteligenciaLimpia
          ? `\n\n--- CONTACTOS (Perplexity) ---\n${contactosLimpio || "Sin resultados."}\n\n--- INTELIGENCIA COMERCIAL (Perplexity) ---\n${inteligenciaLimpia || "Sin resultados."}\n\nFUENTES: ${perplexityResult.fuentes.join(", ") || "ninguna"}`
          : "";

        const contextoBloque = contexto_vendedor?.trim()
          ? `CONTEXTO PREVIO DEL VENDEDOR:\n${contexto_vendedor.trim()}\n\n`
          : "";

        const datosExtra = [
          razon_social?.trim() ? `Razón social oficial: ${razon_social.trim()}` : "",
          rut?.trim() ? `RUT: ${rut.trim()}` : "",
          ciudad?.trim() ? `Ciudad/Región: ${ciudad.trim()}` : "",
          rubro?.trim() ? `Rubro declarado: ${rubro.trim()}` : "",
        ].filter(Boolean).join("\n");
        const datosExtraBloque = datosExtra ? `DATOS ADICIONALES PROVISTOS:\n${datosExtra}\n\n` : "";

        const nombreEmpresa = nombreDetectado || razon_social?.trim() || dominio.split(".")[0];

        const prompt =
          `${PROMPT_INVESTIGADOR}\n\n` +
          `URL: ${urlLimpia}\nNombre detectado: ${nombreEmpresa}\nDominio: ${dominio}\n\n` +
          `${datosExtraBloque}${contextoBloque}` +
          `--- TEXTO DEL SITIO WEB ---\n${textoWeb}` +
          perplexityBloque;

        const mensaje = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 6000,
          system: "Eres un analizador de empresas B2B chilenas. Respondes ÚNICAMENTE con un objeto JSON válido. Nunca escribes texto fuera del JSON. Nunca te disculpas ni explicas. Solo JSON.",
          messages: [{ role: "user", content: prompt }],
        });

        const textoRespuesta = mensaje.content[0]?.type === "text" ? mensaje.content[0].text : "";

        // ── Parsear y completar decisores con LinkedIn URL ─────
        send("progreso", { mensaje: "Guardando ficha..." });

        const fichaParseada = extraerJsonSeguro<FichaIA>(textoRespuesta);
        const fichaBase = fichaParseada ?? fichaFallback(nombreDetectado, urlLimpia);

        // Decisores hardcodeados — no dependen del JSON de Claude para evitar truncación
        const ficha: FichaIA = {
          ...fichaBase,
          preguntas_spin: fichaBase.preguntas_spin?.slice(0, 2) ?? [],
          decisores: crearDecisoresHardcoded(fichaBase.nombre, fichaBase.industria ?? ""),
        };

        const busquedaWebRaw: BusquedaWebRaw | null = contactosLimpio || inteligenciaLimpia
          ? {
              contactosTexto: perplexityResult.contactosTexto,
              inteligenciaTexto: perplexityResult.inteligenciaTexto,
              fuentes: perplexityResult.fuentes,
              buscado_en: new Date().toISOString(),
            }
          : null;

        const empresa = await guardarEmpresaDesdeFicha(
          ficha,
          urlLimpia,
          contexto_vendedor?.trim() || null,
          busquedaWebRaw,
          { razonSocial: razon_social?.trim(), rut: rut?.trim() }
        );

        send("resultado", { empresaId: empresa.id, nombre: empresa.nombre });
        send("progreso", { mensaje: "¡Listo!" });
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        send("error", { mensaje });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
