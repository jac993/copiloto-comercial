// =============================================================
// PATCH /api/empresas/[id]/meddic
// Guarda los 6 componentes MEDDIC + score + valor estimado + probabilidad.
// El score se calcula aquí: rojo=0, amarillo=1, verde=2. Máximo 12 puntos.
// Las columnas ya existen en Supabase.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import type { MeddicComponente, MeddicData, MeddicSemaforo } from "@/lib/types";

const SEMAFOROS_VALIDOS = new Set<MeddicSemaforo>(["rojo", "amarillo", "verde"]);

function puntajeComponente(s: MeddicSemaforo): number {
  if (s === "verde") return 2;
  if (s === "amarillo") return 1;
  return 0;
}

function parsearComponente(val: unknown): MeddicComponente | null {
  if (!val || typeof val !== "object") return null;
  const obj = val as Record<string, unknown>;
  if (!SEMAFOROS_VALIDOS.has(obj.semaforo as MeddicSemaforo)) return null;
  return {
    texto: typeof obj.texto === "string" ? obj.texto || null : null,
    semaforo: obj.semaforo as MeddicSemaforo,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  noStore();
  const { id } = await params;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Configuración Supabase faltante" }, { status: 500 });
  }

  const body = (await req.json()) as Record<string, unknown>;

  const metricas              = parsearComponente(body.metricas);
  const comprador_economico   = parsearComponente(body.comprador_economico);
  const criterios_decision    = parsearComponente(body.criterios_decision);
  const proceso_decision      = parsearComponente(body.proceso_decision);
  const dolor_identificado    = parsearComponente(body.dolor_identificado);
  const campeon               = parsearComponente(body.campeon);

  if (!metricas || !comprador_economico || !criterios_decision ||
      !proceso_decision || !dolor_identificado || !campeon) {
    return NextResponse.json({ error: "Componentes MEDDIC inválidos o incompletos" }, { status: 400 });
  }

  const score =
    puntajeComponente(metricas.semaforo) +
    puntajeComponente(comprador_economico.semaforo) +
    puntajeComponente(criterios_decision.semaforo) +
    puntajeComponente(proceso_decision.semaforo) +
    puntajeComponente(dolor_identificado.semaforo) +
    puntajeComponente(campeon.semaforo);

  const valor_estimado =
    typeof body.valor_estimado === "number" && body.valor_estimado >= 0
      ? Math.round(body.valor_estimado)
      : null;

  const probabilidad =
    typeof body.probabilidad === "number" &&
    body.probabilidad >= 0 &&
    body.probabilidad <= 100
      ? Math.round(body.probabilidad)
      : null;

  const meddic: MeddicData = {
    metricas,
    comprador_economico,
    criterios_decision,
    proceso_decision,
    dolor_identificado,
    campeon,
    score,
    valor_estimado,
    probabilidad,
  };

  // Usar fetch directo a Supabase REST con service role para evitar cacheo de Next.js
  const url = `${process.env.SUPABASE_URL}/rest/v1/empresas?id=eq.${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ meddic }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("[meddic] error Supabase:", errorText);
    return NextResponse.json({ error: `Error al guardar MEDDIC: ${errorText}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, score, meddic });
}
