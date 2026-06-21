// =============================================================
// POST /api/empresas/[id]/actualizar-angulo
// Regenera SOLO el ángulo de entrada usando el contexto actual
// del vendedor (notas_vendedor) y la ficha existente, sin
// reinvestigar la empresa ni llamar a scraping.
// Se activa por botón explícito — nunca en background.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getEmpresaById, updateEmpresa } from "@/lib/queries";
import { SYSTEM_PROMPT_VALE } from "@/lib/prompts";
import { registrarUso } from "@/lib/registrarUso";
import type { FichaIA } from "@/lib/types";

export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const empresa = await getEmpresaById(id);
  if (!empresa) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const ficha = empresa.ficha_ia;
  if (!ficha) {
    return NextResponse.json(
      { error: "Esta empresa no tiene ficha de IA. Investígala primero." },
      { status: 400 }
    );
  }

  const prompt = `Dado el perfil de esta empresa y el contexto actualizado del vendedor, genera un nuevo ángulo de entrada SPIN en 3-4 líneas. Basa el análisis SOLO en la información proporcionada, sin inventar datos externos.

EMPRESA: ${empresa.nombre}
INDUSTRIA: ${empresa.industria ?? "no especificada"}
DESCRIPCIÓN: ${ficha.descripcion ?? ficha.que_fabrican_o_venden ?? "no disponible"}
QUÉ FABRICAN/VENDEN: ${ficha.que_fabrican_o_venden ?? "no especificado"}
POR QUÉ NECESITAN ETIQUETAS: ${ficha.por_que_necesitan_etiquetas ?? "no especificado"}
RESUMEN EJECUTIVO: ${ficha.resumen_ejecutivo ?? "no disponible"}
TÉCNICA DE VENTA RECOMENDADA: ${ficha.tecnica_recomendada ?? "no definida"}
ÁNGULO ANTERIOR: ${ficha.angulo_entrada ?? "ninguno"}

CONTEXTO DEL VENDEDOR (lo que solo él sabe — PRIORIZAR esto):
${empresa.notas_vendedor?.trim() ? empresa.notas_vendedor : "Sin contexto adicional del vendedor."}

Responde ÚNICAMENTE con el nuevo ángulo de entrada. Sin prefijos, sin comillas, sin explicaciones. Solo el texto del ángulo en 3-4 líneas.`;

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: SYSTEM_PROMPT_VALE,
    messages: [{ role: "user", content: prompt }],
  });

  void registrarUso({
    api: "claude",
    endpoint: "claude-haiku-4-5-20251001",
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    empresa_id: id,
  });

  const nuevoAngulo =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

  if (!nuevoAngulo) {
    return NextResponse.json({ error: "La IA no devolvió un ángulo válido" }, { status: 500 });
  }

  // Actualiza solo angulo_entrada dentro del JSONB ficha_ia
  const fichaActualizada: FichaIA = { ...ficha, angulo_entrada: nuevoAngulo };
  await updateEmpresa(id, { ficha_ia: fichaActualizada });

  return NextResponse.json({ ok: true, angulo_entrada: nuevoAngulo });
}
