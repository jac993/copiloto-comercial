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
import { getEmpresaCompleta, getHistorialResumido, getCasosActivosPorSector, getFeedbackEjemplos } from "@/lib/queries";
import { buildPromptBorradorCanal, SYSTEM_PROMPT_VALE, SYSTEM_PROMPT_BORRADORES_TEXTO } from "@/lib/prompts";
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
}

// Instrucción explícita por tipo para que Claude no meta la pata
const INSTRUCCION_TIPO: Record<TipoBorrador, string> = {
  apertura:
    "PRIMER CONTACTO. Preséntate brevemente y presenta el motivo del contacto. El decisor no te conoce.",
  seguimiento:
    "YA HUBO CONTACTO PREVIO pero no se llegó a nada concreto. NO te presentes de nuevo. Retoma el hilo reconociendo el contacto anterior y propone un paso concreto.",
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

PARA CORREO — asunto sin presión:
Correcto: "Retomando el tema de etiquetado"
Incorrecto: "Seguimiento pendiente", "¿Pudiste revisar mi mensaje?"`,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as PrepararBody;
    const { empresaId, canal, tipo: tipoRaw, decisorNombre, decisorCargo, decisorArea } = body;

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

    // Cargar contexto completo desde Supabase en paralelo
    const [empresa, historialTexto, feedbackEjemplos] = await Promise.all([
      getEmpresaCompleta(empresaId),
      getHistorialResumido(empresaId),
      getFeedbackEjemplos(canal),
    ]);

    // Casos reales relevantes por sector — se cargan después de tener la empresa
    const casosRelevantes = empresa
      ? await getCasosActivosPorSector(empresa.industria ?? null)
      : [];

    if (!empresa) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const tipo: TipoBorrador = tipoRaw ?? "apertura";
    const ficha = empresa.ficha_ia;

    // Decisor en la ficha IA (para dolor específico)
    const decisorFicha = ficha?.decisores?.find(
      (d) => d.cargo.toLowerCase() === decisorCargo.toLowerCase()
    );

    // ── Instrucción de output por canal de texto ──────────────
    const INSTRUCCION_OUTPUT: Record<"whatsapp" | "correo" | "linkedin", string> = {
      whatsapp: `CANAL: WhatsApp
- Máximo 4 líneas (≈80 palabras). Tono directo y cercano.
- Sin asteriscos ni emojis. Texto plano únicamente.
- NO empezar con "Hola soy X de empresa Y".
- Terminar con UNA pregunta de situación o problema (SPIN), nunca con despedida formal.

Genera exactamente este JSON sin texto adicional:
{"texto": "el mensaje completo"}`,

      correo: `CANAL: Correo electrónico
- "asunto": máximo 8 palabras, sin signos de exclamación, que nombre el dolor del decisor.
- "cuerpo": exactamente 3 párrafos. P1: hook concreto sobre su negocio (no sobre One Label). P2: problema probable según su cargo/industria + cómo se resuelve (sin inventar casos). P3: un solo CTA (15 min de llamada o respuesta a una pregunta). Máximo 120 palabras en el cuerpo.
- Si hay nombre del decisor, usar "Hola [Nombre],". Si no, omitir saludo personalizado.

Genera exactamente este JSON sin texto adicional:
{"asunto": "el asunto", "cuerpo": "el cuerpo completo del correo"}`,

      linkedin: `CANAL: LinkedIn
- Máximo 3 líneas (≈60 palabras). Tono profesional. CERO lenguaje de ventas.
- Prohibido: "ventas", "propuesta", "cotización", "proveedor", "oferta", "producto".
- Abrir con algo que demuestre que se investigó SU empresa específicamente.
- Terminar con una pregunta de diagnóstico que invite a responder.

Genera exactamente este JSON sin texto adicional:
{"texto": "el mensaje completo"}`,
    };

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
`.trim();

    // Texto (whatsapp/correo/linkedin): prompt anti-alucinación estricto
    const ejemplosFeedbackTexto = feedbackEjemplos.length > 0
      ? `EJEMPLOS DE MENSAJES APROBADOS POR EL VENDEDOR (aprende el tono y estilo, no copies):\n${
          feedbackEjemplos.map((fb, i) => {
            const texto = fb.version_vendedor?.trim() || fb.borrador_ia;
            return `Ejemplo ${i + 1}:\n${texto}`;
          }).join("\n---\n")
        }\n`
      : "";

    const casosTexto = casosRelevantes.length > 0
      ? `CASOS REALES DE ONE LABEL (referencia de sector — no inventar otros):\n${
          casosRelevantes.map((c) =>
            `- Sector: ${c.sector} | Decisor: ${c.cargo_decisor ?? "no especificado"} | Problema: ${c.problema} | Resultado: ${c.resultado}`
          ).join("\n")
        }\n`
      : "";

    const instruccionTipoTexto = tipo !== "apertura"
      ? `INSTRUCCIÓN ADICIONAL PARA ESTE TIPO:\n${INSTRUCCION_TIPO[tipo]}\n`
      : "";

    const canalKey = canal as "whatsapp" | "correo" | "linkedin";
    const contextoTexto = `
TIPO DE CONTACTO: ${tipo.toUpperCase()}
${instruccionTipoTexto}
CONTEXTO DE LA EMPRESA:
- Nombre: ${empresa.nombre}
- Rubro: ${empresa.industria ?? "no especificado"}
- Por qué necesitan etiquetas: ${ficha?.por_que_necesitan_etiquetas ?? "no especificado"}
- Ángulo de entrada (estrategia): ${ficha?.angulo_entrada ?? "sin definir"}

DECISOR PRINCIPAL:
- Nombre: ${decisorNombre ?? "No identificado aún"}
- Cargo: ${decisorCargo}
- Área: ${decisorArea ?? "no especificada"}
${decisorFicha?.dolor_especifico ? `- Dolor específico: ${decisorFicha.dolor_especifico}` : ""}

HISTORIAL DE INTERACCIONES:
${historialTexto || "Sin interacciones previas registradas."}

CONTEXTO ADICIONAL DEL VENDEDOR:
${empresa.notas_vendedor?.trim() || "Sin notas adicionales."}

${casosTexto}${ejemplosFeedbackTexto}${INSTRUCCION_OUTPUT[canalKey]}
`.trim();

    const systemPrompt = canal === "llamada"
      ? `${SYSTEM_PROMPT_VALE}\n\n${buildPromptBorradorCanal("llamada")}`
      : SYSTEM_PROMPT_BORRADORES_TEXTO;

    const userMessage = canal === "llamada" ? contextoLlamada : contextoTexto;

    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: canal === "llamada" ? 800 : 400,
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
    const jsonMatch = textoRaw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[preparacion] respuesta sin JSON:", textoRaw.slice(0, 300));
      return NextResponse.json({ error: "La IA no devolvió un JSON válido" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;

    let borrador: BorradorCanalResult;
    if (canal === "correo") {
      if (!parsed.asunto || !parsed.cuerpo) {
        return NextResponse.json({ error: "Respuesta incompleta: faltan asunto o cuerpo" }, { status: 500 });
      }
      borrador = { canal: "correo", asunto: parsed.asunto, cuerpo: parsed.cuerpo };
    } else if (canal === "llamada") {
      if (!parsed.apertura || !parsed.gancho || !parsed.si_positivo || !parsed.si_negativo || !parsed.cierre) {
        return NextResponse.json({ error: "Respuesta incompleta: faltan secciones del pitch" }, { status: 500 });
      }
      borrador = {
        canal: "llamada",
        apertura:     parsed.apertura,
        gancho:       parsed.gancho,
        si_positivo:  parsed.si_positivo,
        si_negativo:  parsed.si_negativo,
        cierre:       parsed.cierre,
      };
    } else if (canal === "whatsapp") {
      if (!parsed.texto) {
        return NextResponse.json({ error: "Respuesta incompleta: falta texto" }, { status: 500 });
      }
      borrador = { canal: "whatsapp", texto: parsed.texto };
    } else {
      if (!parsed.texto) {
        return NextResponse.json({ error: "Respuesta incompleta: falta texto" }, { status: 500 });
      }
      borrador = { canal: "linkedin", texto: parsed.texto };
    }

    return NextResponse.json({ ok: true, borrador });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error("[preparacion] error:", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
