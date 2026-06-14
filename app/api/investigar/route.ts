// =============================================================
// POST /api/investigar — Investiga una empresa con IA
// Usa Server-Sent Events para enviar progreso en tiempo real.
// REGLA: Solo se activa cuando el usuario aprieta "Investigar".
// =============================================================

import Anthropic from "@anthropic-ai/sdk";
import { scrapeEmpresa } from "@/lib/scraper";
import { guardarEmpresaDesdeFicha } from "@/lib/queries";
import { PROMPT_INVESTIGADOR } from "@/lib/prompts";
import type { FichaIA } from "@/lib/types";

// Tiempo máximo de la función serverless (en segundos)
export const maxDuration = 60;

const encoder = new TextEncoder();

// Envía un evento SSE al stream
function enviarEvento(
  controller: ReadableStreamDefaultController,
  tipo: string,
  payload: Record<string, unknown>
) {
  const data = JSON.stringify({ type: tipo, ...payload });
  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
}

// Extrae JSON de la respuesta de Claude (maneja markdown y texto libre)
function extraerJson(texto: string): FichaIA {
  // Intento 1: parse directo
  try {
    return JSON.parse(texto) as FichaIA;
  } catch {}

  // Intento 2: extraer de bloque markdown ```json ... ```
  const markdownMatch = texto.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch) {
    try {
      return JSON.parse(markdownMatch[1]) as FichaIA;
    } catch {}
  }

  // Intento 3: encontrar el primer objeto JSON en el texto
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]) as FichaIA;
  }

  throw new Error("No se pudo extraer JSON de la respuesta de IA");
}

export async function POST(request: Request) {
  // Validar que hay API key de Anthropic
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Falta ANTHROPIC_API_KEY en .env.local" },
      { status: 500 }
    );
  }

  const { url } = (await request.json()) as { url?: string };

  if (!url?.trim()) {
    return Response.json({ error: "URL requerida" }, { status: 400 });
  }

  // Stream SSE — el cliente lee este stream para mostrar progreso
  const stream = new ReadableStream({
    async start(controller) {
      const send = (tipo: string, payload: Record<string, unknown>) =>
        enviarEvento(controller, tipo, payload);

      try {
        // PASO A: Scraping del sitio web
        const { texto, nombreDetectado } = await scrapeEmpresa(
          url.trim(),
          (msg) => send("progreso", { mensaje: msg })
        );

        if (!texto || texto.length < 50) {
          throw new Error(
            "No se pudo leer el sitio web. Verifica que la URL sea correcta y accesible."
          );
        }

        // PASO B: Análisis con Claude
        send("progreso", { mensaje: "Analizando con IA..." });

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const mensaje = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `${PROMPT_INVESTIGADOR}\n\nURL analizada: ${url.trim()}\nNombre detectado: ${nombreDetectado}\n\n--- TEXTO DEL SITIO WEB ---\n${texto}`,
            },
          ],
        });

        const contenido = mensaje.content[0];
        if (contenido.type !== "text") {
          throw new Error("Respuesta inesperada de Claude");
        }

        const ficha = extraerJson(contenido.text);

        // PASO C: Guardar en Supabase
        send("progreso", { mensaje: "Guardando ficha en tu base de datos..." });

        console.log("[investigar] Guardando empresa:", ficha.nombre, url.trim());
        const empresa = await guardarEmpresaDesdeFicha(ficha, url.trim());
        console.log("[investigar] Empresa guardada con ID:", empresa.id);

        send("resultado", {
          empresaId: empresa.id,
          nombre: empresa.nombre,
        });
      } catch (error) {
        const mensaje =
          error instanceof Error ? error.message : "Error desconocido";
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
