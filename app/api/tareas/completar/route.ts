// =============================================================
// POST /api/tareas/completar
// Marca una tarea/prioridad como completada.
// - manual: requiere una interacción real hoy que pruebe el contacto.
// - ia (prioridad vencida): vincula la interacción real de hoy; si no hay y
//   el vendedor confirma con confirmar_sin_registro:true, crea un stub.
// Body: { tarea_id, empresa_id, origen:'manual'|'ia', confirmar_sin_registro? }
// Response: { ok:true } | { ok:false, motivo:'sin_interaccion'|'no_actualizada' }
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hoyCL, rangoDiaChileUTC } from "@/lib/fecha";
import { avanzarCadencia, tipoInteraccionACanal } from "@/lib/cadencias-server";
import { crearStubInteraccion } from "@/lib/queries";

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
    confirmar_sin_registro?: boolean;
  };
  const { tarea_id, empresa_id, origen, confirmar_sin_registro } = body;

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
  const hayInteraccion = !!(interacciones && interacciones.length > 0);

  if (origen === "manual") {
    // Manual: el botón "Hecho" SIEMPRE requiere una interacción real hoy que
    // pruebe el contacto. Sin ella no se marca (la UI pide registrarla).
    if (!hayInteraccion) {
      return NextResponse.json({ ok: false, motivo: "sin_interaccion" });
    }

    // Update CONDICIONAL (idempotencia, Fix 2): solo cambia si aún estaba
    // sin resolver. .select() devuelve únicamente las filas afectadas — si
    // otro request simultáneo (doble-tap en móvil) ya la resolvió, viene
    // vacío y NO avanzamos la cadencia de nuevo (evita crear dos pasos).
    // actualizado_en explícito (fix P2): la pestaña "Realizadas" filtra por
    // actualizado_en = hoy. Si el trigger BEFORE UPDATE existe lo sobrescribe
    // con now() (inofensivo); si no existe, este valor mantiene la tarea
    // visible en "Realizadas".
    const { data: updated } = await supabase
      .from("interacciones")
      .update({ resuelta: true, no_realizada: false, actualizado_en: new Date().toISOString() })
      .eq("id", tarea_id)
      // Filas antiguas (previas a agregar la columna) tienen resuelta=NULL, no
      // false. En PostgreSQL NULL != false, así que .eq("resuelta", false) NO
      // las matcheaba: el UPDATE afectaba 0 filas pero igual retornábamos
      // ok:true, la UI la tachaba en verde y al próximo GET reaparecía como
      // vencida. .or(...) captura NULL Y false y mantiene la idempotencia
      // (una fila ya resuelta=true no vuelve a matchear → no reavanza cadencia).
      .or("resuelta.is.null,resuelta.eq.false")
      .select("cadencia_asignacion_id, tipo");

    // Si no se afectó ninguna fila, el UPDATE no encontró la tarea pendiente
    // (id inexistente o ya resuelta por un request previo). No mentir ok:true:
    // el frontend debe saber que la BD no cambió para no tachar en falso.
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { ok: false, motivo: "no_actualizada" },
        { status: 409 }
      );
    }

    const fila = updated[0];
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
    // origen === "ia" (prioridad vencida). Resolver qué interacción vincular:
    let interaccionId: string;
    if (hayInteraccion) {
      // Hay contacto real hoy → se vincula (comportamiento original).
      interaccionId = interacciones![0].id as string;
    } else if (confirmar_sin_registro) {
      // El vendedor confirmó "Sí, realicé este contacto" sin registro previo:
      // creamos un stub con los datos de la prioridad para no perder la métrica.
      const { data: prioridad } = await supabase
        .from("prioridades_diarias")
        .select("empresa_id, accion_sugerida")
        .eq("id", tarea_id)
        .maybeSingle();
      if (!prioridad) {
        return NextResponse.json({ ok: false, motivo: "no_actualizada" }, { status: 409 });
      }
      const stub = await crearStubInteraccion(
        prioridad.empresa_id as string,
        prioridad.accion_sugerida as string
      );
      interaccionId = stub.id;
    } else {
      // Sin interacción y sin confirmación → la UI abre el diálogo de confirmación.
      return NextResponse.json({ ok: false, motivo: "sin_interaccion" });
    }

    // Vincular la interacción (real o stub) a la prioridad vencida.
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
