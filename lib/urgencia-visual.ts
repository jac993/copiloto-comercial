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

  const ROJO_INTENSO = "bg-red-100 dark:bg-red-950/40";
  const ROJO_SUAVE = "bg-red-50 dark:bg-red-950/20";

  // Congelado a futuro: el vendedor lo pospuso a propósito, igual que una
  // conversación pausada. Teñirlo sería castigarlo por una decisión suya.
  const congelado =
    empresa.prospecto_congelado_hasta !== null &&
    empresa.prospecto_congelado_hasta > hoyCL();

  // Casos en los que no hay nada que medir: pausada y congelada son
  // decisiones conscientes; reunion_agendada mide su umbral DESDE la fecha
  // de la reunión, no desde la última interacción.
  const medible =
    empresa.conversacion_pausada_at === null &&
    !congelado &&
    empresa.estado !== "reunion_agendada";

  let banda = "";
  if (medible && dias !== null) {
    const umbral = UMBRAL_ENFRIAMIENTO[empresa.estado];
    if (umbral !== undefined) {
      const ratio = dias / umbral;
      // Cuatro bandas: sin la de > 2 el modelo se saturaba y una empresa
      // 20% pasada del umbral se veía igual que una 430% pasada.
      banda =
        ratio > 2 ? ROJO_INTENSO
        : ratio > 1 ? ROJO_SUAVE
        : ratio >= 0.6 ? "bg-amber-50 dark:bg-amber-950/20"
        : "bg-green-50 dark:bg-green-950/20";
    }
  }

  // Una tarea vencida es urgencia máxima: pone piso en rojo suave, pero NO
  // rebaja el rojo intenso si el enfriamiento ya lo justificaba. Antes hacía
  // return antes de calcular el ratio, así que una vencida con ratio 4 se
  // habría visto menos grave que una no vencida con ratio 3.
  if (vencida) return banda === ROJO_INTENSO ? ROJO_INTENSO : ROJO_SUAVE;
  return banda;
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
