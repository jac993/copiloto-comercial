// =============================================================
// POST /api/rendimiento/evaluar — Genera evaluación semanal con
// IA. Solo se dispara cuando el vendedor aprieta el botón.
// Analiza misiones, métricas y contactos de la semana actual.
// Guarda en evaluaciones_semanales y actualiza rendimiento_ejecutivo.
// =============================================================

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  insertEvaluacionSemanal,
  updateRendimientoEjecutivo,
} from "@/lib/queries";
import { PROMPT_EVALUAR } from "@/lib/prompts";
import type { EvaluacionSemanalInsert } from "@/lib/types";

export const maxDuration = 60;

interface RecomendacionIA {
  accion: string;
  razon: string;
}

interface RespuestaEvalIA {
  resumen_ia: string;
  fortalezas: string;
  areas_mejora: string;
  recomendaciones: RecomendacionIA[];
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Lunes de la semana actual en "YYYY-MM-DD"
function lunesDeSemana(): string {
  const hoy = new Date();
  const dia = hoy.getDay(); // 0=dom, 1=lun...
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1));
  return lunes.toISOString().split("T")[0];
}

// Domingo de la semana actual en "YYYY-MM-DD"
function domingoDeSemana(lunesStr: string): string {
  const lunes = new Date(lunesStr);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  return domingo.toISOString().split("T")[0];
}

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const supabase = getSupabase();
  const semanaInicio = lunesDeSemana();
  const semanaFin = domingoDeSemana(semanaInicio);

  // ── Recopilar datos de la semana en paralelo ──────────────

  const [{ data: metricasSemana }, { data: misionesSemana }, { data: interaccionesSemana }] =
    await Promise.all([
      supabase
        .from("metricas_diarias")
        .select("fecha, contactos_hechos, meta_cumplida, negocios_ganados")
        .gte("fecha", semanaInicio)
        .lte("fecha", semanaFin),
      supabase
        .from("misiones_diarias")
        .select("empresa_id, accion_sugerida, resultado")
        .gte("fecha", semanaInicio)
        .lte("fecha", semanaFin),
      supabase
        .from("interacciones")
        .select("tipo, sentimiento")
        .gte("fecha", `${semanaInicio}T00:00:00`)
        .lte("fecha", `${semanaFin}T23:59:59`),
    ]);

  // ── Calcular métricas de la semana ────────────────────────

  const diasConDatos = metricasSemana ?? [];
  const diasConMeta = diasConDatos.filter((m) => m.meta_cumplida).length;
  const totalDias = diasConDatos.length || 1;
  const totalContactos = diasConDatos.reduce((acc, m) => acc + (m.contactos_hechos ?? 0), 0);
  const ganadosSemana = diasConDatos.reduce((acc, m) => acc + (m.negocios_ganados ?? 0), 0);
  const tasaCumplimiento = Math.round((diasConMeta / totalDias) * 100);

  const misiones = misionesSemana ?? [];
  const misionesCompletadas = misiones.filter((m) => m.resultado === "completada").length;
  const misionesParciales = misiones.filter((m) => m.resultado === "parcial").length;
  const misionesNoEjecutadas = misiones.filter((m) => m.resultado === "no_ejecutada").length;

  const interacciones = interaccionesSemana ?? [];
  const tiposConteo: Record<string, number> = {};
  for (const i of interacciones) {
    tiposConteo[i.tipo] = (tiposConteo[i.tipo] ?? 0) + 1;
  }
  const sentimientoPositivo = interacciones.filter((i) => i.sentimiento === "positivo").length;

  // Tasa conversión: negocios ganados / empresas contactadas únicas
  const tasaConversion = totalContactos > 0
    ? Math.round((ganadosSemana / totalContactos) * 100)
    : 0;

  // ── Construir contexto para la IA ─────────────────────────

  const contextoSemana = {
    semana: `${semanaInicio} al ${semanaFin}`,
    dias_con_datos: totalDias,
    dias_con_meta_cumplida: diasConMeta,
    tasa_cumplimiento_pct: tasaCumplimiento,
    total_contactos: totalContactos,
    ganados_semana: ganadosSemana,
    tasa_conversion_pct: tasaConversion,
    misiones: {
      total: misiones.length,
      completadas: misionesCompletadas,
      parciales: misionesParciales,
      no_ejecutadas: misionesNoEjecutadas,
    },
    interacciones_por_tipo: tiposConteo,
    interacciones_positivas: sentimientoPositivo,
    total_interacciones: interacciones.length,
  };

  if (misiones.length === 0 && interacciones.length === 0) {
    return NextResponse.json(
      { error: "Sin datos suficientes esta semana. Registra al menos una interacción primero." },
      { status: 422 }
    );
  }

  // ── Llamar a la IA ────────────────────────────────────────

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const mensaje = `${PROMPT_EVALUAR}

Datos de la semana:
${JSON.stringify(contextoSemana, null, 2)}`;

  const respuestaAI = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [{ role: "user", content: mensaje }],
  });

  const raw = respuestaAI.content[0].type === "text" ? respuestaAI.content[0].text : "";
  const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let resultado: RespuestaEvalIA;
  try {
    resultado = JSON.parse(jsonStr) as RespuestaEvalIA;
  } catch {
    return NextResponse.json(
      { error: "Error al parsear respuesta de la IA", raw: jsonStr },
      { status: 500 }
    );
  }

  // ── Persistir evaluación y actualizar rendimiento ─────────

  const evalInsert: EvaluacionSemanalInsert = {
    semana_inicio: semanaInicio,
    semana_fin: semanaFin,
    resumen_ia: resultado.resumen_ia,
    tasa_cumplimiento: tasaCumplimiento,
    tasa_conversion: tasaConversion,
    fortalezas: resultado.fortalezas,
    areas_mejora: resultado.areas_mejora,
    recomendaciones: resultado.recomendaciones as unknown as Record<string, unknown>[],
  };

  const evaluacion = await insertEvaluacionSemanal(evalInsert);

  // Actualizar registro único de rendimiento ejecutivo
  await updateRendimientoEjecutivo({
    tasa_cumplimiento_historica: tasaCumplimiento,
    tasa_conversion_historica: tasaConversion,
  }).catch(() => {
    // Si no existe la fila 1, ignorar — se crea con SQL
  });

  return NextResponse.json({ evaluacion });
}
