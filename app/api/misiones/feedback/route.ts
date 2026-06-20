// =============================================================
// POST /api/misiones/feedback — Guarda resultados del día y
// genera feedback de coaching por cada misión con Claude Haiku.
// Actualiza rendimiento_ejecutivo al finalizar.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { updateRendimientoEjecutivo } from "@/lib/queries";
import { registrarUso } from "@/lib/registrarUso";
import { PROMPT_FEEDBACK_MISION, SYSTEM_PROMPT_VALE } from "@/lib/prompts";
import type { ResultadoMision } from "@/lib/types";

export const maxDuration = 60;

interface ItemFeedback {
  empresa_id: string;
  accion_sugerida: string;
  resultado: ResultadoMision;
  detalle?: string;
}

interface BodyFeedback {
  misiones: ItemFeedback[];
}

interface FeedbackRespuesta {
  empresa_id: string;
  nombre_empresa: string;
  resultado: ResultadoMision;
  feedback_ia: string;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const { misiones } = (await req.json()) as BodyFeedback;

  if (!Array.isArray(misiones) || misiones.length === 0) {
    return NextResponse.json({ error: "misiones requerido" }, { status: 400 });
  }

  const supabase = getSupabase();
  const hoy = new Date().toISOString().split("T")[0];

  // Borrar misiones previas de hoy y reinsertar con select para obtener IDs
  const empresaIds = misiones.map((m) => m.empresa_id);
  await supabase
    .from("misiones_diarias")
    .delete()
    .eq("fecha", hoy)
    .in("empresa_id", empresaIds);

  const rows = misiones.map((m) => ({
    empresa_id: m.empresa_id,
    fecha: hoy,
    accion_sugerida: m.accion_sugerida,
    resultado: m.resultado,
    detalle_vendedor: m.detalle?.trim() || null,
    feedback_ia: null,
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from("misiones_diarias")
    .insert(rows)
    .select();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // ── Generar feedback con IA (si hay API key disponible) ───

  const feedbacks: FeedbackRespuesta[] = [];

  if (process.env.ANTHROPIC_API_KEY) {
    // Cargar datos de empresa (ficha_ia) para todas en paralelo
    const empresaDataMap = new Map<string, { nombre: string; ficha_ia: Record<string, unknown> | null }>();
    await Promise.all(
      empresaIds.map(async (id) => {
        const { data } = await supabase
          .from("empresas")
          .select("nombre, ficha_ia")
          .eq("id", id)
          .maybeSingle();
        if (data) {
          empresaDataMap.set(id, {
            nombre: data.nombre as string,
            ficha_ia: data.ficha_ia as Record<string, unknown> | null,
          });
        }
      })
    );

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Llamar a Claude Haiku para cada misión en paralelo
    const feedbackResults = await Promise.allSettled(
      misiones.map(async (mision) => {
        const empresa = empresaDataMap.get(mision.empresa_id);
        const nombreEmpresa = empresa?.nombre ?? "Empresa";
        const fichaResumen = empresa?.ficha_ia
          ? `Industria: ${(empresa.ficha_ia as Record<string, string>).industria ?? "N/A"}
Resumen: ${(empresa.ficha_ia as Record<string, string>).resumen_ejecutivo ?? "Sin ficha disponible"}
Ángulo de entrada: ${(empresa.ficha_ia as Record<string, string>).angulo_entrada ?? "Sin definir"}`
          : "Sin ficha de IA disponible para esta empresa.";

        const contextoFeedback = `CONTEXTO DE LA EMPRESA:
Nombre: ${nombreEmpresa}
${fichaResumen}

MISIÓN DEL DÍA:
${mision.accion_sugerida}

RESULTADO: ${mision.resultado === "completada" ? "✅ Completada" : mision.resultado === "parcial" ? "🔄 Parcial" : "❌ No ejecutada"}

LO QUE HIZO EL VENDEDOR:
${mision.detalle?.trim() || "No proporcionó detalle adicional."}`;

        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          system: `${SYSTEM_PROMPT_VALE}\n\n${PROMPT_FEEDBACK_MISION}`,
          messages: [{ role: "user", content: contextoFeedback }],
        });

        const texto = response.content[0].type === "text" ? response.content[0].text.trim() : "";
        registrarUso({ api: "claude", endpoint: "claude-haiku-4-5-20251001", input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens, empresa_id: mision.empresa_id });

        return {
          empresa_id: mision.empresa_id,
          nombre_empresa: nombreEmpresa,
          resultado: mision.resultado,
          feedback_ia: texto,
        };
      })
    );

    // Actualizar feedback_ia en cada fila insertada
    await Promise.allSettled(
      feedbackResults.map(async (result, i) => {
        if (result.status === "fulfilled" && result.value.feedback_ia) {
          const { empresa_id, feedback_ia, nombre_empresa, resultado } = result.value;
          feedbacks.push({ empresa_id, nombre_empresa, resultado, feedback_ia });

          // Buscar el ID del row insertado para esta empresa
          const row = (insertedRows ?? []).find(
            (r: { empresa_id: string }) => r.empresa_id === empresa_id
          );
          if (row?.id) {
            await supabase
              .from("misiones_diarias")
              .update({ feedback_ia })
              .eq("id", row.id);
          }
        } else if (result.status === "rejected") {
          // Feedback falló para esta misión — ignorar, no bloquear
          const mision = misiones[i];
          const empresa = empresaDataMap.get(mision.empresa_id);
          feedbacks.push({
            empresa_id: mision.empresa_id,
            nombre_empresa: empresa?.nombre ?? "Empresa",
            resultado: mision.resultado,
            feedback_ia: "",
          });
        }
      })
    );
  }

  // ── Actualizar rendimiento_ejecutivo ──────────────────────

  const completadas = misiones.filter((m) => m.resultado === "completada").length;
  const tasaHoy = Math.round((completadas / misiones.length) * 100);
  updateRendimientoEjecutivo({ tasa_cumplimiento_historica: tasaHoy }).catch(() => {});

  return NextResponse.json({
    ok: true,
    guardadas: rows.length,
    feedbacks,
  });
}
