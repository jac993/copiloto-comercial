// =============================================================
// GET /api/cadencias/asignacion?empresaId=X — Estado de las
// cadencias activas de una empresa, para las líneas de progreso
// de la ficha: "Paso X de Y · Próximo: [canal], [fecha]".
//
// M3: devuelve una LISTA. Antes devolvía { asignacion: {...} | null }
// con maybeSingle(), que con 2+ activas devolvía data=null y el error
// descartado — el panel mostraba "sin cadencia" con cadencias vivas.
// Ahora la regla es una cadencia activa por CONTACTO, así que una
// empresa puede tener varias.
//
// Opcional: &contactoId=Y acota a la cadencia de una sola persona.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tipoInteraccionACanal, CANAL_PASO_LABEL } from "@/lib/cadencias";
import type { CadenciaAsignacion } from "@/lib/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const empresaId = req.nextUrl.searchParams.get("empresaId");
  const contactoId = req.nextUrl.searchParams.get("contactoId");
  if (!empresaId) {
    return NextResponse.json({ error: "empresaId es requerido" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let q = supabase
    .from("cadencia_asignaciones")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("estado", "activa");
  if (contactoId) q = q.eq("contacto_id", contactoId);

  const { data: asigData, error } = await q.order("creado_en", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const asignaciones = (asigData ?? []) as CadenciaAsignacion[];
  if (asignaciones.length === 0) {
    return NextResponse.json({ asignaciones: [] });
  }

  // Queries separadas + Map lookup (nunca joins), una tanda para todas las
  // asignaciones en vez de una por asignación.
  const cadenciaIds = Array.from(new Set(asignaciones.map((a) => a.cadencia_id)));
  const contactoIds = Array.from(new Set(asignaciones.map((a) => a.contacto_id)));
  const asignacionIds = asignaciones.map((a) => a.id);

  const [{ data: cadencias }, { data: pasos }, { data: tareas }, { data: contactos }] =
    await Promise.all([
      supabase.from("cadencias").select("id, nombre").in("id", cadenciaIds),
      supabase.from("cadencia_pasos").select("id, cadencia_id").in("cadencia_id", cadenciaIds),
      supabase
        .from("interacciones")
        .select("cadencia_asignacion_id, tipo, proximo_paso_fecha")
        .in("cadencia_asignacion_id", asignacionIds)
        .eq("resuelta", false)
        .order("proximo_paso_fecha", { ascending: true }),
      supabase.from("contactos").select("id, nombre").in("id", contactoIds),
    ]);

  const nombreCadencia = new Map(
    (cadencias ?? []).map((c) => [c.id as string, c.nombre as string])
  );
  const nombreContacto = new Map(
    (contactos ?? []).map((c) => [c.id as string, c.nombre as string | null])
  );
  // Total de pasos por cadencia
  const totalPasos = new Map<string, number>();
  for (const p of pasos ?? []) {
    const cid = p.cadencia_id as string;
    totalPasos.set(cid, (totalPasos.get(cid) ?? 0) + 1);
  }
  // Primera tarea pendiente por asignación (el order asc garantiza que la
  // primera vista de cada id es la más próxima)
  const tareaPendiente = new Map<string, { tipo: string; proximo_paso_fecha: string | null }>();
  for (const t of tareas ?? []) {
    const aid = t.cadencia_asignacion_id as string;
    if (!tareaPendiente.has(aid)) {
      tareaPendiente.set(aid, {
        tipo: t.tipo as string,
        proximo_paso_fecha: t.proximo_paso_fecha as string | null,
      });
    }
  }

  return NextResponse.json({
    asignaciones: asignaciones.map((a) => {
      const tarea = tareaPendiente.get(a.id) ?? null;
      const canalProximo = tarea ? tipoInteraccionACanal(tarea.tipo) : null;
      return {
        id: a.id,
        contacto_id: a.contacto_id,
        cadencia_nombre: nombreCadencia.get(a.cadencia_id) ?? "Cadencia",
        contacto_nombre: nombreContacto.get(a.contacto_id) ?? null,
        paso_actual: a.paso_actual,
        total_pasos: totalPasos.get(a.cadencia_id) ?? 0,
        proximo_canal: canalProximo ? CANAL_PASO_LABEL[canalProximo] : null,
        proxima_fecha: tarea?.proximo_paso_fecha ?? null,
      };
    }),
  });
}
