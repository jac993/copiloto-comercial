// =============================================================
// POST /api/empresas/[id]/actualizar-angulo
// Regenera SOLO la estrategia de entrada usando el contexto
// completo: ficha_ia, contactos/decisores registrados, historial
// de interacciones y notas_vendedor. Sin reinvestigar.
// Lógica compartida con /api/empresas/[id]/regenerar — ver
// lib/anguloEntrada.ts.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { generarYGuardarAnguloEntrada } from "@/lib/anguloEntrada";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const angulo_entrada = await generarYGuardarAnguloEntrada(id);
    revalidatePath(`/cuentas/${id}`);
    return NextResponse.json({ ok: true, angulo_entrada });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = msg.includes("no encontrada") ? 404 : msg.includes("no tiene ficha") ? 400 : 500;
    console.error("[actualizar-angulo] error:", msg, "| empresa_id:", id);
    return NextResponse.json({ error: msg }, { status });
  }
}
