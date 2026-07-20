// =============================================================
// PATCH /api/empresas/[id]/monto — Guarda el valor económico
// estimado del negocio (CLP entero). null = quitar el monto.
// Sin IA: escritura directa a empresas.valor_estimado_clp.
// =============================================================

import { updateEmpresa } from "@/lib/queries";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const body = (await request.json()) as { valor_estimado_clp: number | null };
  const valor = body.valor_estimado_clp;

  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
    return Response.json({ error: "Monto inválido" }, { status: 400 });
  }

  const empresa = await updateEmpresa(id, {
    valor_estimado_clp: valor === null ? null : Math.round(valor),
  });

  return Response.json({ ok: true, empresa });
}
