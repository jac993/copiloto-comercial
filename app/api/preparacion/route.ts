// =============================================================
// POST /api/preparacion
// Genera UN borrador personalizado para un canal y decisor.
// El tipo (apertura/seguimiento/continuacion/reactivacion) se
// detecta en el cliente según historial real con ese contacto.
// Obtiene TODO el contexto directo desde Supabase — nada viaja
// desde el cliente excepto empresaId, canal, tipo y el decisor.
// Se llama solo cuando el usuario pincha el canal — nunca en bg.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { getEmpresaCompleta, getHistorialResumido, getCasosActivosPorSector } from "@/lib/queries";
import { buildPromptBorradorCanal, buildPromptBorradores, SYSTEM_PROMPT_VALE } from "@/lib/prompts";
import { validarDatosParaGeneracion } from "@/lib/validar-borrador";
import { calcularCadencia } from "@/lib/cadencia";
import { registrarUso } from "@/lib/registrarUso";

export const maxDuration = 60;

const MODEL = "claude-haiku-4-5-20251001";

export type CanalBorrador = "whatsapp" | "correo" | "linkedin" | "llamada";
export type TipoBorrador = "apertura" | "seguimiento" | "continuacion" | "reactivacion";

// Discriminated union para type-safe acceso en el cliente
export type BorradorCanalResult =
  | { canal: "whatsapp"; texto: string }
  | { canal: "linkedin"; texto: string }
  | { canal: "correo"; asunto: string; cuerpo: string }
  | { canal: "llamada"; apertura: string; gancho: string; si_positivo: string; si_negativo: string; cierre: string };

// Solo los datos dinámicos que el servidor no puede inferir viajan desde el cliente
interface PrepararBody {
  empresaId: string;
  canal: CanalBorrador;
  tipo?: TipoBorrador;
  decisorNombre?: string | null;
  decisorCargo: string;
  decisorArea?: string | null;
  contactoId?: string | null;
}

