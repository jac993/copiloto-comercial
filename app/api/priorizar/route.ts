// =============================================================
// POST /api/priorizar — Prioriza cuentas activas del pipeline
// con IA. Solo se activa cuando el usuario aprieta el botón
// "Actualizar prioridades". Nunca en background automático.
// Actualiza score_prioridad y razon_de_contacto_actual en BD.
// =============================================================

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { hoyCL } from "@/lib/fecha";
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

  const todasEmpresas = await getEmpresasPriorizadas(20);
  if (todasEmpresas.length === 0) {
    return NextResponse.json({
      prioridades: [],
      resumen_dia: "Sin cuentas activas aún. ¡Agrega empresas en la sección Cuentas!",
    });
  }

  // Excluir empresas ya gestionadas hoy (marcadas Hecho o No realizado).
  // Sin esto, Claude vuelve a sugerir cuentas cuya fila en prioridades_diarias
  // ya tiene completada=true: aparecen en pantalla tras el recálculo pero el
  // GET de metricas/hoy las filtra, y "desaparecen" al volver a la pestaña Hoy.
  const hoy = hoyCL();
  const { data: yaGestionadas } = await supabase
    .from("prioridades_diarias")
    .select("empresa_id")
    .eq("fecha", hoy)
    .eq("completada", true);
  const gestionadasSet = new Set((yaGestionadas ?? []).map((r) => r.empresa_id as string));
  const empresas = todasEmpresas.filter((e) => !gestionadasSet.has(e.id));
  console.log("[PRIORIZAR] candidatas:", empresas.length, "| excluidas (ya gestionadas hoy):", gestionadasSet.size);

  if (empresas.length === 0) {
    return NextResponse.json({
      prioridades: [],
      resumen_dia: "¡Ya gestionaste todas tus cuentas prioritarias de hoy! 🎉",
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
        // Refuerzo explícito para el modelo — no basta con un array vacío,
        // Claude seguía inventando nombres cuando no había contactos reales.
        ...((contactos ?? []).length === 0
          ? { nota_contactos: "Esta empresa no tiene contactos registrados. No inventes nombres." }
          : {}),
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
  // Salvaguarda: descartar cualquier sugerencia de una empresa ya gestionada hoy
  // (por si Claude la devuelve igual pese a no estar entre las candidatas).
  resultado.prioridades = resultado.prioridades.filter(
    (p) => !gestionadasSet.has(p.empresa_id)
  );

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

  // Datos de empresa para enriquecer la respuesta
  const empresasMap = new Map(empresas.map((e) => [e.id, e]));

  // Normalizar urgencia ANTES de construir el cache — salvaguarda ante valores
  // inesperados de Claude como "media-alta" que violan el CHECK constraint de la DB.
  const normalizeUrgencia = (u: string): "alta" | "media" | "baja" => {
    const lower = u.toLowerCase();
    if (lower.includes("alta")) return "alta";
    if (lower.includes("baja")) return "baja";
    return "media";
  };
  resultado.prioridades = resultado.prioridades.map((p) => ({
    ...p,
    urgencia: normalizeUrgencia(p.urgencia),
  }));

  // Guardar en cache de metricas_diarias para el día actual (hoy ya calculado arriba)
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

  const nuevasEmpresaIds = cache.map((item) => item.empresa_id);
  console.log("[PRIORIZAR] empresas nuevo top-5:", nuevasEmpresaIds);
  const { error: deleteError } = await supabase
    .from("prioridades_diarias")
    .delete()
    .eq("fecha", hoy)
    .eq("completada", false)
    .not("empresa_id", "in", `(${nuevasEmpresaIds.join(",")})`);
  console.log("[PRIORIZAR] DELETE resultado:", { error: deleteError?.message ?? null });

  // onConflict sin tocar completada/completada_en/interaccion_id: solo actualiza
  // score, razon y urgencia si el usuario recalcula el mismo día.
  const upsertRows = cache.map((item) => ({
    fecha: hoy,
    empresa_id: item.empresa_id,
    nombre_empresa: item.nombre_empresa,
    industria: item.industria,
    score: item.score,
    razon: item.razon,
    accion_sugerida: item.accion_sugerida,
    urgencia: item.urgencia,
  }));
  const { error: upsertError } = await supabase
    .from("prioridades_diarias")
    .upsert(upsertRows, { onConflict: "fecha,empresa_id" });
  console.log("[PRIORIZAR] UPSERT resultado:", { error: upsertError });

  // Leer los IDs generados para incluirlos en la respuesta (necesarios para el
  // botón "✓ Hecho" que ahora usa prioridad_id en lugar de empresa_id).
  const { data: pdRows } = await supabase
    .from("prioridades_diarias")
    .select("id, empresa_id")
    .eq("fecha", hoy)
    .in("empresa_id", resultado.prioridades.map((p) => p.empresa_id));
  const idsPorEmpresa = new Map(
    (pdRows ?? []).map((r) => [r.empresa_id as string, r.id as string])
  );

  // Enriquecer con empresa + id de prioridades_diarias
  const prioridadesEnriquecidas = resultado.prioridades.map((p) => ({
    ...p,
    id: idsPorEmpresa.get(p.empresa_id) ?? null,
    empresa: empresasMap.get(p.empresa_id) ?? null,
  }));

  // Guardar cache antes de responder — awaiteado para garantizar que
  // prioridades_generadas_en quede persistido y el auto-trigger no se repita.
  try {
    await guardarPrioridadesCache(hoy, cache, resultado.resumen_dia);
  } catch (err) {
    console.error("[PRIORIZAR] guardarPrioridadesCache falló:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    prioridades: prioridadesEnriquecidas,
    resumen_dia: resultado.resumen_dia,
  });
}
