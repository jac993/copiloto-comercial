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
import type { Interaccion, AnalisisConversacion } from "@/lib/types";

export const maxDuration = 60;

const TIPO_LABEL: Record<string, string> = {
  llamada: "Llamada",
  email: "Correo",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
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

    // Construir el hilo cronológico completo
    const hiloCompleto = interacciones
      .map((i, idx) => {
        const fecha = new Date(i.fecha).toLocaleDateString("es-CL", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        const tipo = TIPO_LABEL[i.tipo] ?? i.tipo;
        const contenido = i.transcripcion?.trim()
          || i.resumen_ia
          || "(sin contenido registrado)";

        const badge = i.badge_estado ? ` | Estado IA: ${i.badge_estado}` : "";
        const proximo = i.proximo_paso ? ` | Próximo paso registrado: ${i.proximo_paso}` : "";

        return `INTERACCIÓN ${idx + 1} — ${tipo} (${fecha})${badge}${proximo}\n${contenido}`;
      })
      .join("\n\n---\n\n");

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
