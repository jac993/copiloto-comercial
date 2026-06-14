// =============================================================
// POST /api/investigar/regenerar — Regenera angulo_entrada,
// razon_tecnica y preguntas_spin incorporando notas_vendedor.
// REGLA: solo se activa cuando el usuario aprieta "Regenerar".
// No borra el resto de la ficha_ia.
// =============================================================

import Anthropic from "@anthropic-ai/sdk";
import { getEmpresaById, actualizarCamposRegenerados } from "@/lib/queries";
import { PROMPT_REGENERAR } from "@/lib/prompts";
import type { FichaIA } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });
  }

  const { empresaId } = (await request.json()) as { empresaId?: string };

  if (!empresaId) {
    return Response.json({ error: "empresaId requerido" }, { status: 400 });
  }

  const empresa = await getEmpresaById(empresaId);
  if (!empresa?.ficha_ia) {
    return Response.json({ error: "Empresa sin ficha de IA" }, { status: 404 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const mensaje = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${PROMPT_REGENERAR}

FICHA EXISTENTE (no modificar los demás campos):
Empresa: ${empresa.ficha_ia.nombre}
Industria: ${empresa.ficha_ia.industria}
Ángulo actual: ${empresa.ficha_ia.angulo_entrada}
Técnica actual: ${empresa.ficha_ia.tecnica_recomendada} — ${empresa.ficha_ia.razon_tecnica}
Preguntas SPIN actuales: ${JSON.stringify(empresa.ficha_ia.preguntas_spin)}

NOTAS DEL VENDEDOR:
${empresa.notas_vendedor?.trim() || "(el vendedor no ha agregado notas aún — mantén el ángulo pero reescríbelo de forma más directa)"}`,
      },
    ],
  });

  const contenido = mensaje.content[0];
  if (contenido.type !== "text") {
    return Response.json({ error: "Respuesta inesperada de Claude" }, { status: 500 });
  }

  // Extraer JSON de la respuesta
  const jsonMatch = contenido.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return Response.json({ error: "No se pudo extraer JSON de la respuesta" }, { status: 500 });
  }

  const campos = JSON.parse(jsonMatch[0]) as {
    angulo_entrada: string;
    razon_tecnica: string;
    preguntas_spin: [string, string, string];
  };

  const empresaActualizada = await actualizarCamposRegenerados(empresaId, campos);

  return Response.json({ ok: true, ficha_ia: empresaActualizada.ficha_ia as FichaIA });
}
