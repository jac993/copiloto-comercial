// =============================================================
// Metadatos de presentación por tipo de interacción: emoji, label e
// icono. Fuente única — estaba duplicado en 4 componentes
// (llamadas-client, tab-historial, nueva-interaccion-sheet y
// alertas/page), lo que hacía fácil que se desincronizaran.
//
// Solo presentación: el flag de si un canal gasta créditos de IA vive
// en nueva-interaccion-sheet (TIPOS.ia), que es donde tiene sentido.
// =============================================================

import type { ElementType } from "react";
import { Phone, Mail, MessageCircle, Briefcase, PhoneOff, Users } from "lucide-react";
import type { Interaccion, TipoInteraccion } from "@/lib/types";

export interface TipoInteraccionMeta {
  emoji: string;
  label: string;
  Icon: ElementType;
}

export const TIPO_CONF: Record<TipoInteraccion, TipoInteraccionMeta> = {
  llamada:       { emoji: "📞", label: "Llamada",       Icon: Phone },
  email:         { emoji: "📧", label: "Correo",        Icon: Mail },
  whatsapp:      { emoji: "💬", label: "WhatsApp",      Icon: MessageCircle },
  linkedin:      { emoji: "💼", label: "LinkedIn",      Icon: Briefcase },
  reunion:       { emoji: "🤝", label: "Reunión",       Icon: Users },
  sin_respuesta: { emoji: "⏰", label: "Sin respuesta", Icon: PhoneOff },
};

// ── Qué cuenta como conversación real ────────────────────────

// Marcadores de sistema que NO son conversación real y se OCULTAN del
// historial: filas vacías (stubs de métricas del botón "✓ Hecho") y
// "Sin respuesta tras 48h" standalone (stub de tarea, sin parent_id).
// OJO: "Llamada sin respuesta" NO va aquí — el vendedor la ingresa a mano
// desde el sheet ("No contestó") y ocultarla parecía pérdida de datos
// (regresión de bc611ab). Se muestra como evento compacto de sistema.
export const MARCADORES_OCULTAR = new Set(["Sin respuesta tras 48h"]);
export const MARCADOR_LLAMADA_SIN_RESPUESTA = "Llamada sin respuesta";

// true = registro de sistema, no conversación. Lo usan el historial (para
// ocultarlo) y el panel de seguimiento (para no tomarlo como última
// actividad). CUIDADO: estos stubs SÍ traen contacto_id, así que filtrar
// por contacto_id != null no alcanza para excluirlos.
export function esStubDeTarea(i: Interaccion): boolean {
  if (i.parent_id) return false;
  const t = (i.transcripcion ?? "").trim();
  const sinResumen = !(i.resumen_ia ?? "").trim();
  // Sin resumen de IA y cuyo único "texto" es vacío o un marcador de sistema.
  return sinResumen && (t === "" || MARCADORES_OCULTAR.has(t));
}

// ── ¿El prospecto ya conoce al vendedor? ─────────────────────
// Decide si un borrador debe incluir una línea de presentación. Un intento
// saliente sin respuesta NO presenta al vendedor: una llamada que nadie
// contestó o un correo que nadie respondió no le dice al prospecto quién
// es. Solo cuenta un intercambio real: el prospecto escribió o respondió,
// hubo reunión, o hubo una llamada con conversación.
export const MARCADOR_RESPONDIO = "Respondió al contacto";

// Resoluciones negativas: el botón las guarda como respuesta del prospecto
// (remitente "prospecto", sentimiento "negativo") aunque justamente NO
// respondió. Hay que descartarlas antes de mirar el remitente.
const MARCADORES_SIN_CONTACTO = new Set([
  "Vio el mensaje pero no respondió",
  "Sin respuesta tras 48h",
  MARCADOR_LLAMADA_SIN_RESPUESTA,
]);

export type InteraccionContactoReal = Pick<
  Interaccion,
  "tipo" | "remitente" | "transcripcion" | "resumen_ia" | "sentimiento"
> & {
  cadencia_asignacion_id?: string | null;
  resuelta?: boolean | null;
};

export function esContactoReal(i: InteraccionContactoReal): boolean {
  // Tarea de cadencia pendiente: recordatorio de enviar, no un contacto.
  if (i.cadencia_asignacion_id && i.resuelta === false) return false;
  const t = (i.transcripcion ?? "").trim();
  // "Llamada sin respuesta" se guarda con sentimiento "neutro", así que el
  // sentimiento no basta: hay que mirar el marcador.
  if (MARCADORES_SIN_CONTACTO.has(t)) return false;
  if (i.remitente === "prospecto" || t === MARCADOR_RESPONDIO) return true;
  if (i.tipo === "reunion") return true;
  if (i.tipo === "sin_respuesta" || i.sentimiento === "sin_respuesta") return false;
  if (i.tipo === "llamada") {
    // Llamada con transcripción o resumen = hubo conversación.
    return t !== "" || !!(i.resumen_ia ?? "").trim();
  }
  // Mensajes escritos del vendedor (correo, WhatsApp, LinkedIn): solo cuentan
  // si el análisis detectó una reacción del prospecto. "neutro" no alcanza:
  // es el valor por defecto de un mensaje saliente sin respuesta.
  return i.sentimiento === "positivo" || i.sentimiento === "negativo";
}
