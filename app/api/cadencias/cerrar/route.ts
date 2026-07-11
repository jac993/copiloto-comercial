// =============================================================
// POST /api/cadencias/cerrar — Cierra una asignación de cadencia.
// motivo: 'respondio' | 'manual' | 'agotada'. Cancela las tareas
// de cadencia pendientes (marcadas, no borradas).
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cerrarAsignacion } from "@/lib/cadencias-server";

const MOTIVOS = ["respondio", "manual", "agotada"] as const;
type Motivo = typeof MOTIVOS[number];

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  try {
    const body = await req.json() as { asignacion_id?: string; motivo?: string };
    const { asignacion_id, motivo } = body;

    if (!asignacion_id || !motivo || !MOTIVOS.includes(motivo as Motivo)) {
      return NextResponse.json(
        { error: "asignacion_id y motivo (respondio|manual|agotada) son requeridos" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await cerrarAsignacion(supabase, asignacion_id, motivo as Motivo);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[CADENCIAS_CERRAR]", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