// Instrucción explícita por tipo para que Claude no meta la pata
const INSTRUCCION_TIPO: Record<TipoBorrador, string> = {
  apertura:
    "PRIMER CONTACTO. Preséntate brevemente y presenta el motivo del contacto. El decisor no te conoce.",
  seguimiento:
    "YA HUBO CONTACTO PREVIO pero no se llegó a nada concreto. NO te presentes de nuevo. Retoma el hilo reconociendo el contacto anterior y propone un paso concreto. Si el intento anterior no obtuvo respuesta, PROHIBIDO repetir el mismo ángulo o pregunta — revisa los intentos previos del contexto y cambia el enfoque (dolor distinto, caso real, o valor nuevo sin pedir nada).",
  continuacion:
    `TIPO CONTINUACION — YA HUBO CONVERSACIÓN REAL CON ESTE CONTACTO.

INSTRUCCIÓN PARA CONTINUACIÓN:

Tienes acceso al historial real de interacciones con este contacto en la sección
"HISTORIAL DE INTERACCIONES". DEBES partir el mensaje reconociendo explícitamente
la conversación anterior.

Si el historial está vacío o no contiene interacciones con este contacto
específico, tratar como tipo 'apertura' (primer contacto).

ESTRUCTURA OBLIGATORIA (cuando hay historial):

1. REFERENCIA DIRECTA a la última interacción real del historial:
   - Menciona cuándo fue ("en septiembre", "la semana pasada", con el mes/período real)
   - Menciona qué se habló o acordó según el resumen de esa interacción
   - Usa el nombre del contacto si está disponible
   - NO menciones productos, señales ni nada que no salga del historial

2. PREGUNTA DE CONTINUIDAD:
   "¿Llegaron a evaluar...?", "¿Cómo avanzó eso?", "¿Cambió algo desde entonces?"
   — debe conectar directamente con lo que quedó pendiente según el historial

3. CTA de bajo compromiso: máximo 15 minutos

PROHIBIDO:
- Empezar como si fuera primer contacto ("Soy [nombre] de One Label...")
- Mencionar productos, líneas de producción o señales que el vendedor detectó
  pero el prospecto nunca mencionó en el historial
- Inventar contexto que no esté en las interacciones registradas

TONO: directo, sin "espero que estés bien", sin halagos.
LONGITUD MÁXIMA: 80 palabras para WhatsApp/LinkedIn, 120 para correo.

PARA CORREO — asunto que refleje la continuidad:
Correcto: "Retomando nuestra conversación de [mes]"
Incorrecto: "Propuesta One Label", "Solución para [empresa]"`,

  reactivacion:
    `TIPO REACTIVACION — HUBO INTENTOS ANTERIORES SIN RESPUESTA.

INSTRUCCIÓN PARA REACTIVACIÓN:

Tienes acceso al historial real de interacciones con este contacto en la sección
"HISTORIAL DE INTERACCIONES". DEBES partir el mensaje reconociendo los intentos
anteriores sin hacerlos sentir como presión.

Si el historial está vacío, tratar como tipo 'apertura' (primer contacto).

ESTRUCTURA OBLIGATORIA (cuando hay historial):

1. REFERENCIA DIRECTA al último contacto del historial:
   - Menciona cuándo fue el último intento real
   - NO menciones que "no respondió" — eso presiona
   - Sí puedes decir "sé que andas ocupado" o "quería retomar el tema"

2. PREGUNTA DE REACTIVACIÓN:
   "¿Cambió algo desde entonces?", "¿Sigue siendo relevante el tema?"
   — objetivo: saber si el timing cambió, sin insistir

3. CTA de mínimo compromiso: "Si no es el momento, no hay problema — ¿cuándo
   sería mejor?" o similar. Dejarle la puerta abierta sin presión.

PROHIBIDO:
- Empezar como si fuera primer contacto
- Mencionar que no respondió, que llevas varios intentos o que estás haciendo seguimiento
- Inventar contexto que no esté en las interacciones registradas
- Mencionar productos o señales que el vendedor detectó pero el prospecto no mencionó

TONO: sin presión, sin urgencia artificial, genuinamente consultivo.
LONGITUD MÁXIMA: 80 palabras para WhatsApp/LinkedIn, 120 para correo.

REGLA DE ÁNGULO NUEVO: los intentos anteriores no obtuvieron respuesta — PROHIBIDO
repetir el ángulo, dolor o estructura de pregunta de esos intentos (revísalos en
"Intentos previos" del contexto). Especialmente si el prospecto VIO el mensaje y no
respondió: ese ángulo ya falló. Usa un dolor distinto, un caso real con resultado
concreto, o entrega valor sin pedir nada.

PARA CORREO — asunto sin presión:
Correcto: "Retomando el tema de etiquetado"
Incorrecto: "Seguimiento pendiente", "¿Pudiste revisar mi mensaje?"`,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as PrepararBody;
    const { empresaId, canal, tipo: tipoRaw, decisorNombre, decisorCargo, decisorArea, contactoId } = body;

    if (!empresaId || !canal || !decisorCargo) {
      return NextResponse.json(
        { error: "empresaId, canal y decisorCargo son requeridos" },
        { status: 400 }
      );
    }

    const canalesValidos: CanalBorrador[] = ["whatsapp", "correo", "linkedin", "llamada"];
    if (!canalesValidos.includes(canal)) {
      return NextResponse.json({ error: `Canal inválido: ${canal}` }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Cargar contexto completo desde Supabase en paralelo
    const [empresa, historialTexto, feedbackRows, rechazadosRows] = await Promise.all([
      getEmpresaCompleta(empresaId),
      getHistorialResumido(empresaId, contactoId),
      // Ejemplos aprobados por el vendedor para este canal — few-shot de estilo
      supabase
        .from("borradores_feedback")
        .select("canal, tipo_borrador, borrador_ia, version_vendedor, notas")
        .eq("evaluacion", "positivo")
        .eq("canal", canal)
        .order("creado_en", { ascending: false })
        .limit(5)
        .then((r) => r.data ?? []),
      // Últimos 3 borradores rechazados de este contacto — para no repetir errores
      (() => {
        let q = supabase
          .from("borradores")
          .select("feedback_rechazo")
          .eq("empresa_id", empresaId)
          .eq("canal", canal)
          .not("feedback_rechazo", "is", null)
          .order("creado_en", { ascending: false })
          .limit(3);
        if (contactoId) q = q.eq("contacto_id", contactoId);
        return q.then((r) => r.data ?? []);
      })(),
    ]);

    // Bloque few-shot: muestra el texto que el vendedor aprobó (su versión editada si existe)
    // Borradores rechazados: se inyectan para que Claude evite repetir los mismos errores
    console.log("[preparacion] rechazados encontrados:", rechazadosRows.length, rechazadosRows.map((r) => (r as { feedback_rechazo: string }).feedback_rechazo?.slice(0, 60)));

    const rechazadosTexto = rechazadosRows.length > 0
      ? `\n\nBORRADORES ANTERIORES RECHAZADOS:\n` +
        rechazadosRows
          .map((r) => `${canal} - Razón: ${(r as { feedback_rechazo: string }).feedback_rechazo}`)
          .join("\n") +
        "\nEvita cometer los mismos errores."
      : "";

    const ejemplosAprobados = feedbackRows.length > 0
      ? `\n\n## Ejemplos de mensajes aprobados por el vendedor\n\nEstos son mensajes reales que el vendedor aprobó para el canal ${canal}. Tómalos como referencia de tono, extensión y estilo:\n\n` +
        feedbackRows.map((f, i) => {
          const tipo = f.tipo_borrador ? ` (${f.tipo_borrador})` : "";
          const texto = (f.version_vendedor?.trim() || f.borrador_ia?.trim()) ?? "";
          const nota = f.notas?.trim() ? `\n  Nota del vendedor: "${f.notas.trim()}"` : "";
          return `Ejemplo ${i + 1}${tipo}:\n"${texto}"${nota}`;
        }).join("\n\n")
      : "";

    // Casos reales relevantes por sector — se cargan después de tener la empresa
    const casosRelevantes = empresa
      ? await getCasosActivosPorSector(empresa.industria ?? null)
      : [];

    if (!empresa) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    // ── Gate de calidad de datos ──────────────────────────────
    // Si faltan los tres campos de research, Claude solo tiene el nombre
    // de la empresa y rellena con generalidades. Bloquear antes de gastar créditos.
    const validacion = validarDatosParaGeneracion(empresa, decisorCargo);
    if (!validacion.ok) {
      return NextResponse.json(validacion, { status: 422 });
    }

    // Si el área fue inferida desde el cargo, persistirla en background
    if (validacion.actualizarContacto) {
      const { id: cId, area, agregarNota } = validacion.actualizarContacto;
      void (async () => {
        try {
          const { data: cData } = await supabase
            .from("contactos")
            .select("notas_ia")
            .eq("id", cId)
            .single();
          const notasActuales = (cData as { notas_ia?: string } | null)?.notas_ia ?? "";
          const nuevasNotas = notasActuales ? `${notasActuales}\n\n${agregarNota}` : agregarNota;
          await supabase.from("contactos").update({ area, notas_ia: nuevasNotas }).eq("id", cId);
        } catch (e) {
          console.error("[preparacion] error actualizando área inferida:", e);
        }
      })();
    }

    const tipo: TipoBorrador = tipoRaw ?? "apertura";
    const ficha = empresa.ficha_ia;

    // ── Cadencia de seguimiento (solo con contacto real e historial) ──
    // Le dice explícitamente a Claude en qué touch va y qué canal rotar,
    // para que el borrador no repita el enfoque del intento anterior.
    let cadenciaTexto = "";
    if (contactoId) {
      const { data: intsCad } = await supabase
        .from("interacciones")
        .select("tipo, fecha, remitente, sentimiento, contacto_id")
        .eq("empresa_id", empresaId)
        .eq("contacto_id", contactoId)
        .order("fecha", { ascending: true });
      const cadencia = calcularCadencia(intsCad ?? [], contactoId);
      if (cadencia) {
        const rotacion =
          cadencia.canalSugerido && cadencia.canalSugerido !== canal
            ? ` La cadencia sugería "${cadencia.canalSugerido}" para rotar (el canal anterior fue ${cadencia.ultimoCanal ?? "—"}); ajusta el enfoque para no repetir el intento previo.`
            : " Coincide con el canal sugerido por la rotación.";
        cadenciaTexto = `\n\n━━━ CADENCIA DE SEGUIMIENTO ━━━\n${cadencia.resumen} Este borrador es para el canal "${canal}".${rotacion}`;
      }
    }

    // Decisor en la ficha IA (para dolor específico)
    const decisorFicha = ficha?.decisores?.find(
      (d) => d.cargo.toLowerCase() === decisorCargo.toLowerCase()
    );

    // ── Temperatura de la conversación e intentos previos ─────
    // Los marcadores de resolución que registra el vendedor tienen
    // semántica distinta y la IA debe tratarlos distinto:
    //   "Vio el mensaje pero no respondió" → leyó y decidió ignorar:
    //     el ÁNGULO falló, repetirlo es inútil.
    //   "Sin respuesta tras 48h" → sin evidencia de lectura: puede ser
    //     timing o canal, no necesariamente el mensaje.
    //   "Llamada sin respuesta" → no contestó el teléfono.
    const MARCADORES: Record<string, string> = {
      "Respondió al contacto": "RESPONDIÓ",
      "Vio el mensaje pero no respondió": "VIO el mensaje y NO respondió (leyó y decidió ignorar — el ángulo no capturó interés)",
      "Sin respuesta tras 48h": "sin respuesta tras 48h (sin evidencia de lectura — puede ser timing o canal)",
      "Llamada sin respuesta": "no contestó la llamada",
    };

    let qInts = supabase
      .from("interacciones")
      .select("remitente, fecha, tipo, transcripcion, resumen_ia")
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: false })
      .limit(10);
    if (contactoId) qInts = qInts.eq("contacto_id", contactoId);
    const { data: intsRecientes } = await qInts;

    const diasDesdeF = (f: string) => Math.floor((Date.now() - new Date(f).getTime()) / 86400000);
    const cuandoF = (f: string) => {
      const d = diasDesdeF(f);
      return d === 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${d} días`;
    };

    // Separar mensajes reales de marcadores de resolución
    const filasRecientes = intsRecientes ?? [];
    const esMarcador = (t: string | null) => !!t && t in MARCADORES;
    const ultimoReal = filasRecientes.find((r) => !esMarcador(r.transcripcion as string | null)) ?? null;
    // Marcador más reciente POSTERIOR al último mensaje real
    const marcadorPosterior = ultimoReal
      ? filasRecientes.find(
          (r) => esMarcador(r.transcripcion as string | null) &&
            new Date(r.fecha as string) >= new Date(ultimoReal.fecha as string)
        ) ?? null
      : filasRecientes.find((r) => esMarcador(r.transcripcion as string | null)) ?? null;

    let temperaturaTexto = "Sin interacciones registradas — cuenta fría, primer contacto.";
    if (ultimoReal) {
      const cuando = cuandoF(ultimoReal.fecha as string);
      if (ultimoReal.remitente === "prospecto") {
        temperaturaTexto = `El PROSPECTO envió el último mensaje (${ultimoReal.tipo}) ${cuando} — está esperando tu respuesta. Conversación ACTIVA: responde a lo que él dijo, no reinicies el hilo.`;
      } else {
        temperaturaTexto = `El último mensaje lo enviaste TÚ (${ultimoReal.tipo}) ${cuando}.`;
        if (marcadorPosterior) {
          // Si el vendedor marcó "Sin respuesta tras 48h" ANTES de que pasaran
          // 48h desde el mensaje, es porque VIO que el prospecto lo leyó y no
          // respondió — ignoro deliberado, no falta de lectura.
          const horasEntre =
            (new Date(marcadorPosterior.fecha as string).getTime() -
              new Date(ultimoReal.fecha as string).getTime()) / 3_600_000;
          const marcadorTxt = marcadorPosterior.transcripcion as string;
          const semantica =
            marcadorTxt === "Sin respuesta tras 48h" && horasEntre < 48
              ? MARCADORES["Vio el mensaje pero no respondió"]
              : MARCADORES[marcadorTxt];
          temperaturaTexto += ` El vendedor registró: ${semantica}.`;
        } else if (diasDesdeF(ultimoReal.fecha as string) >= 3) {
          temperaturaTexto += " Sin respuesta del prospecto — la conversación se está enfriando.";
        }
      }
    } else if (marcadorPosterior) {
      temperaturaTexto = `Sin mensajes de contenido registrados, pero el vendedor registró: ${MARCADORES[marcadorPosterior.transcripcion as string]} (${cuandoF(marcadorPosterior.fecha as string)}).`;
    }

    // Línea de intentos previos (cronológica) — le da a la IA el ángulo
    // exacto de cada intento fallido para que NO lo repita.
    const intentosTexto = filasRecientes.length > 0
      ? [...filasRecientes]
          .reverse()
          .map((r) => {
            const txt = (r.resumen_ia ?? r.transcripcion ?? "").toString();
            if (esMarcador(r.transcripcion as string | null)) {
              return `  → Resolución (${cuandoF(r.fecha as string)}): ${MARCADORES[r.transcripcion as string]}`;
            }
            const quien = r.remitente === "prospecto" ? "PROSPECTO" : "vendedor";
            return `  • ${quien} — ${r.tipo} (${cuandoF(r.fecha as string)}): "${txt.slice(0, 100)}"`;
          })
          .join("\n")
      : "  Sin intentos registrados.";

    // ── Contexto estratégico ──────────────────────────────────
    // Todo esto ya se carga de Supabase; antes solo llegaba al chat de
    // Consultar (y parcialmente a llamada). Sin estos datos, el selector
    // de técnica por estado de SYSTEM_PROMPT_VALE no puede operar.
    const meddicTexto = empresa.meddic
      ? [
          `MEDDIC ${empresa.meddic.score}/12:`,
          `  • Métricas (${empresa.meddic.metricas.semaforo}): ${empresa.meddic.metricas.texto ?? "Sin info"}`,
          `  • Comprador Económico (${empresa.meddic.comprador_economico.semaforo}): ${empresa.meddic.comprador_economico.texto ?? "Sin info"}`,
          `  • Criterios de Decisión (${empresa.meddic.criterios_decision.semaforo}): ${empresa.meddic.criterios_decision.texto ?? "Sin info"}`,
          `  • Proceso de Decisión (${empresa.meddic.proceso_decision.semaforo}): ${empresa.meddic.proceso_decision.texto ?? "Sin info"}`,
          `  • Dolor Identificado (${empresa.meddic.dolor_identificado.semaforo}): ${empresa.meddic.dolor_identificado.texto ?? "Sin info"}`,
          `  • Campeón (${empresa.meddic.campeon.semaforo}): ${empresa.meddic.campeon.texto ?? "Sin info"}`,
        ].join("\n")
      : "Sin calificación MEDDIC registrada.";

    const objecionesTexto =
      ficha?.objeciones_probables && ficha.objeciones_probables.length > 0
        ? ficha.objeciones_probables
            .map((o) => `  • "${o.objecion}" → ${o.como_responderla}`)
            .join("\n")
        : "  Sin análisis de objeciones.";

    const casosTexto = casosRelevantes.length > 0
      ? casosRelevantes.map((c) =>
          `  • Sector: ${c.sector} | Decisor: ${c.cargo_decisor ?? "no especificado"} | Problema: ${c.problema} | Resultado: ${c.resultado}`
        ).join("\n")
      : "  Sin casos documentados aún — no inventar referencias.";

    // Parte común (etapa + MEDDIC + técnica + temperatura) — el canal llamada
    // ya incluye ángulo/objeciones/casos en su propio contexto, así que solo
    // recibe esta parte; los canales de texto reciben el bloque completo.
    const estrategiaBase = `
━━━ CONTEXTO ESTRATÉGICO ━━━
Etapa del pipeline: ${empresa.estado}
${meddicTexto}
Técnica recomendada por la ficha: ${ficha?.tecnica_recomendada ?? "sin definir"}${ficha?.razon_tecnica ? ` — ${ficha.razon_tecnica}` : ""}
Temperatura de la conversación: ${temperaturaTexto}
Intentos previos con este contacto (cronológico, con su resolución):
${intentosTexto}`.trim();

    const contextoEstrategico = `
${estrategiaBase}
Ángulo de entrada: ${ficha?.angulo_entrada ?? "Sin definir."}
${decisorFicha?.dolor_especifico ? `Dolor específico del decisor (${decisorCargo}): ${decisorFicha.dolor_especifico}` : ""}
Objeciones probables:
${objecionesTexto}
Casos reales de One Label (usar SOLO estos, nunca inventar):
${casosTexto}
`.trim();

    // ── Construir contextos ────────────────────────────────────

    // Llamada: usa el sistema heredado de VALE (pitch de 5 secciones)
    const decisoresTextoLlamada =
      ficha?.decisores && ficha.decisores.length > 0
        ? ficha.decisores
            .map((d) => `  • ${d.cargo}: ${d.dolor_especifico ?? d.por_que_es_clave ?? "sin dolor definido"}`)
            .join("\n")
        : "  Sin análisis de decisores disponible.";

    const contactosTextoLlamada =
      empresa.contactos.length > 0
        ? empresa.contactos
            .map((c) => `  • ${c.nombre} (${c.cargo ?? "sin cargo"}, ${c.area ?? "sin área"})`)
            .join("\n")
        : "  Sin contactos registrados aún.";

    const objecionesTextoLlamada =
      ficha?.objeciones_probables && ficha.objeciones_probables.length > 0
        ? ficha.objeciones_probables
            .map((o) => `  • "${o.objecion}" → ${o.como_responderla}`)
            .join("\n")
        : "  Sin análisis de objeciones.";

    const contextoLlamada = `
TIPO DE BORRADOR: ${tipo.toUpperCase()}
INSTRUCCIÓN CRÍTICA: ${INSTRUCCION_TIPO[tipo]}

━━━ EMPRESA ━━━
Nombre: ${empresa.nombre}
Industria: ${empresa.industria ?? "no especificada"}
Ángulo de entrada: ${ficha?.angulo_entrada ?? "Sin definir."}
Por qué necesitan etiquetas: ${ficha?.por_que_necesitan_etiquetas ?? "No especificado."}

━━━ DECISOR A CONTACTAR ━━━
Nombre: ${decisorNombre ?? "(no identificado aún)"}
Cargo: ${decisorCargo}
Área: ${decisorArea ?? "no especificada"}
${decisorFicha?.dolor_especifico ? `Dolor específico: ${decisorFicha.dolor_especifico}` : ""}

━━━ OTROS DECISORES ━━━
${decisoresTextoLlamada}

━━━ CONTACTOS REGISTRADOS ━━━
${contactosTextoLlamada}

━━━ OBJECIONES PROBABLES ━━━
${objecionesTextoLlamada}

━━━ CONTEXTO DEL VENDEDOR ━━━
${empresa.notas_vendedor?.trim() || "Sin notas adicionales."}

━━━ HISTORIAL DE INTERACCIONES (últimas 5) ━━━
${historialTexto || "Sin interacciones previas registradas."}

━━━ CASOS REALES DE ONE LABEL ━━━
${casosRelevantes.length > 0
  ? casosRelevantes.map((c) =>
      `- Sector: ${c.sector} | Decisor: ${c.cargo_decisor ?? "no especificado"} | Problema: ${c.problema} | Resultado: ${c.resultado}`
    ).join("\n")
  : "Sin casos documentados aún — no inventar referencias."}
${ejemplosAprobados}
`.trim();

    // DEBUG TEMPORAL — insertar en debug_logs para inspeccionar desde Supabase
    if (canal !== "llamada") {
      await supabase.from('debug_logs').insert({
        endpoint: 'preparacion',
        empresa_id: empresaId,
        datos: {
          nombre: empresa.nombre,
          rubro: empresa.industria,
          dolor_principal: decisorFicha?.dolor_especifico ?? ficha?.por_que_necesitan_etiquetas,
          angulo_entrada: ficha?.angulo_entrada,
          decisor_nombre: decisorNombre,
          decisor_cargo: decisorCargo,
          historial_texto_len: historialTexto?.length,
          contexto_vendedor: empresa.notas_vendedor,
          ficha_completa: ficha,
        },
        created_at: new Date().toISOString(),
      });
    }

    // Texto (whatsapp/correo/linkedin): buildPromptBorradores con SYSTEM_PROMPT_VALE.
    // Ahora recibe el tipo con su instrucción (antes solo la veía llamada) y el
    // contexto estratégico completo para que el selector de técnica de VALE opere.
    const promptBorradores = canal !== "llamada"
      ? buildPromptBorradores({
          nombre:           empresa.razon_social || empresa.nombre,
          rubro:            empresa.industria ?? "no especificado",
          decisorCargo:     decisorCargo,
          decisorNombre:    decisorNombre ?? "No registrado",
          historialReciente: historialTexto || "",
          contextoVendedor: empresa.notas_vendedor?.trim() || "",
          tipo,
          instruccionTipo:  INSTRUCCION_TIPO[tipo],
          contextoEstrategico,
        })
      : null;

    const systemPrompt = canal === "llamada"
      ? `${SYSTEM_PROMPT_VALE}\n\n${buildPromptBorradorCanal("llamada")}`
      : SYSTEM_PROMPT_VALE;

    console.log("[preparacion] prompt incluye rechazados:", rechazadosTexto.includes("RECHAZADOS"));

    const userMessage = canal === "llamada"
      ? contextoLlamada + "\n\n" + estrategiaBase + rechazadosTexto + cadenciaTexto
      : (promptBorradores ?? "") + ejemplosAprobados + rechazadosTexto + cadenciaTexto;

    const client = new Anthropic();
    const response = await client.messages.create({
      model: canal === "llamada" ? MODEL : "claude-sonnet-4-6",
      max_tokens: canal === "llamada" ? 800 : 1200,
      system: systemPrompt,
      messages: [
        { role: "user", content: userMessage },
      ],
    });

    void registrarUso({
      api: "claude",
      endpoint: MODEL,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      empresa_id: empresaId,
    });

    const textoRaw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    // DEBUG TEMPORAL — eliminar después de diagnosticar
    if (!textoRaw || textoRaw.length < 10) {
      return NextResponse.json({ error: "Claude no devolvió contenido", raw: textoRaw }, { status: 500 });
    }

    const jsonMatch = textoRaw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[preparacion] respuesta sin JSON:", textoRaw.slice(0, 300));
      return NextResponse.json({ error: "La IA no devolvió un JSON válido", raw: textoRaw.substring(0, 500) }, { status: 500 });
    }

    let borrador: BorradorCanalResult;

    if (canal === "llamada") {
      // Llamada: JSON plano con las 5 secciones del pitch
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
      if (!parsed.apertura || !parsed.gancho || !parsed.si_positivo || !parsed.si_negativo || !parsed.cierre) {
        return NextResponse.json({ error: "Respuesta incompleta: faltan secciones del pitch" }, { status: 500 });
      }
      borrador = {
        canal:       "llamada",
        apertura:    parsed.apertura,
        gancho:      parsed.gancho,
        si_positivo: parsed.si_positivo,
        si_negativo: parsed.si_negativo,
        cierre:      parsed.cierre,
      };
    } else {
      // Texto: JSON con whatsapp / correo / linkedin en un solo llamado.
      type TextResponse = {
        whatsapp: string;
        correo: { asunto: string; cuerpo: string };
        linkedin: string;
      };

      // Limpiar posibles bloques markdown antes de buscar el JSON
      const cleaned = textoRaw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      const jsonMatchText = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatchText) {
        console.error("[preparacion] respuesta sin JSON:", textoRaw.slice(0, 300));
        return NextResponse.json({ error: "La IA no devolvió un JSON válido", raw: textoRaw.substring(0, 500) }, { status: 500 });
      }

      let parsed: TextResponse;
      try {
        parsed = JSON.parse(jsonMatchText[0]) as TextResponse;
      } catch (e) {
        console.error("[preparacion] JSON parse error borradores:", e, "\nRaw:", textoRaw.slice(0, 400));
        return NextResponse.json(
          { error: "Parse failed", raw: textoRaw.substring(0, 500) },
          { status: 500 }
        );
      }

      if (canal === "correo") {
        if (!parsed.correo?.asunto || !parsed.correo?.cuerpo) {
          return NextResponse.json({ error: "Respuesta incompleta: faltan asunto o cuerpo" }, { status: 500 });
        }
        borrador = { canal: "correo", asunto: parsed.correo.asunto, cuerpo: parsed.correo.cuerpo };
      } else if (canal === "whatsapp") {
        if (!parsed.whatsapp) {
          return NextResponse.json({ error: "Respuesta incompleta: falta whatsapp" }, { status: 500 });
        }
        borrador = { canal: "whatsapp", texto: parsed.whatsapp };
      } else {
        if (!parsed.linkedin) {
          return NextResponse.json({ error: "Respuesta incompleta: falta linkedin" }, { status: 500 });
        }
        borrador = { canal: "linkedin", texto: parsed.linkedin };
      }
    }

    // Invalidar borradores anteriores no usados antes de insertar el nuevo.
    // Evita que el GET de /api/borradores devuelva uno viejo en la próxima apertura.
    try {
      let invQ = supabase
        .from("borradores")
        .update({ usado: true })
        .eq("empresa_id", empresaId)
        .eq("canal", canal)
        .eq("usado", false);
      if (contactoId) {
        invQ = invQ.eq("contacto_id", contactoId);
      } else {
        invQ = invQ.is("contacto_id", null);
      }
      await invQ;
    } catch (e) {
      console.error("[preparacion] error invalidando borradores anteriores:", e);
    }

    // Persistir en tabla borradores para carga en sesiones futuras y tracking de uso
    let borradorId: string | null = null;
    try {
      const { data: saved } = await supabase
        .from("borradores")
        .insert({
          empresa_id: empresaId,
          contacto_id: contactoId ?? null,
          canal,
          contenido: JSON.stringify(borrador),
          tipo,
        })
        .select("id")
        .single();
      borradorId = (saved as { id: string } | null)?.id ?? null;
    } catch (e) {
      console.error("[preparacion] error guardando en tabla borradores:", e);
    }

    return NextResponse.json({
      ok: true,
      borrador,
      borradorId,
      // Advertencias no bloqueantes (ej: área inferida) — el frontend las muestra
      advertencias: validacion.advertencias.length > 0 ? validacion.advertencias : undefined,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error("[preparacion] error:", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
