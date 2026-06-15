// POST /api/empresas/[id]/regenerar-decisores
// Lee la ficha_ia existente y regenera solo el array de decisores con Claude.
// Reemplaza ficha_ia.decisores en Supabase sin tocar la tabla contactos.
// Los contactos agregados manualmente (en tabla contactos) no se ven afectados.

import Anthropic from "@anthropic-ai/sdk";
import { getEmpresaById } from "@/lib/queries";
import { PROMPT_REGENERAR_DECISORES } from "@/lib/prompts";
import type { DecisorIA } from "@/lib/types";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const { id } = params;
  const empresa = await getEmpresaById(id);

  if (!empresa?.ficha_ia) {
    return Response.json({ error: "Empresa sin ficha de IA" }, { status: 404 });
  }

  const ficha = empresa.ficha_ia;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const mensaje = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `${PROMPT_REGENERAR_DECISORES}

FICHA DE LA EMPRESA:
Nombre: ${ficha.nombre}
Industria: ${ficha.industria}
Qué fabrican o venden: ${ficha.que_fabrican_o_venden}
Por qué necesitan etiquetas: ${ficha.por_que_necesitan_etiquetas}
Tamaño: ${ficha.tamano_estimado}
Región: ${ficha.region}
Resumen: ${ficha.resumen_ejecutivo}`,
      },
    ],
  });

  const contenido = mensaje.content[0];
  if (contenido.type !== "text") {
    return Response.json({ error: "Respuesta inesperada de Claude" }, { status: 500 });
  }

  const jsonMatch = contenido.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return Response.json({ error: "No se pudo extraer JSON de la respuesta" }, { status: 500 });
  }

  const resultado = JSON.parse(jsonMatch[0]) as { decisores: DecisorIA[] };

  // Actualizar solo ficha_ia.decisores en Supabase, manteniendo el resto intacto
  const fichaActualizada = { ...ficha, decisores: resultado.decisores };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await supabase
    .from("empresas")
    .update({ ficha_ia: fichaActualizada })
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, decisores: resultado.decisores });
}
