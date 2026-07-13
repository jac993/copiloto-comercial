// =============================================================
// POST /api/interacciones/crear
// Guarda una interacción SIN llamar a Claude.
// Usado por "Guardar sin analizar" en el historial de empresa.
// El campo transcripcion guarda el texto pegado por el usuario
// o la transcripción de AssemblyAI para llamadas.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertInteraccion, supersederTareasPendientesEmpresa } from "@/lib/queries";
import { cerrarPorRespuesta } from "@/lib/cadencias-server";
import type { TipoInteraccion, InteraccionInsert } from "@/lib/types";
import { hoyCL } from "@/lib/fecha";

// Suma N días hábiles (excluye sáb/dom) desde hoy en zona Chile
function sumarDiasHabiles(n: number): string {
  const fecha = new Date(hoyCL() + "T12:00:00Z");
  let contados = 0;
  while (contados < n) {
    fecha.setUTCDate(fecha.getUTCDate() + 1);
    const dia = fecha.getUTCDay();
    if (dia !== 0 && dia !== 6) contados++;
  }
  return fecha.toISOString().split("T")[0];
}

// Avanza un día calendario desde una fecha YYYY-MM-DD
function avanzarUnDia(fechaStr: string): string {
  const d = new Date(fechaStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
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
      resuelta: false,
      no_realizada: false,
    };

    console.log('[TAREA_DEBUG]', JSON.stringify({
      empresa_id: interaccionData.empresa_id,
      tipo: interaccionData.tipo,
      proximo_paso: interaccionData.proximo_paso,
      proximo_paso_fecha: interaccionData.proximo_paso_fecha,
      resuelta: interaccionData.resuelta,
    }));

    const interaccion = await insertInteraccion(interaccionData);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Al registrar cualquier mensaje (vendedor o prospecto):
    // 1. Marcar mensajes anteriores sin tarea como resueltos
    // 2. Reactivar la conversación si estaba pausada
    await Promise.all([
      supabase
        .from("interacciones")
        .update({ resuelta: true })
        .eq("empresa_id", empresa_id)
        .neq("resuelta", true)           // captura false Y null heredados
        .neq("id", interaccion.id)       // excluir la recién creada
        .is("proximo_paso", null)        // NUNCA auto-resolver tareas con seguimiento; solo mensajes de espera
        .lt("fecha", new Date().toISOString()),
      supabase
        .from("empresas")
        .update({ conversacion_pausada_at: null })
        .eq("id", empresa_id)
        .not("conversacion_pausada_at", "is", null),
    ]);

    // Fix 1: si es respuesta a un mensaje específico, resolver el padre siempre.
    // El bulk update anterior lo omite cuando tiene proximo_paso asignado (auto-tarea),
    // lo que dejaba la interacción original como resuelta=false en el badge de alertas.
    if (parent_id) {
      await supabase
        .from("interacciones")
        .update({ resuelta: true })
        .eq("id", parent_id)
        .neq("resuelta", true);
    }

    // Cierre automático de cadencia: si el prospecto respondió (mensaje con
    // remitente=prospecto, o la resolución "Respondió al contacto" desde
    // /alertas), la cadencia activa de la empresa se completa con motivo
    // 'respondio' y sus tareas pendientes se cancelan. Es la promesa central
    // del sistema: respondió → la secuencia muere sola.
    const esRespuestaProspecto =
      remitente === "prospecto" || texto?.trim() === "Respondió al contacto";
    if (esRespuestaProspecto) {
      try {
        await cerrarPorRespuesta(supabase, empresa_id);
      } catch (e) {
        console.error("[CADENCIA_CIERRE_AUTO]", e instanceof Error ? e.message : e);
      }
    }

    // Tarea de seguimiento automática:
    // Solo si: vendedor envió el mensaje, hay texto, y el cliente NO llenó proximo_paso manualmente.
    const transcripcionTrimmed = interaccionData.transcripcion?.trim() ?? "";
    const debeAutoTarea =
      (remitente ?? "vendedor") === "vendedor" &&
      transcripcionTrimmed.length > 0 &&
      !proximo_paso?.trim() &&
      !proximo_paso_fecha &&
      tipo !== "sin_respuesta"; // sin_respuesta ya genera su propia tarea arriba

    if (debeAutoTarea) {
      // Obtener fechas ya ocupadas por tareas pendientes (global, todos los clientes)
      const { data: tareasExistentes } = await supabase
        .from("interacciones")
        .select("proximo_paso_fecha")
        .eq("resuelta", false)
        .not("proximo_paso", "is", null);

      const fechasOcupadas = new Set(
        (tareasExistentes ?? [])
          .map((t) => t.proximo_paso_fecha as string | null)
          .filter((f): f is string => !!f)
      );

      // Buscar primer día libre desde hoy + 3 días hábiles, máx 14 días calendario
      const hoy = hoyCL();
      const limiteDate = new Date(hoy + "T12:00:00Z");
      limiteDate.setUTCDate(limiteDate.getUTCDate() + 14);
      const limite = limiteDate.toISOString().split("T")[0];

      let fechaSeguimiento = sumarDiasHabiles(3);
      while (fechasOcupadas.has(fechaSeguimiento) && fechaSeguimiento < limite) {
        fechaSeguimiento = avanzarUnDia(fechaSeguimiento);
      }

      // Resolver nombre del contacto si hay contacto_id
      let contactoNombre = "prospecto";
      if (contacto_id) {
        const { data: contacto } = await supabase
          .from("contactos")
          .select("nombre")
          .eq("id", contacto_id)
          .maybeSingle();
        if (contacto?.nombre) contactoNombre = contacto.nombre as string;
      }

      const resumenCorto = transcripcionTrimmed.slice(0, 80);
      const proximoPasoAuto = `Seguimiento a ${contactoNombre} — ${resumenCorto}`;

      // Regla de visibilidad en el historial: TODO lo que el vendedor ingresa
      // manualmente (mensajes, llamadas, "Llamada sin respuesta") conserva su
      // transcripcion y aparece como burbuja. La misma fila lleva además
      // proximo_paso para la tarea de seguimiento en Hoy (dos vistas, no
      // duplicado). Lo único oculto del historial son los registros automáticos
      // del botón "✓ Hecho" (ver prioridades/completar).
      await supabase
        .from("interacciones")
        .update({
          proximo_paso: proximoPasoAuto,
          proximo_paso_fecha: fechaSeguimiento,
          resuelta: false,
        })
        .eq("id", interaccion.id);

      console.log('[AUTO_TAREA]', { id: interaccion.id, fecha: fechaSeguimiento, texto: proximoPasoAuto });
    }

    // Regla una-tarea-por-empresa: si esta interacción resultó en una tarea
    // pendiente, neutraliza las tareas previas de la empresa (newest-wins).
    const creoTarea = tipo === "sin_respuesta" || !!proximo_paso?.trim() || debeAutoTarea;
    if (creoTarea) {
      await supersederTareasPendientesEmpresa(empresa_id, interaccion.id);
    }

    return NextResponse.json({ ok: true, interaccion });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error('[INTERACCION_CREAR_ERROR]', mensaje, err);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
