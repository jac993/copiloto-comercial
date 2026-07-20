// =============================================================
// Detección de prospectos que se enfrían silenciosamente.
// Lógica PURA de reglas — CERO llamadas a IA, cero efectos.
//
// Regla: una empresa está "enfriada" cuando lleva más días hábiles
// sin movimiento que el umbral de su etapa. El ancla del cálculo es
// la última interacción REAL (excluye tareas de cadencia pendientes);
// si no hay ninguna, la fecha en que entró a su etapa (estado_desde).
//
// Excepción reunion_agendada: el ancla es la fecha de la reunión
// (proxy: proximo_paso_fecha de la tarea pendiente) — esperar una
// reunión agendada no es enfriamiento, así que antes de esa fecha
// nunca alerta.
// =============================================================

import { diasHabilesEntre } from "@/lib/fecha";
import type { EstadoEmpresa } from "@/lib/types";

// Umbrales por etapa en días hábiles (valores confirmados por el usuario).
// ganado/perdido no aplican: Panorama ya los excluye.
export const UMBRAL_ENFRIAMIENTO: Partial<Record<EstadoEmpresa, number>> = {
  prospecto: 7,
  contactado: 5,
  en_conversacion: 4,
  reunion_agendada: 2, // días hábiles DESPUÉS de la fecha de reunión
  cotizado: 7,
};

export interface ResultadoEnfriamiento {
  enfriada: boolean;
  /** Días hábiles sin movimiento desde el ancla. 0 si el ancla es futura. */
  dias_sin_movimiento: number;
}

/**
 * Evalúa el enfriamiento de una empresa. Fechas en "YYYY-MM-DD".
 * - ultimaInteraccion: fecha CL de la última interacción real (o null).
 * - estadoDesde: empresas.estado_desde (o null si el backfill no corrió).
 * - fechaReunion: proximo_paso_fecha de la tarea pendiente, solo relevante
 *   para reunion_agendada (o null).
 * Sin ningún ancla disponible → nunca alerta (no hay base para medir).
 */
export function calcularEnfriamiento(opts: {
  estado: EstadoEmpresa;
  hoy: string;
  ultimaInteraccion: string | null;
  estadoDesde: string | null;
  fechaReunion: string | null;
}): ResultadoEnfriamiento {
  const { estado, hoy, ultimaInteraccion, estadoDesde, fechaReunion } = opts;
  const umbral = UMBRAL_ENFRIAMIENTO[estado];
  if (umbral === undefined) return { enfriada: false, dias_sin_movimiento: 0 };

  // Ancla según etapa: reunión agendada mide desde la fecha de la reunión.
  const ancla =
    estado === "reunion_agendada"
      ? fechaReunion ?? ultimaInteraccion ?? estadoDesde
      : ultimaInteraccion ?? estadoDesde;
  if (!ancla) return { enfriada: false, dias_sin_movimiento: 0 };

  const dias = diasHabilesEntre(ancla, hoy);
  return { enfriada: dias > umbral, dias_sin_movimiento: dias };
}
