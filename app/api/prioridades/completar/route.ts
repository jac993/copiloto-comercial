// =============================================================
// POST /api/prioridades/completar
// Registra que el vendedor ejecutó la acción sugerida por la IA.
// Acepta:
//   { prioridad_id }                  ← nuevo contrato (prioridades_diarias.id)
//   { empresa_id, accion_sugerida }   ← legacy para compatibilidad
// Crea una interacción resuelta=true y, cuando usa prioridad_id,
// marca prioridades_diarias.completada=true con referencia a la
// interacción creada.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

  try {
    const body = await req.json() as {
      prioridad_id?: string;
      empresa_id?: string;
      accion_sugerida?: string;
    };

    if (body.prioridad_id) {
      // ── Flujo nuevo: lookup en prioridades_diarias ────────────
      const supabase = getSupabase();
      const { data: prioridad } = await supabase
        .from("prioridades_diarias")
        .select("empresa_id, accion_sugerida")
        .eq("id", body.prioridad_id)
        .maybeSingle();

      if (!prioridad) {
        return NextResponse.json({ error: "Prioridad no encontrada" }, { status: 404 });
      }

      const interaccion = await crearStubInteraccion(
        prioridad.empresa_id as string,
        prioridad.accion_sugerida as string
      );

      // Marcar como completada en prioridades_diarias
      await supabase
        .from("prioridades_diarias")
        .update({
          completada: true,
          completada_en: new Date().toISOString(),
          interaccion_id: interaccion.id,
        })
        .eq("id", body.prioridad_id);

      return NextResponse.json({ ok: true, interaccion });
    }

    if (body.empresa_id && body.accion_sugerida) {
      // ── Flujo legacy: solo crea interacción (sin prioridades_diarias) ──
      const interaccion = await crearStubInteraccion(
        body.empresa_id,
        body.accion_sugerida
      );
      return NextResponse.json({ ok: true, interaccion });
    }

    return NextResponse.json(
      { error: "Se requiere prioridad_id o empresa_id+accion_sugerida" },
      { status: 400 }
    );
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[PRIORIDAD_COMPLETAR_ERROR]", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
