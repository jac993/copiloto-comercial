// =============================================================
// GET /api/cadencias/asignacion?empresaId=X — Estado de la
// cadencia activa de una empresa para la línea de progreso de
// la ficha: "Paso X de Y · Próximo: [canal], [fecha]".
// Retorna { asignacion: null } si no hay cadencia activa.
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
  if (!empresaId) {
    return NextResponse.json({ error: "empresaId es requerido" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: asigData } = await supabase
    .from("cadencia_asignaciones")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("estado", "activa")
    .maybeSingle();

  if (!asigData) {
    return NextResponse.json({ asignacion: null });
  }
  const asignacion = asigData as CadenciaAsignacion;

  // Queries separadas + Map lookup (nunca joins)
  const [{ data: cadencia }, { count: totalPasos }, { data: tareaPendiente }, { data: contacto }] =
    await Promise.all([
      supabase.from("cadencias").select("nombre").eq("id", asignacion.cadencia_id).maybeSingle(),
      supabase
        .from("cadencia_pasos")
        .select("id", { count: "exact", head: true })
        .eq("cadencia_id", asignacion.cadencia_id),
      supabase
        .from("interacciones")
        .select("tipo, proximo_paso_fecha")
        .eq("cadencia_asignacion_id", asignacion.id)
        .eq("resuelta", false)
        .order("proximo_paso_fecha", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase.from("contactos").select("nombre").eq("id", asignacion.contacto_id).maybeSingle(),
    ]);

  const canalProximo = tareaPendiente ? tipoInteraccionACanal(tareaPendiente.tipo as string) : null;

  return NextResponse.json({
    asignacion: {
      id: asignacion.id,
      cadencia_nombre: cadencia?.nombre ?? "Cadencia",
      contacto_nombre: contacto?.nombre ?? null,
      paso_actual: asignacion.paso_actual,
      total_pasos: totalPasos ?? 0,
      proximo_canal: canalProximo ? CANAL_PASO_LABEL[canalProximo] : null,
      proxima_fecha: tareaPendiente?.proximo_paso_fecha ?? null,
    },
  });
}
