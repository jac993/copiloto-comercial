// =============================================================
// POST /api/priorizar — Prioriza cuentas activas del pipeline
// con IA. Solo se activa cuando el usuario aprieta el botón
// "Actualizar prioridades". Nunca en background automático.
// Actualiza score_prioridad y razon_de_contacto_actual en BD.
// =============================================================

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { getEmpresasPriorizadas, getAprendizajesActivos, guardarPrioridadesCache } from "@/lib/queries";
import { registrarUso } from "@/lib/registrarUso";
import { PROMPT_PRIORIZAR, SYSTEM_PROMPT_VALE } from "@/lib/prompts";
import type { PrioridadCacheItem } from "@/lib/types";

export const maxDuration = 60;

interface PrioridadIA {
  empresa_id: string;
  score: number;
  razon: string;
  accion_sugerida: string;
  urgencia: "alta" | "media" | "baja";
}

interface RespuestaIA {
  prioridades: PrioridadIA[];
  resumen_dia: string;
}

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY" }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const empresas = await getEmpresasPriorizadas(20);
  if (empresas.length === 0) {
    return NextResponse.json({
      prioridades: [],
      resumen_dia: "Sin cuentas activas aún. ¡Agrega empresas en la sección Cuentas!",
    });
  }

  // Construir contexto enriquecido por empresa
  const empresasConContexto = await Promise.all(
    empresas.map(async (e) => {
      const { data: interacciones } = await supabase
        .from("interacciones")
        .select("tipo, sentimiento, proximo_paso, proximo_paso_fecha, fecha")
        .eq("empresa_id", e.id)
        .order("fecha", { ascending: false })
        .limit(1);

      const ultima = interacciones?.[0] ?? null;
      const diasSinContacto = ultima
        ? Math.floor((Date.now() - new Date(ultima.fecha).getTime()) / 86400000)
        : null;

      const { data: senales } = await supabase
        .from("senales")
        .select("tipo, descripcion")
        .eq("empresa_id", e.id)
        .eq("usada", false)
        .limit(2);

      // Contactos reales de esta empresa — única fuente de verdad para nombres.
      // Sin esto, el prompt pide "[nombre del contacto]" sin darle ningún dato,
      // y el modelo termina inventando nombres plausibles.
      const { data: contactos } = await supabase
        .from("contactos")
        .select("nombre, cargo, area, telefono, email, linkedin_url")
        .eq("empresa_id", e.id);

      return {
        id: e.id,
        nombre: e.nombre,
        industria: e.industria,
        estado: e.estado,
        score_actual: e.score_prioridad,
        dias_sin_contacto: diasSinContacto,
        ultima_interaccion: ultima
          ? {
              tipo: ultima.tipo,
              sentimiento: ultima.sentimiento,
              proximo_paso: ultima.proximo_paso,
              fecha_proximo_paso: ultima.proximo_paso_fecha,
            }
          : null,
        senales_sin_usar: (senales ?? []).map((s) => s.descripcion),
        angulo_entrada: e.ficha_ia?.angulo_entrada ?? null,
        contactos_registrados: (contactos ?? []).map((c) => ({
          nombre: c.nombre,
          cargo: c.cargo,
          area: c.area,
          telefono: c.telefono,
          tiene_telefono: !!c.telefono,
          canal_disponible: c.linkedin_url ? "linkedin" : c.email ? "email" : null,
        })),
      };
    })
  );

  const aprendizajes = await getAprendizajesActivos();

  const mensajeUsuario = `
Pipeline actual (${empresas.length} cuentas activas):
${JSON.stringify(empresasConContexto, null, 2)}

Aprendizajes del vendedor (los más confirmados):
${JSON.stringify(
  aprendizajes.slice(0, 5).map((a) => ({
    tipo: a.tipo,
    descripcion: a.descripcion,
    veces_confirmado: a.veces_confirmado,
  })),
  null,
  2
)}

Responde ÚNICAMENTE con este JSON exacto (sin markdown, sin texto extra):
{
  "prioridades": [
    {
      "empresa_id": "uuid-de-la-empresa",
      "score": 85,
      "razon": "Por qué contactar hoy (específico, 1-2 frases)",
      "accion_sugerida": "Qué hacer exactamente hoy (1 frase accionable)",
      "urgencia": "alta"
    }
  ],
  "resumen_dia": "Estado del pipeline en 1 línea motivadora para el vendedor"
}

Selecciona máximo 5 empresas, ordenadas de mayor a menor urgencia.
  `.trim();

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: `${SYSTEM_PROMPT_VALE}\n\n${PROMPT_PRIORIZAR}`,
    messages: [{ role: "user", content: mensajeUsuario }],
  });

  registrarUso({ api: "claude", endpoint: "claude-haiku-4-5-20251001", input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens });
  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let resultado: RespuestaIA;
  try {
    resultado = JSON.parse(jsonStr) as RespuestaIA;
  } catch {
    return NextResponse.json(
      { error: "Error al parsear respuesta de la IA", raw: jsonStr },
      { status: 500 }
    );
  }

  // Actualizar scores en la base de datos
  await Promise.all(
    resultado.prioridades.map((p) =>
      supabase
        .from("empresas")
        .update({
          score_prioridad: p.score,
          razon_de_contacto_actual: p.accion_sugerida,
        })
        .eq("id", p.empresa_id)
    )
  );

  // Enriquecer respuesta con datos completos de empresa
  const empresasMap = new Map(empresas.map((e) => [e.id, e]));
  const prioridadesEnriquecidas = resultado.prioridades.map((p) => ({
    ...p,
    empresa: empresasMap.get(p.empresa_id) ?? null,
  }));

  // Guardar en cache de metricas_diarias para el día actual
  const hoy = new Date().toISOString().split("T")[0];
  const cache: PrioridadCacheItem[] = resultado.prioridades.map((p) => {
    const emp = empresasMap.get(p.empresa_id);
    return {
      empresa_id: p.empresa_id,
      nombre_empresa: emp?.nombre ?? "Empresa",
      industria: emp?.industria ?? null,
      score: p.score,
      razon: p.razon,
      accion_sugerida: p.accion_sugerida,
      urgencia: p.urgencia,
    };
  });

  // Guardar cache sin bloquear la respuesta
  guardarPrioridadesCache(hoy, cache, resultado.resumen_dia).catch(() => {});

  return NextResponse.json({
    prioridades: prioridadesEnriquecidas,
    resumen_dia: resultado.resumen_dia,
  });
}
