// =============================================================
// POST /api/empresas/[id]/analizar-todo
// Lee TODAS las interacciones de la empresa en orden cronológico,
// construye el hilo completo y llama a Claude con
// PROMPT_ANALISIS_CONVERSACION para un diagnóstico integral.
// Es el análisis más costoso y valioso de la app.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { getEmpresaById } from "@/lib/queries";
import { PROMPT_ANALISIS_CONVERSACION } from "@/lib/prompts";
import { registrarUso } from "@/lib/registrarUso";
import type { Interaccion, AnalisisConversacion } from "@/lib/types";

export const maxDuration = 60;

const TIPO_LABEL: Record<string, string> = {
  llamada: "Llamada",
  email: "Correo",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  reunion: "Reunión",
  sin_respuesta: "Sin respuesta",
};

const SENTIMIENTO_LABEL: Record<string, string> = {
  positivo: "Positivo ✅",
  neutro:   "Neutro 😐",
  negativo: "Negativo ❌",
  sin_respuesta: "Sin respuesta",
};

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const [empresa, { data: interaccionesData }] = await Promise.all([
      getEmpresaById(params.id),
      supabase
        .from("interacciones")
        .select("*")
        .eq("empresa_id", params.id)
        .order("fecha", { ascending: true }),
    ]);

    if (!empresa) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const interacciones = (interaccionesData ?? []) as Interaccion[];

    if (interacciones.length < 2) {
      return NextResponse.json(
        { error: "Se necesitan al menos 2 interacciones para analizar la conversación completa." },
        { status: 400 }
      );
    }

    // Textos que marcan que el prospecto respondió (o no), guardados en transcripcion
    const TEXTOS_RESOLUCION = new Set([
      "Respondió al contacto",
      "Vio el mensaje pero no respondió",
      "Sin respuesta tras 48h",
    ]);
    const TIPOS_COUNTDOWN = new Set(["whatsapp", "email", "linkedin"]);

    // Construir el hilo cronológico completo, agrupando respuestas del prospecto
    const usados = new Set<string>();
    const entradas: string[] = [];
    let entradaIdx = 0;

    for (let idx = 0; idx < interacciones.length; idx++) {
      const i = interacciones[idx];
      if (usados.has(i.id)) continue;

      // Las resoluciones se emiten junto a su original, no solas
      if (TEXTOS_RESOLUCION.has(i.transcripcion ?? "")) {
        usados.add(i.id);
        continue;
      }

      entradaIdx++;
      const fecha = new Date(i.fecha).toLocaleDateString("es-CL", {
        day: "numeric", month: "short", year: "numeric",
      });
      const tipo = TIPO_LABEL[i.tipo] ?? i.tipo;
      const resumen = i.resumen_ia ?? i.transcripcion?.trim() ?? "(sin contenido registrado)";
      const badge = i.badge_estado ? ` | Diagnóstico IA: ${i.badge_estado}` : "";
      const proximo = i.proximo_paso ? ` | Próximo paso: ${i.proximo_paso}` : "";

      // Buscar resolución posterior del mismo canal
      let resolucionInfo: Interaccion | null = null;
      if (TIPOS_COUNTDOWN.has(i.tipo)) {
        for (let j = idx + 1; j < interacciones.length; j++) {
          const j2 = interacciones[j];
          if (usados.has(j2.id)) continue;
          if (j2.tipo === i.tipo && TEXTOS_RESOLUCION.has(j2.transcripcion ?? "")) {
            resolucionInfo = j2;
            usados.add(j2.id);
            break;
          }
        }
      }

      if (resolucionInfo) {
        const fechaResp = new Date(resolucionInfo.fecha).toLocaleDateString("es-CL", {
          day: "numeric", month: "short", year: "numeric",
        });
        const sentLabel =
          resolucionInfo.sentimiento === "positivo" ? "positivo"
          : resolucionInfo.sentimiento === "negativo" ? "negativo"
          : "neutro";
        entradas.push(
          `INTERACCIÓN ${entradaIdx} — ${tipo} (${fecha})${badge}${proximo}\n` +
          `Vendedor: "${resumen}"\n` +
          `[${fechaResp}] Respuesta del prospecto: "${resolucionInfo.transcripcion ?? ""}" → Resultado: ${sentLabel}`
        );
      } else {
        const resultado = i.sentimiento ? ` | Resultado: ${SENTIMIENTO_LABEL[i.sentimiento] ?? i.sentimiento}` : "";
        entradas.push(
          `INTERACCIÓN ${entradaIdx} — ${tipo} (${fecha})${resultado}${badge}${proximo}\n${resumen}`
        );
      }
    }

    const hiloCompleto = entradas.join("\n\n---\n\n");

    const mensajeAnalisis = `
EMPRESA: ${empresa.nombre}
INDUSTRIA: ${empresa.industria ?? "No especificada"}
ESTADO ACTUAL EN CRM: ${empresa.estado}
SCORE DE PRIORIDAD: ${empresa.score_prioridad}/100
NOTAS DEL VENDEDOR: ${empresa.notas_vendedor ?? "Ninguna"}
TOTAL DE INTERACCIONES: ${interacciones.length}
PRIMERA INTERACCIÓN: ${new Date(interacciones[0].fecha).toLocaleDateString("es-CL")}
ÚLTIMA INTERACCIÓN: ${new Date(interacciones[interacciones.length - 1].fecha).toLocaleDateString("es-CL")}

===== HILO COMPLETO DE LA RELACIÓN COMERCIAL =====

${hiloCompleto}
`.trim();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: PROMPT_ANALISIS_CONVERSACION,
      messages: [{ role: "user", content: mensajeAnalisis }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") throw new Error("Claude no devolvió texto");
    registrarUso({ api: "claude", endpoint: "claude-sonnet-4-6", input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens, empresa_id: params.id });

    let analisis: AnalisisConversacion;
    try {
      const jsonLimpio = textContent.text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
      analisis = JSON.parse(jsonLimpio) as AnalisisConversacion;
    } catch {
      throw new Error("Error parseando respuesta de IA. Intenta de nuevo.");
    }

    return NextResponse.json({ ok: true, analisis, total_interacciones: interacciones.length });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
