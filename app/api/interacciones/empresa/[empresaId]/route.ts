// GET /api/interacciones/empresa/[empresaId]
// Devuelve todas las interacciones de una empresa.
// Usado como fallback de sincronización cuando /crear no devuelve el objeto completo.

import { NextRequest, NextResponse } from "next/server";
import { getInteraccionesPorEmpresa } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: { empresaId: string } }
) {
  try {
    const { empresaId } = params;
    if (!empresaId) {
      return NextResponse.json({ error: "empresaId requerido" }, { status: 400 });
    }
    const interacciones = await getInteraccionesPorEmpresa(empresaId);
    return NextResponse.json({ ok: true, interacciones });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
