// API route de diagnóstico — verifica conexión y lista empresas
// Eliminar o proteger con auth antes de ir a producción
import { NextResponse } from "next/server";
import { getEmpresas } from "@/lib/queries";

export async function GET() {
  try {
    const empresas = await getEmpresas();
    return NextResponse.json({
      ok: true,
      total: empresas.length,
      empresas,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 });
  }
}
