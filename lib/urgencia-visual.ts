// =============================================================
// Presentación de la urgencia comercial: traduce los días sin
// contacto en clases de Tailwind y en las etiquetas que muestran
// las tarjetas del pipeline.
//
// Vive aparte de lib/enfriamiento.ts a propósito: ese módulo es
// lógica PURA de reglas y no debe conocer Tailwind. Acá es al
// revés — esto es presentación, igual que lib/interaccion-meta.ts.
//
// Lo consumen vista-kanban.tsx y empresa-card.tsx.
// =============================================================

import { hoyCL } from "@/lib/fecha";
import { UMBRAL_ENFRIAMIENTO } from "@/lib/enfriamiento";
import type { Empresa } from "@/lib/types";

// Fondo suave según los días hábiles sin interacción real, medidos
// contra el umbral de SU etapa. Devuelve "" cuando no corresponde
// teñir: el llamador deja entonces el fondo normal de la tarjeta.
export function fondoUrgencia(
  empresa: Empresa,
  dias: number | null,
  vencida: boolean
): string {
  // Ganado y perdido ya tienen fondo propio (verde / gris + opacidad):
  // el estado manda sobre la urgencia.
  if (empresa.estado === "ganado" || empresa.estado === "perdido") return "";

  const ROJO = "bg-red-50 dark:bg-red-950/20";

  // Una tarea vencida es urgencia máxima y gana sobre el enfriamiento.
  if (vencida) return ROJO;

  // Pausada: decisión consciente del vendedor, no un descuido.
  if (empresa.conversacion_pausada_at !== null) return "";
  // reunion_agendada: su umbral se mide DESDE la fecha de la reunión,
  // no desde la última interacción. Sin ese dato no se puede teñir bien.
  if (empresa.estado === "reunion_agendada") return "";
  // Sin interacciones reales no hay nada que medir.
  if (dias === null) return "";

  const umbral = UMBRAL_ENFRIAMIENTO[empresa.estado];
  if (umbral === undefined) return "";

  const ratio = dias / umbral;
  // > 1 y no >= 1: en el umbral exacto todavía no está enfriada, igual
  // que el `dias > umbral` de calcularEnfriamiento.
  if (ratio > 1) return ROJO;
  if (ratio >= 0.6) return "bg-amber-50 dark:bg-amber-950/20";
  return "bg-green-50 dark:bg-green-950/20";
}

// Días CALENDARIO en la etapa actual. Calendario y no hábiles porque
// es antigüedad, no tiempo de respuesta — mismo criterio que el
// dias_en_etapa de /api/panorama. null si estado_desde nunca se pobló.
export function diasEnEtapa(estadoDesde: string | null): number | null {
  if (!estadoDesde) return null;
  return Math.round((Date.parse(hoyCL()) - Date.parse(estadoDesde)) / 86_400_000);
}

// Línea compacta de contexto temporal. `compacto` la acorta para la
// columna de 220px del kanban.
export function lineaTiempos(
  estadoDesde: string | null,
  diasSinContacto: number | null,
  compacto = false
): string | null {
  const enEtapa = diasEnEtapa(estadoDesde);
  const partes: string[] = [];

  if (enEtapa !== null) {
    partes.push(compacto ? `${enEtapa}d en etapa` : `${enEtapa} días en esta etapa`);
  }
  if (diasSinContacto !== null) {
    // El dato viene en días HÁBILES (getDiasSinContactoPorEmpresa usa
    // diasHabilesEntre), así que la etiqueta lo dice: 23 hábiles son ~32
    // corridos, y omitirlo haría parecer el número más chico de lo que es.
    partes.push(
      compacto
        ? `${diasSinContacto}d hábiles sin contacto`
        : `último contacto hace ${diasSinContacto} días hábiles`
    );
  }
  return partes.length > 0 ? partes.join(" · ") : null;
}
