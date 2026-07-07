// =============================================================
// POST /api/borradores-feedback
// Guarda la evaluación del vendedor sobre un borrador generado.
// Se llama desde tab-chat (tab "Consultar") cuando el vendedor
// presiona 👍 o 👎 en un borrador. No consume créditos de IA.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { insertBorradorFeedback } from "@/lib/queries";
import type { BorradorFeedbackInsert } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as BorradorFeedbackInsert;
    const { empresa_id, canal, borrador_ia, evaluacion } = body;

    if (!empresa_id || !canal || !borrador_ia || !evaluacion) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: empresa_id, canal, borrador_ia, evaluacion" },
        { status: 400 }
      );
    }

    if (evaluacion !== "positivo" && evaluacion !== "negativo") {
      return NextResponse.json(
        { error: "evaluacion debe ser 'positivo' o 'negativo'" },
        { status: 400 }
      );
    }

    await insertBorradorFeedback(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error("[borradores-feedback] error:", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
