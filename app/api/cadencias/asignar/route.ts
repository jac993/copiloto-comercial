// =============================================================
// POST /api/cadencias/asignar — Inicia una cadencia para una
// empresa + decisor. Crea la asignación y SOLO la primera tarea
// (nunca todas de golpe): los pasos siguientes se generan al
// completar el anterior, con los canales disponibles del momento.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hoyCL, sumarDiasHabilesDesde } from "@/lib/fecha";
import { canalesDisponibles, resolverCanal } from "@/lib/cadencias";
import { getPasosDeCadencia, crearTareaDePaso } from "@/lib/cadencias-server";
import type { CanalCadenciaPaso } from "@/lib/types";

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  try {
    const body = await req.json() as {
      empresa_id?: string;
      contacto_id?: string;
      cadencia_id?: string;
    };
    const { empresa_id, contacto_id, cadencia_id } = body;

    if (!empresa_id || !contacto_id || !cadencia_id) {
      return NextResponse.json(
        { error: "empresa_id, contacto_id y cadencia_id son requeridos" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Validar que no exista asignación activa (el unique index respalda ante carrera)
    const { data: existente } = await supabase
      .from("cadencia_asignaciones")
      .select("id")
      .eq("empresa_id", empresa_id)
      .eq("estado", "activa")
      .maybeSingle();
    if (existente) {
      return NextResponse.json(
        { error: "Esta empresa ya tiene una cadencia activa. Deténla antes de iniciar otra." },
        { status: 409 }
      );
    }

    // Canales disponibles del decisor EN ESTE MOMENTO
    const { data: contacto } = await supabase
      .from("contactos")
      .select("id, email, telefono, linkedin_url")
      .eq("id", contacto_id)
      .maybeSingle();
    if (!contacto) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const pasos = await getPasosDeCadencia(supabase, cadencia_id);
    if (pasos.length === 0) {
      return NextResponse.json({ error: "La cadencia no tiene pasos definidos" }, { status: 422 });
    }

    const disponibles = canalesDisponibles(contacto);
    if (disponibles.size === 0) {
      return NextResponse.json(
        { error: "El decisor no tiene ningún canal de contacto registrado (email, teléfono o LinkedIn)." },
        { status: 422 }
      );
    }

    // Primer paso ejecutable (los omitidos al inicio se saltan)
    let primerPaso: { orden: number; canal: CanalCadenciaPaso; intencion: string; dia_offset: number } | null = null;
    let canalAnterior: CanalCadenciaPaso | null = null;
    for (const paso of pasos) {
      const canal = resolverCanal(paso, disponibles, canalAnterior);
      if (canal !== null) {
        primerPaso = { orden: paso.orden, canal, intencion: paso.intencion, dia_offset: paso.dia_offset };
        break;
      }
    }
    if (!primerPaso) {
      return NextResponse.json(
        { error: "Ningún paso de la cadencia es ejecutable con los canales disponibles del decisor." },
        { status: 422 }
      );
    }

    const hoy = hoyCL();
    const { data: asignacion, error: eAsig } = await supabase
      .from("cadencia_asignaciones")
      .insert({
        empresa_id,
        contacto_id,
        cadencia_id,
        fecha_inicio: hoy,
        paso_actual: primerPaso.orden,
        estado: "activa",
      })
      .select("id")
      .single();
    if (eAsig || !asignacion) {
      return NextResponse.json({ error: eAsig?.message ?? "No se pudo crear la asignación" }, { status: 500 });
    }

    await crearTareaDePaso(supabase, {
      asignacionId: asignacion.id as string,
      empresaId: empresa_id,
      contactoId: contacto_id,
      canal: primerPaso.canal,
      orden: primerPaso.orden,
      totalPasos: pasos.length,
      intencion: primerPaso.intencion,
      fechaTarea: sumarDiasHabilesDesde(hoy, primerPaso.dia_offset),
    });

    return NextResponse.json({ ok: true, asignacion_id: asignacion.id });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[CADENCIAS_ASIGNAR]", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
