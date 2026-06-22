// PATCH  /api/casos/[id] — Actualiza un caso existente.
// DELETE /api/casos/[id] — Elimina un caso.

import { NextRequest, NextResponse } from "next/server";
import { updateCaso, deleteCaso } from "@/lib/queries";
import type { CasoUpdate, TecnicaCaso, TamanoCaso, CanalCaso } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json() as Record<string, unknown>;

    const cambios: CasoUpdate = {};

    if (typeof body.sector             === "string") cambios.sector              = body.sector;
    if (typeof body.problema           === "string") cambios.problema            = body.problema;
    if (typeof body.solucion           === "string") cambios.solucion            = body.solucion;
    if (typeof body.resultado          === "string") cambios.resultado           = body.resultado;
    if (typeof body.tamano_empresa     === "string") cambios.tamano_empresa      = body.tamano_empresa as TamanoCaso;
    if (typeof body.cargo_decisor      === "string") cambios.cargo_decisor       = body.cargo_decisor  || null;
    if (typeof body.proveedor_anterior === "string") cambios.proveedor_anterior  = body.proveedor_anterior || null;
    if (typeof body.tipo_etiqueta      === "string") cambios.tipo_etiqueta       = body.tipo_etiqueta  || null;
    if (typeof body.objecion_vencida   === "string") cambios.objecion_vencida    = body.objecion_vencida || null;
    if (typeof body.canal_entrada      === "string") cambios.canal_entrada       = body.canal_entrada  as CanalCaso;
    if (typeof body.tecnica_venta      === "string") cambios.tecnica_venta       = body.tecnica_venta  as TecnicaCaso;
    if (typeof body.tiempo_cierre      === "string") cambios.tiempo_cierre       = body.tiempo_cierre  || null;
    if (typeof body.activo             === "boolean") cambios.activo             = body.activo;

    if (Object.keys(cambios).length === 0) {
      return NextResponse.json({ error: "Sin campos para actualizar" }, { status: 400 });
    }

    const actualizado = await updateCaso(id, cambios);
    return NextResponse.json(actualizado);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteCaso(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
