// =============================================================
// POST /api/preparacion
// Genera 3 borradores de apertura (WhatsApp, Correo, LinkedIn)
// usando técnica SPIN, datos del decisor principal y historial
// reciente. Solo se llama cuando el usuario presiona el botón.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { PROMPT_BORRADORES_APERTURA } from "@/lib/prompts";
import { registrarUso } from "@/lib/registrarUso";
import type { FichaIA, Interaccion, Contacto } from "@/lib/types";

export const maxDuration = 30;

const MODEL = "claude-haiku-4-5-20251001";

export interface BorradoresApertura {
  whatsapp: string;
  correo: { asunto: string; cuerpo: string };
  linkedin: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      empresaId: string;
      nombreEmpresa: string;
      industria?: string | null;
      notasVendedor?: string | null;
      ficha: FichaIA;
      interacciones: Interaccion[];
      contactos: Contacto[];
    };

    const { empresaId, nombreEmpresa, industria, notasVendedor, ficha, interacciones, contactos } = body;

    if (!empresaId || !nombreEmpresa || !ficha) {
      return NextResponse.json({ error: "empresaId, nombreEmpresa y ficha son requeridos" }, { status: 400 });
    }

    // Decisor principal: primero buscar en contactos reales, luego en decisores IA
    const decisorReal = contactos.find((c) => c.es_decisor) ?? contactos[0] ?? null;
    const decisorIA = ficha.decisores[0] ?? null;

    const nombreDecisor = decisorReal?.nombre ?? null;
    const cargoDecisor = decisorReal?.cargo ?? decisorIA?.cargo ?? "decisor de compras";
    const areaDecisor = decisorReal?.area ?? decisorIA?.area ?? "";
    const dolorPrincipal = decisorIA?.dolor_especifico ?? "problemas de calidad y continuidad en el suministro de etiquetas";
    const tecnica = decisorIA?.tecnica_recomendada ?? ficha.tecnica_recomendada ?? "consultiva";

    // Últimas 3 interacciones con resumen
    const ultimasInteracciones = interacciones
      .filter((i) => i.resumen_ia)
      .slice(0, 3);

    const historialTexto = ultimasInteracciones.length > 0
      ? ultimasInteracciones.map((i) => {
          const fecha = new Date(i.fecha).toLocaleDateString("es-CL");
          return `- ${fecha} (${i.tipo}): ${i.resumen_ia}${i.proximo_paso ? ` → Próximo paso acordado: ${i.proximo_paso}` : ""}`;
        }).join("\n")
      : "Sin interacciones previas registradas (primer contacto en frío).";

    const contextoVendedor = `
EMPRESA DESTINO:
- Nombre: ${nombreEmpresa}
- Industria: ${industria ?? ficha.industria ?? "no especificada"}
- Descripción: ${ficha.descripcion}
- Por qué necesitan etiquetas: ${ficha.por_que_necesitan_etiquetas}
- Ángulo de entrada: ${ficha.angulo_entrada}

DECISOR PRINCIPAL:
- Nombre: ${nombreDecisor ?? "(no identificado aún)"}
- Cargo: ${cargoDecisor}
- Área: ${areaDecisor}
- Dolor específico: ${dolorPrincipal}
- Técnica recomendada: ${tecnica}

CONTEXTO DEL VENDEDOR (lo que solo él sabe):
${notasVendedor?.trim() ? notasVendedor : "Sin notas adicionales."}

HISTORIAL DE INTERACCIONES PREVIAS:
${historialTexto}
`.trim();

    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `${PROMPT_BORRADORES_APERTURA}\n\n---\n\n${contextoVendedor}`,
        },
      ],
    });

    void registrarUso({
      api: "claude",
      endpoint: MODEL,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      empresa_id: empresaId,
    });

    const texto = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    // Extraer JSON aunque venga con markdown fence
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[preparacion] respuesta sin JSON válido:", texto.slice(0, 300));
      return NextResponse.json({ error: "La IA no devolvió un JSON válido" }, { status: 500 });
    }

    const borradores = JSON.parse(jsonMatch[0]) as BorradoresApertura;

    if (!borradores.whatsapp || !borradores.correo?.asunto || !borradores.correo?.cuerpo || !borradores.linkedin) {
      return NextResponse.json({ error: "Respuesta incompleta de la IA" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, borradores });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error("[preparacion] error:", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
