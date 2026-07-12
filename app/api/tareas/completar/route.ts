// =============================================================
// POST /api/tareas/completar
// Verifica que existe una interacción real hoy para la empresa,
// luego marca la tarea/prioridad como completada.
// Body: { tarea_id: string, empresa_id: string, origen: 'manual' | 'ia' }
// Response: { ok: true } | { ok: false, motivo: 'sin_interaccion' }
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hoyCL, rangoDiaChileUTC } from "@/lib/fecha";
import { avanzarCadencia, tipoInteraccionACanal } from "@/lib/cadencias-server";

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
  // Ventana del día calendario CHILENO en UTC — con la ventana UTC cruda,
  // una llamada registrada después de las ~20:00 hora Chile quedaba fuera
  // y el botón "Hecho" rechazaba la tarea aunque la interacción existiera.
  // Para tareas manuales excluimos la tarea misma (no cuenta como prueba de sí misma).
  const { desde, hasta } = rangoDiaChileUTC(hoy);
  let query = supabase
    .from("interacciones")
    .select("id")
    .eq("empresa_id", empresa_id)
    .gte("fecha", desde)
    .lt("fecha", hasta);

  if (origen === "manual") {
    query = query.neq("id", tarea_id);
  }

  const { data: interacciones } = await query.limit(1);

  if (!interacciones || interacciones.length === 0) {
    return NextResponse.json({ ok: false, motivo: "sin_interaccion" });
  }

  const interaccionId = interacciones[0].id as string;

  if (origen === "manual") {
    // Update CONDICIONAL (idempotencia, Fix 2): solo cambia si aún estaba
    // sin resolver. .select() devuelve únicamente las filas afectadas — si
    // otro request simultáneo (doble-tap en móvil) ya la resolvió, viene
    // vacío y NO avanzamos la cadencia de nuevo (evita crear dos pasos).
    const { data: updated } = await supabase
      .from("interacciones")
      .update({ resuelta: true, no_realizada: false })
      .eq("id", tarea_id)
      .eq("resuelta", false)
      .select("cadencia_asignacion_id, tipo");

    const fila = updated?.[0];
    // Hook de cadencias: si esta tarea (y no un request duplicado) pertenece
    // a una cadencia, generar la tarea del siguiente paso con los canales
    // disponibles del momento (o cerrar la asignación si se agotó).
    if (fila?.cadencia_asignacion_id) {
      try {
        await avanzarCadencia(
          supabase,
          fila.cadencia_asignacion_id as string,
          tipoInteraccionACanal(fila.tipo as string)
        );
      } catch (e) {
        console.error("[CADENCIA_AVANZAR]", e instanceof Error ? e.message : e);
      }
    }
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
