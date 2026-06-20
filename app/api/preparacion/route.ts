// =============================================================
// POST /api/preparacion
// Genera UN borrador personalizado para un canal y decisor.
// El tipo (apertura/seguimiento/continuacion/reactivacion) se
// detecta en el cliente según historial real con ese contacto.
// Se llama solo cuando el usuario pincha el canal — nunca en bg.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildPromptBorradorCanal, SYSTEM_PROMPT_VALE } from "@/lib/prompts";
import { registrarUso } from "@/lib/registrarUso";

export const maxDuration = 30;

const MODEL = "claude-haiku-4-5-20251001";

export type CanalBorrador = "whatsapp" | "correo" | "linkedin";
export type TipoBorrador = "apertura" | "seguimiento" | "continuacion" | "reactivacion";

// Discriminated union para type-safe acceso en el cliente
export type BorradorCanalResult =
  | { canal: "whatsapp"; texto: string }
  | { canal: "linkedin"; texto: string }
  | { canal: "correo"; asunto: string; cuerpo: string };

interface HistorialItem {
  fecha: string;
  tipo: string;
  remitente: string;
  resumen: string;
  proximoPaso?: string | null;
}

interface PrepararBody {
  empresaId: string;
  canal: CanalBorrador;
  tipo?: TipoBorrador;
  nombreEmpresa: string;
  industria?: string | null;
  notasVendedor?: string | null;
  decisorNombre?: string | null;
  decisorCargo: string;
  decisorArea?: string | null;
  dolorEspecifico: string;
  tecnicaRecomendada: string;
  anguloEntrada: string;
  descripcion: string;
  porQueNecesitanEtiquetas: string;
  historial: HistorialItem[];
}

// Instrucción explícita por tipo para que Claude no meta la pata
const INSTRUCCION_TIPO: Record<TipoBorrador, string> = {
  apertura:
    "PRIMER CONTACTO. Preséntate brevemente y presenta el motivo del contacto. El decisor no te conoce.",
  seguimiento:
    "YA HUBO CONTACTO PREVIO pero no se llegó a nada concreto. NO te presentes de nuevo. Retoma el hilo reconociendo el contacto anterior y propone un paso concreto.",
  continuacion:
    "HAY HISTORIAL POSITIVO. NO te presentes. Construye directamente sobre lo conversado, referencia lo acordado y propulsa el siguiente paso.",
  reactivacion:
    "LOS INTENTOS ANTERIORES NO TUVIERON ÉXITO. NO te presentes. Intenta con un ángulo completamente distinto al anterior — no repitas el mismo mensaje.",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as PrepararBody;
    const {
      empresaId, canal, tipo: tipoRaw, nombreEmpresa, industria, notasVendedor,
      decisorNombre, decisorCargo, decisorArea,
      dolorEspecifico, tecnicaRecomendada,
      anguloEntrada, descripcion, porQueNecesitanEtiquetas,
      historial,
    } = body;

    const tipo: TipoBorrador = tipoRaw ?? "apertura";

    if (!empresaId || !canal || !nombreEmpresa || !decisorCargo) {
      return NextResponse.json(
        { error: "empresaId, canal, nombreEmpresa y decisorCargo son requeridos" },
        { status: 400 }
      );
    }

    const canalesValidos: CanalBorrador[] = ["whatsapp", "correo", "linkedin"];
    if (!canalesValidos.includes(canal)) {
      return NextResponse.json({ error: `Canal inválido: ${canal}` }, { status: 400 });
    }

    const historialTexto = historial.length > 0
      ? historial.map((i) => {
          const fecha = new Date(i.fecha).toLocaleString("es-CL", {
            day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: false,
          });
          const rem = i.remitente === "prospecto" ? "Prospecto" : "Vendedor";
          return `- [${fecha}] ${i.tipo} — ${rem}: "${i.resumen}"${i.proximoPaso ? ` → Próximo: ${i.proximoPaso}` : ""}`;
        }).join("\n")
      : "Sin interacciones previas registradas.";

    const contexto = `
TIPO DE BORRADOR: ${tipo.toUpperCase()}
INSTRUCCIÓN CRÍTICA: ${INSTRUCCION_TIPO[tipo]}

EMPRESA DESTINO:
- Nombre: ${nombreEmpresa}
- Industria: ${industria ?? "no especificada"}
- Descripción: ${descripcion}
- Por qué necesitan etiquetas: ${porQueNecesitanEtiquetas}
- Ángulo de entrada: ${anguloEntrada}

DECISOR A CONTACTAR:
- Nombre: ${decisorNombre ?? "(no identificado aún)"}
- Cargo: ${decisorCargo}
- Área: ${decisorArea ?? "no especificada"}
- Dolor específico: ${dolorEspecifico}
- Técnica recomendada: ${tecnicaRecomendada}

CONTEXTO DEL VENDEDOR (lo que solo él sabe):
${notasVendedor?.trim() ? notasVendedor : "Sin notas adicionales."}

HISTORIAL CON ESTE CONTACTO (últimas 5 interacciones):
${historialTexto}
`.trim();

    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: `${SYSTEM_PROMPT_VALE}\n\n${buildPromptBorradorCanal(canal)}`,
      messages: [
        { role: "user", content: contexto },
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
