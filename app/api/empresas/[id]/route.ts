// =============================================================
// PATCH /api/empresas/[id] — Actualiza campos editables de una
// empresa directamente (sin reinvestigar). Usado por la UI para
// editar notas_vendedor y otros campos simples.
// =============================================================

import { updateEmpresa } from "@/lib/queries";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const body = (await request.json()) as { notas_vendedor?: string | null };

  if (body.notas_vendedor === undefined) {
    return Response.json({ error: "Sin campos para actualizar" }, { status: 400 });
  }

  const empresa = await updateEmpresa(id, {
    notas_vendedor: body.notas_vendedor ?? null,
  });

  return Response.json({ ok: true, empresa });
}
