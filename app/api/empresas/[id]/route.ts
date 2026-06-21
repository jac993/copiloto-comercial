// =============================================================
// PATCH /api/empresas/[id] — Actualiza campos editables de una
// empresa directamente (sin reinvestigar). Usado por la UI para
// editar notas_vendedor y otros campos simples.
// =============================================================

import { guardarNotasVendedor } from "@/lib/queries";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const body = (await request.json()) as { notas_vendedor?: string | null };

    if (body.notas_vendedor === undefined) {
      return Response.json({ error: "Sin campos para actualizar" }, { status: 400 });
    }

    await guardarNotasVendedor(id, body.notas_vendedor ?? null);

    return Response.json({ ok: true });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    console.error("[PATCH /api/empresas/[id]]", mensaje);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
