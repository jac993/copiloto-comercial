// =============================================================
// POST /api/tareas/no-realizada
// Cierra una tarea/prioridad sin interacción real: el vendedor
// indica que no la realizó. Desaparecerá al día siguiente.
// Body: { tarea_id: string, origen: 'manual' | 'ia' }
// Response: { ok: true }
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hoyCL, sumarDiasHabilesDesde } from "@/lib/fecha";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const body = await req.json() as { tarea_id?: string; origen?: "manual" | "ia" };
  const { tarea_id, origen } = body;

  if (!tarea_id || !origen) {
    return NextResponse.json(
      { error: "tarea_id y origen son requeridos" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  if (origen === "manual") {
    // Tareas de cadencia NO se descartan: se arrastran al siguiente día
    // hábil (carry-over) y el paso siguiente no se crea hasta resolverlas.
    const { data: fila } = await supabase
      .from("interacciones")
      .select("cadencia_asignacion_id, proximo_paso_fecha")
      .eq("id", tarea_id)
      .maybeSingle();

    if (fila?.cadencia_asignacion_id) {
      const hoy = hoyCL();
      // Carry-over SOLO si la tarea vencía hoy o antes. Si su fecha es futura
      // (aún no llega su turno), no la adelantamos — se queda en su fecha.
      if (fila.proximo_paso_fecha && (fila.proximo_paso_fecha as string) <= hoy) {
        const { error } = await supabase
          .from("interacciones")
          .update({ proximo_paso_fecha: sumarDiasHabilesDesde(hoy, 1) })
          .eq("id", tarea_id);
        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
      }
      return NextResponse.json({ ok: true, carryOver: true });
    }

    const { error } = await supabase
      .from("interacciones")
      .update({ resuelta: true, no_realizada: true })
      .eq("id", tarea_id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("prioridades_diarias")
      .update({
        completada: true,
        completada_en: new Date().toISOString(),
        no_realizada: true,
      })
      .eq("id", tarea_id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
