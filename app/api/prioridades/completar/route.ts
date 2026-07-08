// =============================================================
// POST /api/prioridades/completar
// Registra que el vendedor ya ejecutó la acción sugerida por la IA
// para una prioridad del día (botón "✓ Hecho" en la pantalla Hoy).
// Solo deja constancia en el historial (interacción resuelta=true);
// NO llama a la IA ni genera coaching — eso sigue ocurriendo en el
// flujo separado "Reportar mi día" (POST /api/misiones/feedback).
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { insertInteraccion } from "@/lib/queries";
import type { TipoInteraccion, InteraccionInsert } from "@/lib/types";

// Infiere el canal a partir del texto de la acción sugerida
// ("Llamar a...", "Enviar email a...", "seguimiento por LinkedIn...").
function inferirTipoInteraccion(texto: string): TipoInteraccion {
  const t = texto.toLowerCase();
  if (t.includes("email") || t.includes("correo")) return "email";
  if (t.includes("whatsapp")) return "whatsapp";
  if (t.includes("linkedin")) return "linkedin";
  if (t.includes("reunión") || t.includes("reunion")) return "reunion";
  return "llamada";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { empresa_id?: string; accion_sugerida?: string };
    const { empresa_id, accion_sugerida } = body;

    if (!empresa_id || !accion_sugerida) {
      return NextResponse.json({ error: "empresa_id y accion_sugerida son requeridos" }, { status: 400 });
    }

    const interaccionData: InteraccionInsert = {
      empresa_id,
      contacto_id: null,
      parent_id: null,
      tipo: inferirTipoInteraccion(accion_sugerida),
      fecha: new Date().toISOString(),
      audio_url: null,
      transcripcion: accion_sugerida,
      resumen_ia: null,
      compromisos: null,
      sentimiento: null,
      tecnica_usada: null,
      coaching_ia: null,
      proximo_paso: null,
      proximo_paso_fecha: null,
      badge_estado: null,
      decision_sugerida: null,
      remitente: "vendedor",
      resuelta: true,
    };

    const interaccion = await insertInteraccion(interaccionData);
    return NextResponse.json({ ok: true, interaccion });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[PRIORIDAD_COMPLETAR_ERROR]", mensaje, err);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
