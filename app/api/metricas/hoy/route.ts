// =============================================================
// GET /api/metricas/hoy — Métricas diarias reales del vendedor.
// Cuenta interacciones de hoy, calcula racha y retorna
// empresas para reactivar. Se llama al cargar pantalla Hoy
// y al volver al foco de la ventana.
// =============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Empresa, PrioridadCacheItem, TareaPendiente } from "@/lib/types";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const supabase = getSupabase();
  const hoy = new Date().toISOString().split("T")[0];

  // Contar todas las interacciones de hoy (cualquier tipo)
  const { count: contactosHoy } = await supabase
    .from("interacciones")
    .select("*", { count: "exact", head: true })
    .gte("fecha", `${hoy}T00:00:00`)
    .lte("fecha", `${hoy}T23:59:59`);

  // Contar llamadas de hoy específicamente
  const { count: llamadasHoy } = await supabase
    .from("interacciones")
    .select("*", { count: "exact", head: true })
    .eq("tipo", "llamada")
    .gte("fecha", `${hoy}T00:00:00`)
    .lte("fecha", `${hoy}T23:59:59`);

  // Contar negocios ganados este mes
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const { count: ganadosMes } = await supabase
    .from("empresas")
    .select("*", { count: "exact", head: true })
    .eq("estado", "ganado")
    .gte("actualizado_en", inicioMes.toISOString());

  const META = 5;
  const contactos = contactosHoy ?? 0;
  const llamadas = llamadasHoy ?? 0;
  const ganados = ganadosMes ?? 0;
  const metaCumplida = contactos >= META;

  // Upsert métrica de hoy (crea la fila si no existe)
  await supabase.from("metricas_diarias").upsert(
    {
      fecha: hoy,
      contactos_hechos: contactos,
      meta_cumplida: metaCumplida,
      reuniones_logradas: 0,
      cotizaciones_enviadas: 0,
      negocios_ganados: ganados,
      racha_dias: 0,
    },
    { onConflict: "fecha", ignoreDuplicates: false }
  );

  // Calcular racha: días consecutivos desde hoy hacia atrás con meta cumplida
  const hace31 = new Date();
  hace31.setDate(hace31.getDate() - 31);
  const { data: metricas } = await supabase
    .from("metricas_diarias")
    .select("fecha, meta_cumplida")
    .gte("fecha", hace31.toISOString().split("T")[0])
    .order("fecha", { ascending: false });

  let racha = 0;
  if (metricas) {
    const hoyTs = new Date(hoy).getTime();
    for (const m of metricas) {
      const diffDias = Math.round((hoyTs - new Date(m.fecha).getTime()) / 86400000);
      if (diffDias === racha && m.meta_cumplida) {
        racha++;
      } else if (diffDias > racha) {
        break;
      }
    }
  }

  // Guardar racha calculada
  await supabase
    .from("metricas_diarias")
    .update({ racha_dias: racha })
    .eq("fecha", hoy);

  // Empresas para reactivar: perdidas con fecha_reactivacion <= hoy
  const { data: reactivaciones } = await supabase
    .from("empresas")
    .select("*")
    .eq("estado", "perdido")
    .lte("fecha_reactivacion", hoy)
    .not("fecha_reactivacion", "is", null)
    .order("fecha_reactivacion", { ascending: true });

  // Tareas pendientes: interacciones con proximo_paso_fecha <= hoy y no resueltas
  const { data: tareasRaw } = await supabase
    .from("interacciones")
    .select("id, empresa_id, proximo_paso, proximo_paso_fecha, empresas(nombre)")
    .not("proximo_paso", "is", null)
    .lte("proximo_paso_fecha", hoy)
    .eq("resuelta", false)
    .order("proximo_paso_fecha", { ascending: true })
    .limit(20);

  const tareasPendientes: TareaPendiente[] = (tareasRaw ?? []).map((r) => ({
    id: r.id as string,
    empresa_id: r.empresa_id as string,
    empresa_nombre: (r.empresas as unknown as { nombre: string } | null)?.nombre ?? "Empresa",
    proximo_paso: r.proximo_paso as string,
    proximo_paso_fecha: r.proximo_paso_fecha as string,
  }));

  // Leer caché de prioridades del día (generado en la última llamada a /api/priorizar)
  const { data: metricaHoy } = await supabase
    .from("metricas_diarias")
    .select("prioridades_cache, prioridades_generadas_en, notas_dia")
    .eq("fecha", hoy)
    .maybeSingle();

  const prioridadesCache = metricaHoy?.prioridades_cache
    ? (metricaHoy.prioridades_cache as unknown as PrioridadCacheItem[])
    : null;

  return NextResponse.json({
    contactos_hoy: contactos,
    meta: META,
    racha_actual: racha,
    llamadas_hoy: llamadas,
    ganados_mes: ganados,
    reactivaciones: (reactivaciones ?? []) as Empresa[],
    prioridades_cache: prioridadesCache,
    prioridades_generadas_en: metricaHoy?.prioridades_generadas_en ?? null,
    resumen_dia_cache: metricaHoy?.notas_dia ?? null,
    tareas_pendientes: tareasPendientes,
  });
}
