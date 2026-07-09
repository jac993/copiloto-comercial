// =============================================================
// POST /api/tareas/completar
// Verifica que existe una interacción real hoy para la empresa,
// luego marca la tarea/prioridad como completada.
// Body: { tarea_id: string, empresa_id: string, origen: 'manual' | 'ia' }
// Response: { ok: true } | { ok: false, motivo: 'sin_interaccion' }
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hoyCL } from "@/lib/fecha";

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

  const body = await req.json() as {
    tarea_id?: string;
    empresa_id?: string;
    origen?: "manual" | "ia";
  };
  const { tarea_id, empresa_id, origen } = body;

  if (!tarea_id || !empresa_id || !origen) {
    return NextResponse.json(
      { error: "tarea_id, empresa_id y origen son requeridos" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const hoy = hoyCL();

  // Verificar si existe una interacción real hoy para esta empresa.
  // Para tareas manuales excluimos la tarea misma (no cuenta como prueba de sí misma).
  let query = supabase
    .from("interacciones")
    .select("id")
    .eq("empresa_id", empresa_id)
    .gte("fecha", `${hoy}T00:00:00Z`)
    .lte("fecha", `${hoy}T23:59:59Z`);

  if (origen === "manual") {
    query = query.neq("id", tarea_id);
  }

  const { data: interacciones } = await query.limit(1);

  if (!interacciones || interacciones.length === 0) {
    return NextResponse.json({ ok: false, motivo: "sin_interaccion" });
  }

  const interaccionId = interacciones[0].id as string;

  if (origen === "manual") {
    await supabase
      .from("interacciones")
      .update({ resuelta: true, no_realizada: false })
      .eq("id", tarea_id);
  } else {
    // Vincular la interacción real existente a la prioridad vencida
    await supabase
      .from("prioridades_diarias")
      .update({
        completada: true,
        completada_en: new Date().toISOString(),
        no_realizada: false,
        interaccion_id: interaccionId,
      })
      .eq("id", tarea_id);
  }

  return NextResponse.json({ ok: true });
}
