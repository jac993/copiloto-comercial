// =============================================================
// POST /api/interacciones/crear
// Guarda una interacción SIN llamar a Claude.
// Usado por "Guardar sin analizar" en el historial de empresa.
// El campo transcripcion guarda el texto pegado por el usuario
// o la transcripción de AssemblyAI para llamadas.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { insertInteraccion } from "@/lib/queries";
import type { TipoInteraccion, InteraccionInsert } from "@/lib/types";

// Suma N días hábiles (excluye sáb/dom)
function sumarDiasHabiles(n: number): string {
  const fecha = new Date();
  let contados = 0;
  while (contados < n) {
    fecha.setDate(fecha.getDate() + 1);
    const dia = fecha.getDay();
    if (dia !== 0 && dia !== 6) contados++;
  }
  return fecha.toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      empresa_id: string;
      contacto_id?: string;
      parent_id?: string;  // para vincular respuestas del prospecto al mensaje original
      tipo: TipoInteraccion;
      texto?: string;
      audio_url?: string;
      fecha?: string;      // ISO string — si el usuario cambió la fecha/hora
      sentimiento?: string; // resultado manual: positivo / neutro / negativo
      remitente?: "vendedor" | "prospecto"; // quién envió el mensaje
      proximo_paso?: string;
      proximo_paso_fecha?: string; // YYYY-MM-DD
    };

    const { empresa_id, contacto_id, parent_id, tipo, texto, audio_url, fecha, sentimiento, remitente, proximo_paso, proximo_paso_fecha } = body;

    if (!empresa_id || !tipo) {
      return NextResponse.json({ error: "empresa_id y tipo son requeridos" }, { status: 400 });
    }

    const validSentimientos = ["positivo", "neutro", "negativo", "sin_respuesta"];
    const sentimientoFinal = tipo === "sin_respuesta"
      ? "sin_respuesta"
      : (sentimiento && validSentimientos.includes(sentimiento) ? sentimiento as InteraccionInsert["sentimiento"] : null);

    const interaccionData: InteraccionInsert = {
      empresa_id,
      contacto_id: contacto_id ?? null,
      parent_id: parent_id ?? null,
      tipo,
      fecha: fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
      audio_url: audio_url ?? null,
      transcripcion: texto?.trim() || null,
      resumen_ia: null,
      compromisos: null,
      sentimiento: sentimientoFinal,
      tecnica_usada: null,
      coaching_ia: null,
      proximo_paso: tipo === "sin_respuesta" ? "Intentar contacto nuevamente" : (proximo_paso?.trim() || null),
      proximo_paso_fecha: tipo === "sin_respuesta" ? sumarDiasHabiles(5) : (proximo_paso_fecha || null),
      badge_estado: tipo === "sin_respuesta" ? "sin_respuesta" : null,
      decision_sugerida: null,
      remitente: remitente ?? "vendedor",
    };

    const interaccion = await insertInteraccion(interaccionData);

    // Al registrar cualquier mensaje (vendedor o prospecto):
    // 1. Marcar tareas pendientes anteriores como resueltas
    // 2. Reactivar la conversación si estaba pausada
    {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await Promise.all([
        supabase
          .from("interacciones")
          .update({ resuelta: true })
          .eq("empresa_id", empresa_id)
          .eq("resuelta", false)
          .lt("fecha", new Date().toISOString()),
        supabase
          .from("empresas")
          .update({ conversacion_pausada_at: null })
          .eq("id", empresa_id)
          .not("conversacion_pausada_at", "is", null),
      ]);
    }

    return NextResponse.json({ ok: true, interaccion });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
