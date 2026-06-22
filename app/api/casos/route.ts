// GET  /api/casos — Lista todos los casos reales de One Label.
// POST /api/casos — Crea un caso nuevo.

import { NextRequest, NextResponse } from "next/server";
import { getCasos, insertCaso } from "@/lib/queries";
import type { CasoInsert, TecnicaCaso, TamanoCaso, CanalCaso } from "@/lib/types";

export async function GET() {
  try {
    const casos = await getCasos();
    return NextResponse.json({ casos });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    const { sector, problema, solucion, resultado } = body;

    if (!sector || typeof sector !== "string") {
      return NextResponse.json({ error: "sector es requerido" }, { status: 400 });
    }
    if (!problema || typeof problema !== "string") {
      return NextResponse.json({ error: "problema es requerido" }, { status: 400 });
    }
    if (!solucion || typeof solucion !== "string") {
      return NextResponse.json({ error: "solucion es requerida" }, { status: 400 });
    }
    if (!resultado || typeof resultado !== "string") {
      return NextResponse.json({ error: "resultado es requerido" }, { status: 400 });
    }

    const caso: CasoInsert = {
      sector,
      problema,
      solucion,
      resultado,
      tamano_empresa:    typeof body.tamano_empresa === "string"  ? body.tamano_empresa as TamanoCaso  : null,
      cargo_decisor:     typeof body.cargo_decisor === "string"   ? body.cargo_decisor  || null        : null,
      proveedor_anterior:typeof body.proveedor_anterior==="string"? body.proveedor_anterior || null    : null,
      tipo_etiqueta:     typeof body.tipo_etiqueta === "string"   ? body.tipo_etiqueta  || null        : null,
      objecion_vencida:  typeof body.objecion_vencida === "string"? body.objecion_vencida || null      : null,
      canal_entrada:     typeof body.canal_entrada === "string"   ? body.canal_entrada  as CanalCaso   : null,
      tecnica_venta:     typeof body.tecnica_venta === "string"   ? body.tecnica_venta  as TecnicaCaso : null,
      tiempo_cierre:     typeof body.tiempo_cierre === "string"   ? body.tiempo_cierre  || null        : null,
      activo: true,
    };

    const nuevo = await insertCaso(caso);
    return NextResponse.json(nuevo, { status: 201 });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
