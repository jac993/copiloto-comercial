// =============================================================
// GET /api/panorama — Vista consolidada de todos los prospectos
// activos (excluye ganado/perdido). Sin llamadas a IA: todo se
// calcula desde datos existentes con queries globales separadas
// y lookup por Map (nunca joins de Supabase, que descartan filas
// silenciosamente cuando la relación no matchea).
// =============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hoyCL } from "@/lib/fecha";
import type { PanoramaFila, EstadoEmpresa, TipoInteraccion, MeddicData } from "@/lib/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Convierte un timestamptz a fecha calendario chilena "YYYY-MM-DD"
function fechaCL(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

// Días calendario entre dos fechas "YYYY-MM-DD" (b - a)
function diffDias(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000
  );
}

// "2026-07-07" → "7 jul" — para mensajes tipo "venció 7 jul"
function fechaCorta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${parseInt(dia)} ${meses[parseInt(mes) - 1]}`;
}

// Acorta el texto de una tarea para el mensaje de acción
function corto(texto: string, max = 60): string {
  return texto.length > max ? texto.slice(0, max).trimEnd() + "…" : texto;
}

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const hoy = hoyCL();
  const manana = (() => {
    const d = new Date(hoy + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().split("T")[0];
  })();

  const ahora = Date.now();
  const limite48h = new Date(ahora - 48 * 60 * 60 * 1000).toISOString();
  const limite7d = new Date(ahora - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ── Queries globales en paralelo ─────────────────────────────
  const [
    { data: empresasRaw, error: empresasError },
    { data: interaccionesRaw },
    { data: tareasRaw },
    { data: sinRespuestaRaw },
  ] = await Promise.all([
    // 1. Empresas activas (con conversacion_pausada_at para excluir del semáforo rojo)
    supabase
      .from("empresas")
      .select("id, nombre, estado, meddic, conversacion_pausada_at")
      .not("estado", "in", "(ganado,perdido)"),
    // 2. Todas las interacciones, más reciente primero → Map conserva la primera por empresa
    supabase
      .from("interacciones")
      .select("empresa_id, fecha, tipo, contacto_id")
      .order("fecha", { ascending: false }),
    // 3. Tareas pendientes, fecha más cercana primero → Map conserva la primera por empresa
    supabase
      .from("interacciones")
      .select("empresa_id, proximo_paso, proximo_paso_fecha")
      .not("proximo_paso", "is", null)
      .neq("resuelta", true)
      .order("proximo_paso_fecha", { ascending: true }),
    // 4. Interacciones sin respuesta >48h — misma definición que /api/interacciones/vencidas.
    // Trae fecha y contacto para armar "X espera tu respuesta hace N días".
    supabase
      .from("interacciones")
      .select("empresa_id, fecha, contacto_id")
      .in("tipo", ["whatsapp", "email", "linkedin"])
      .eq("resuelta", false)
      .lt("fecha", limite48h)
      .gt("fecha", limite7d)
      .order("fecha", { ascending: false }),
  ]);

  if (empresasError) {
    return NextResponse.json({ error: empresasError.message }, { status: 500 });
  }

  // ── Maps de lookup ───────────────────────────────────────────
  // Última interacción por empresa (el order desc garantiza que la primera vista es la más reciente)
  const ultimaPorEmpresa = new Map<string, { fecha: string; tipo: TipoInteraccion; contacto_id: string | null }>();
  for (const r of interaccionesRaw ?? []) {
    const eid = r.empresa_id as string;
    if (!ultimaPorEmpresa.has(eid)) {
      ultimaPorEmpresa.set(eid, {
        fecha: r.fecha as string,
        tipo: r.tipo as TipoInteraccion,
        contacto_id: r.contacto_id as string | null,
      });
    }
  }

  // Tarea pendiente más cercana por empresa
  const tareaPorEmpresa = new Map<string, { texto: string; fecha: string }>();
  for (const r of tareasRaw ?? []) {
    const eid = r.empresa_id as string;
    if (!tareaPorEmpresa.has(eid) && r.proximo_paso_fecha) {
      tareaPorEmpresa.set(eid, {
        texto: r.proximo_paso as string,
        fecha: r.proximo_paso_fecha as string,
      });
    }
  }

  // Mensaje sin respuesta >48h más reciente por empresa (rojo), excluyendo pausadas más abajo
  const vencidaPorEmpresa = new Map<string, { fecha: string; contacto_id: string | null }>();
  for (const r of sinRespuestaRaw ?? []) {
    const eid = r.empresa_id as string;
    if (!vencidaPorEmpresa.has(eid)) {
      vencidaPorEmpresa.set(eid, {
        fecha: r.fecha as string,
        contacto_id: r.contacto_id as string | null,
      });
    }
  }

  // Nombres de contactos de las últimas interacciones y de las vencidas (solo los necesarios)
  const contactoIds = Array.from(
    new Set(
      [
        ...Array.from(ultimaPorEmpresa.values()).map((u) => u.contacto_id),
        ...Array.from(vencidaPorEmpresa.values()).map((v) => v.contacto_id),
      ].filter((id): id is string => !!id)
    )
  );
  const { data: contactosRaw } = contactoIds.length > 0
    ? await supabase.from("contactos").select("id, nombre").in("id", contactoIds)
    : { data: [] };
  const contactosMap = new Map((contactosRaw ?? []).map((c) => [c.id as string, c.nombre as string | null]));

  // ── Armar filas ──────────────────────────────────────────────
  const filas: PanoramaFila[] = (empresasRaw ?? []).map((e) => {
    const eid = e.id as string;
    const ultima = ultimaPorEmpresa.get(eid) ?? null;
    const tarea = tareaPorEmpresa.get(eid) ?? null;
    const pausada = e.conversacion_pausada_at != null;

    const diasSinContacto = ultima ? diffDias(fechaCL(ultima.fecha), hoy) : null;
    const vencida = vencidaPorEmpresa.get(eid) ?? null;

    // Semáforo + mensaje de acción según la causa concreta:
    //   rojo     → sin respuesta >48h (no pausada) O tarea vencida
    //   amarillo → tarea para hoy/mañana O más de 7 días sin contacto O nunca contactada
    //   verde    → resto
    let semaforo: PanoramaFila["semaforo"] = "verde";
    let mensaje: string;
    if (vencida && !pausada) {
      semaforo = "rojo";
      const nombre = vencida.contacto_id ? contactosMap.get(vencida.contacto_id) : null;
      const dias = diffDias(fechaCL(vencida.fecha), hoy);
      mensaje = nombre
        ? `${nombre} espera tu respuesta hace ${dias} ${dias === 1 ? "día" : "días"}`
        : `Mensaje sin respuesta hace ${dias} ${dias === 1 ? "día" : "días"}`;
    } else if (tarea && tarea.fecha < hoy) {
      semaforo = "rojo";
      mensaje = `Tarea vencida: ${corto(tarea.texto)} (venció ${fechaCorta(tarea.fecha)})`;
    } else if (tarea && tarea.fecha === hoy) {
      semaforo = "amarillo";
      mensaje = `Tarea para hoy: ${corto(tarea.texto)}`;
    } else if (tarea && tarea.fecha === manana) {
      semaforo = "amarillo";
      mensaje = `Tarea para mañana: ${corto(tarea.texto)}`;
    } else if (diasSinContacto === null) {
      semaforo = "amarillo";
      mensaje = "Sin contacto aún";
    } else if (diasSinContacto > 7) {
      semaforo = "amarillo";
      mensaje = `${diasSinContacto} días sin contacto`;
    } else if (tarea) {
      mensaje = `Seguimiento agendado para el ${fechaCorta(tarea.fecha)}`;
    } else {
      mensaje = "Sin pendientes";
    }

    const meddic = e.meddic as MeddicData | null;

    return {
      empresa_id: eid,
      nombre: e.nombre as string,
      estado: e.estado as EstadoEmpresa,
      score_meddic: meddic?.score ?? null,
      ultima_interaccion: ultima
        ? {
            fecha: ultima.fecha,
            tipo: ultima.tipo,
            contacto_nombre: ultima.contacto_id ? contactosMap.get(ultima.contacto_id) ?? null : null,
          }
        : null,
      dias_sin_contacto: diasSinContacto,
      proxima_tarea: tarea,
      semaforo,
      mensaje_accion: mensaje,
    };
  });

  return NextResponse.json({ filas });
}
