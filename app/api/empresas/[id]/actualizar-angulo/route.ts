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

  const prompt = `Eres un estratega de ventas B2B consultivo. Basándote ÚNICAMENTE en la información proporcionada sobre esta empresa y el contexto del vendedor, genera una estrategia de entrada en formato de análisis, NO un mensaje para enviar.

La estrategia debe tener exactamente esta estructura (usa estos títulos, sin modificarlos):
1. DECISOR DE ENTRADA: quién contactar primero y por qué ese cargo específico
2. MOMENTO: por qué ahora es buen momento (basado en señales reales del contexto)
3. ARGUMENTO: el dolor o problema a plantear, formulado como pregunta, no como afirmación
4. CANAL: qué canal usar primero y por qué
5. RIESGO: qué obstáculo anticipar y cómo manejarlo

Tono: estratégico, directo, como un coach de ventas hablándole al vendedor.
NO generes un mensaje para enviar al prospecto.
NO inventes datos, casos ni porcentajes que no estén en el contexto.
Si no tienes información suficiente para algún punto, indícalo como "Por confirmar".
Máximo 150 palabras en total.

━━━ INFORMACIÓN DE LA EMPRESA ━━━
EMPRESA: ${empresa.nombre}
INDUSTRIA: ${empresa.industria ?? "no especificada"}
QUÉ FABRICAN/VENDEN: ${ficha.que_fabrican_o_venden ?? "no especificado"}
POR QUÉ NECESITAN ETIQUETAS: ${ficha.por_que_necesitan_etiquetas ?? "no especificado"}
RESUMEN EJECUTIVO: ${ficha.resumen_ejecutivo ?? "no disponible"}
SEÑALES DE OPORTUNIDAD: ${ficha.senales_oportunidad?.map((s) => s.descripcion).join("; ") ?? "ninguna detectada"}
TÉCNICA DE VENTA RECOMENDADA: ${ficha.tecnica_recomendada ?? "no definida"}
DECISORES IDENTIFICADOS: ${ficha.decisores?.map((d) => `${d.cargo}: ${d.dolor_especifico ?? d.por_que_es_clave ?? "sin dolor definido"}`).join(" | ") ?? "ninguno"}

━━━ CONTEXTO DEL VENDEDOR (PRIORIZAR — lo que solo él sabe) ━━━
${empresa.notas_vendedor?.trim() ? empresa.notas_vendedor : "Sin contexto adicional del vendedor."}`;

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
