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
      tipo: TipoInteraccion;
      texto?: string;
      audio_url?: string;
    };

    const { empresa_id, contacto_id, tipo, texto, audio_url } = body;

    if (!empresa_id || !tipo) {
      return NextResponse.json({ error: "empresa_id y tipo son requeridos" }, { status: 400 });
    }

    const interaccionData: InteraccionInsert = {
      empresa_id,
      contacto_id: contacto_id ?? null,
      tipo,
      fecha: new Date().toISOString(),
      audio_url: audio_url ?? null,
      transcripcion: texto?.trim() || null,
      resumen_ia: null,
      compromisos: null,
      sentimiento: tipo === "sin_respuesta" ? "sin_respuesta" : null,
      tecnica_usada: null,
      coaching_ia: null,
      proximo_paso: tipo === "sin_respuesta" ? "Intentar contacto nuevamente" : null,
      proximo_paso_fecha: tipo === "sin_respuesta" ? sumarDiasHabiles(5) : null,
      badge_estado: tipo === "sin_respuesta" ? "sin_respuesta" : null,
      decision_sugerida: null,
    };

    const interaccion = await insertInteraccion(interaccionData);
    return NextResponse.json({ ok: true, interaccion });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
