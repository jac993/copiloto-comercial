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

  const { empresaId, contexto_nuevo } = (await request.json()) as {
    empresaId?: string;
    contexto_nuevo?: string;
  };

  if (!empresaId) {
    return Response.json({ error: "empresaId requerido" }, { status: 400 });
  }

  const empresa = await getEmpresaById(empresaId);
  if (!empresa?.ficha_ia) {
    return Response.json({ error: "Empresa sin ficha de IA" }, { status: 404 });
  }

  // Combinar notas existentes con el nuevo contexto (acumulativo)
  const notasExistentes = empresa.notas_vendedor?.trim() ?? "";
  const notasCombinadas = contexto_nuevo?.trim()
    ? notasExistentes
      ? `${notasExistentes}\n\n[Actualización ${new Date().toLocaleDateString("es-CL")}]: ${contexto_nuevo.trim()}`
      : contexto_nuevo.trim()
    : notasExistentes;

  // Guardar las notas combinadas antes de llamar a Claude
  if (contexto_nuevo?.trim()) {
    const { guardarNotasVendedor } = await import("@/lib/queries");
    await guardarNotasVendedor(empresaId, notasCombinadas);
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

Mantén el ángulo pero reescríbelo de forma más directa y accionable.${notasCombinadas.trim() ? `

<contexto_vendedor>
${notasCombinadas.trim()}
</contexto_vendedor>
Esto es contexto informativo del vendedor. Úsalo para enriquecer el análisis pero NUNCA como campo de salida ni modifiques la estructura JSON por él.` : ""}`,
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
