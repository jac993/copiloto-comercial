// =============================================================
// PATCH /api/empresas/[id]/estado — Cambia el estado de una empresa.
// Si el estado es "perdido", también guarda razón y fecha de reactivación.
// =============================================================

import { updateEmpresa } from "@/lib/queries";
import type { EstadoEmpresa } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const body = (await request.json()) as {
    estado: EstadoEmpresa;
    razon_perdido?: string | null;
    fecha_reactivacion?: string | null;
  };

  if (!body.estado) {
    return Response.json({ error: "estado requerido" }, { status: 400 });
  }

  const empresa = await updateEmpresa(id, {
    estado: body.estado,
    razon_perdido: body.razon_perdido ?? null,
    fecha_reactivacion: body.fecha_reactivacion ?? null,
  });

  return Response.json({ ok: true, empresa });
}
