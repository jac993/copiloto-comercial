// POST /api/contactos — Registra un contacto encontrado manualmente por el vendedor.
// Llamado desde tab-decisores cuando el vendedor encuentra a alguien en LinkedIn.
import { NextResponse } from "next/server";
import { insertContacto } from "@/lib/queries";
import type { ContactoInsert, AreaContacto } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;

    const { empresa_id, nombre, cargo, area, telefono, email, es_decisor, notas_ia } = body;

    if (!empresa_id || typeof empresa_id !== "string") {
      return NextResponse.json(
        { error: "empresa_id es requerido" },
        { status: 400 }
      );
    }
    if (!nombre || typeof nombre !== "string") {
      return NextResponse.json(
        { error: "nombre es requerido" },
        { status: 400 }
      );
    }

    const contacto: ContactoInsert = {
      empresa_id,
      nombre,
      cargo: typeof cargo === "string" ? cargo : null,
      area: typeof area === "string" ? area as AreaContacto : null,
      telefono: typeof telefono === "string" ? telefono : null,
      email: typeof email === "string" ? email : null,
      linkedin_url: null,
      notas_ia: typeof notas_ia === "string" ? notas_ia : null,
      es_decisor: typeof es_decisor === "boolean" ? es_decisor : false,
    };

    const nuevo = await insertContacto(contacto);
    return NextResponse.json(nuevo, { status: 201 });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
