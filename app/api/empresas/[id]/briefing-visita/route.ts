// =============================================================
// POST /api/empresas/[id]/briefing-visita
// Genera un briefing pre-visita estructurado con 4 secciones:
// Lo que sabes, Lo que NO sabes, 3 preguntas SPIN, Estado MEDDIC.
// Solo se ejecuta cuando el vendedor presiona el botón explícito.
// No persiste en BD — solo se devuelve para mostrar en pantalla.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { getEmpresaCompleta, getHistorialResumido } from "@/lib/queries";
import { buildPromptBriefingVisita, SYSTEM_PROMPT_VALE } from "@/lib/prompts";
import { extraerJsonSeguro } from "@/lib/json-parser";

export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

// Sección individual del briefing
export interface SeccionBriefing {
  titulo: string;
}

export interface BriefingVisita {
  lo_que_sabes: {
    titulo: string;
    resumen_empresa: string;
    contexto_comercial: string;
    contactos_conocidos: string[];
    senales_activas: string[];
    estado_meddic: string;
  };
  lo_que_no_sabes: {
    titulo: string;
    gaps: Array<{
      campo: string;
      por_que_importa: string;
      como_obtenerlo: string;
    }>;
  };
  preguntas_clave: {
    titulo: string;
    preguntas: Array<{
      tipo: string;
      pregunta: string;
      objetivo: string;
      a_quien_dirigir: string;
    }>;
  };
  estado_meddic: {
    titulo: string;
    criterios: Array<{
      criterio: string;
      estado: "cubierto" | "parcial" | "falta";
      detalle: string;
    }>;
    prioridad_visita: string;
  };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const empresaId = params.id;
  if (!empresaId) {
    return NextResponse.json({ error: "ID de empresa requerido" }, { status: 400 });
  }

  // Obtener datos de la empresa en paralelo
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [empresa, historial, scoringRow] = await Promise.all([
    getEmpresaCompleta(empresaId),
    getHistorialResumido(empresaId),
    supabase
      .from("empresas")
      .select("scoring_meddic, senales_activas, notas_vendedor, ficha_ia")
      .eq("id", empresaId)
      .single()
      .then((r) => r.data),
  ]);

  if (!empresa) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  // Construir contexto completo para el prompt
  const ficha = empresa.ficha_ia as Record<string, unknown> | null;
  const scoringMeddic = (scoringRow?.scoring_meddic as Record<string, unknown> | null) ?? null;
  const senalesActivas = (scoringRow?.senales_activas as string[] | null) ?? [];
  const notasVendedor = (scoringRow?.notas_vendedor as string | null) ?? "";

  const contactosTexto =
    (empresa.contactos ?? []).length > 0
      ? (empresa.contactos ?? [])
          .map((c) => `- ${c.nombre ?? "Sin nombre"} — ${c.cargo ?? "Sin cargo"}${c.area ? ` (${c.area})` : ""}${c.es_decisor ? " [decisor]" : ""}`)
          .join("\n")
      : "Sin contactos registrados";

  const senalesTexto =
    senalesActivas.length > 0
      ? senalesActivas.map((s) => `- ${s}`).join("\n")
      : "Sin señales activas";

  const meddicTexto = scoringMeddic
    ? Object.entries(scoringMeddic)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join("\n")
    : "Sin scoring MEDDIC registrado";

  const contexto = `
EMPRESA: ${empresa.nombre}
INDUSTRIA: ${(ficha?.industria as string) ?? "No especificada"}
DESCRIPCIÓN: ${(ficha?.descripcion as string) ?? "Sin descripción"}
TAMAÑO ESTIMADO: ${(ficha?.tamano_estimado as string) ?? "No especificado"}
REGIÓN: ${(ficha?.region as string) ?? "No especificada"}
ESTADO COMERCIAL: ${empresa.estado ?? "Sin etapa"}
NOTAS DEL VENDEDOR: ${notasVendedor || "Sin notas"}

CONTACTOS CONOCIDOS:
${contactosTexto}

SEÑALES ACTIVAS:
${senalesTexto}

SCORING MEDDIC:
${meddicTexto}

HISTORIAL DE INTERACCIONES (últimas 12):
${historial}
`.trim();

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT_VALE,
    messages: [
      {
        role: "user",
        content: buildPromptBriefingVisita(contexto),
      },
    ],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text : "";

  console.log("[briefing-visita] raw Claude response (primeros 500 chars):", raw.substring(0, 500));

  const briefing = extraerJsonSeguro<BriefingVisita>(raw);
  if (!briefing) {
    return NextResponse.json(
      { error: "Error al parsear la respuesta de la IA", raw },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, briefing });
}
