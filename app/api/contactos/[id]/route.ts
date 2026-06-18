// PATCH  /api/contactos/[id] — Actualiza datos de un contacto existente.
// DELETE /api/contactos/[id] — Elimina un contacto.
import { NextRequest, NextResponse } from "next/server";
import { updateContacto, deleteContacto } from "@/lib/queries";
import type { ContactoUpdate, AreaContacto } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { nombre, cargo, area, email, telefono, linkedin_url, notas_ia } = body;

    const cambios: ContactoUpdate = {};
    if (typeof nombre      === "string") cambios.nombre      = nombre;
    if (typeof cargo       === "string") cambios.cargo       = cargo       || null;
    if (typeof area        === "string") cambios.area        = (area || null) as AreaContacto | null;
    if (typeof email       === "string") cambios.email       = email       || null;
    if (typeof telefono    === "string") cambios.telefono    = telefono    || null;
    if (typeof linkedin_url === "string") cambios.linkedin_url = linkedin_url || null;
    if (typeof notas_ia    === "string") cambios.notas_ia    = notas_ia    || null;

    if (Object.keys(cambios).length === 0) {
      return NextResponse.json({ error: "Sin campos para actualizar" }, { status: 400 });
    }

    const actualizado = await updateContacto(params.id, cambios);
    return NextResponse.json(actualizado);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await deleteContacto(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
