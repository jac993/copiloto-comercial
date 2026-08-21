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
import type { TipoInteraccion } from "@/lib/types";

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
