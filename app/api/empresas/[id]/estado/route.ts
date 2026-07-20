// =============================================================
// PATCH /api/empresas/[id]/estado — Cambia el estado de una empresa.
// Si el estado es "perdido", también guarda razón y fecha de reactivación.
// Mantiene estado_desde (base de "días en etapa"): se reinicia a hoy
// SOLO cuando el estado realmente cambia — un PATCH redundante con el
// mismo estado no debe resetear el contador de enfriamiento.
// =============================================================

import { getEmpresaById, updateEmpresa } from "@/lib/queries";
import { hoyCL } from "@/lib/fecha";
import type { EstadoEmpresa, EmpresaUpdate } from "@/lib/types";

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

  const actual = await getEmpresaById(id);
  if (!actual) {
    return Response.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const cambios: EmpresaUpdate = {
    estado: body.estado,
    razon_perdido: body.razon_perdido ?? null,
    fecha_reactivacion: body.fecha_reactivacion ?? null,
  };
  if (actual.estado !== body.estado) {
    cambios.estado_desde = hoyCL();
  }

  const empresa = await updateEmpresa(id, cambios);

  return Response.json({ ok: true, empresa });
}
