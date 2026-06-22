// =============================================================
// PATCH /api/empresas/[id]/meddic
// Guarda los 6 componentes MEDDIC + score + valor estimado + probabilidad.
// El score se calcula aquí: rojo=0, amarillo=1, verde=2. Máximo 12 puntos.
// Usa getSupabase() vía guardarMeddic en queries.ts — mismo patrón que guardarBorradores.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { guardarMeddic } from "@/lib/queries";
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
  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;

  const metricas             = parsearComponente(body.metricas);
  const comprador_economico  = parsearComponente(body.comprador_economico);
  const criterios_decision   = parsearComponente(body.criterios_decision);
  const proceso_decision     = parsearComponente(body.proceso_decision);
  const dolor_identificado   = parsearComponente(body.dolor_identificado);
  const campeon              = parsearComponente(body.campeon);

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

  try {
    await guardarMeddic(id, meddic as unknown as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[meddic] error al guardar:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, score, meddic });
}
