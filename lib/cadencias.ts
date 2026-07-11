// =============================================================
// Sistema de cadencias por reglas — lógica PURA, sin efectos.
// Resuelve canales según disponibilidad del decisor (cascada de
// fallback) y adapta la secuencia completa con fechas hábiles.
// CERO llamadas a IA: los borradores usan el flujo de Consultar.
//
// No confundir con lib/cadencia.ts (singular): esa es la heurística
// que INFIERE touches desde el historial para alertas/borradores.
// Este módulo ejecuta cadencias EXPLÍCITAS asignadas por el vendedor.
// =============================================================

import { sumarDiasHabilesDesde } from "@/lib/fecha";
import type { CadenciaPaso, CanalCadenciaPaso } from "@/lib/types";

// Forma mínima del contacto que necesita la disponibilidad de canal
export interface ContactoCanales {
  email?: string | null;
  telefono?: string | null;
  linkedin_url?: string | null;
}

export interface PasoAdaptado {
  orden: number;           // orden original en la plantilla
  canal: CanalCadenciaPaso; // canal RESUELTO (puede ser un fallback)
  canalOriginal: CanalCadenciaPaso;
  fecha: string;           // YYYY-MM-DD calculada en días hábiles
  intencion: string;
  pasoId: string;
}

export interface CadenciaAdaptada {
  pasos: PasoAdaptado[];
  omitidos: { orden: number; canal: CanalCadenciaPaso }[];
}

// ── Disponibilidad de canales según datos del contacto ────────
// correo si tiene email · linkedin si tiene URL · llamada y whatsapp si tiene teléfono
export function canalesDisponibles(c: ContactoCanales): Set<CanalCadenciaPaso> {
  const set = new Set<CanalCadenciaPaso>();
  if (c.email?.trim()) set.add("correo");
  if (c.linkedin_url?.trim()) set.add("linkedin");
  if (c.telefono?.trim()) {
    set.add("llamada");
    set.add("whatsapp");
  }
  return set;
}

// ── Resolución de canal de UN paso ────────────────────────────
// 1. Canal principal si está disponible; si no, recorrer canal_fallback en orden.
// 2. Si el canal resuelto repite el del paso anterior y el paso es omitible → null (omitir).
// 3. Si ningún canal está disponible: omitible → null; no omitible → null igualmente
//    (no se puede ejecutar un paso sin canal — el llamador decide cómo avisar).
export function resolverCanal(
  paso: Pick<CadenciaPaso, "canal" | "canal_fallback" | "omitible">,
  disponibles: Set<CanalCadenciaPaso>,
  canalPasoAnterior: CanalCadenciaPaso | null
): CanalCadenciaPaso | null {
  const candidatos: CanalCadenciaPaso[] = [paso.canal, ...paso.canal_fallback];
  const resuelto = candidatos.find((c) => disponibles.has(c)) ?? null;
  if (resuelto === null) return null;
  if (paso.omitible && resuelto === canalPasoAnterior) return null;
  return resuelto;
}

// ── Adaptación de la secuencia completa ───────────────────────
// Retorna los pasos ejecutables con canal resuelto y fecha (días hábiles,
// dia_offset relativo al paso anterior EJECUTABLE — al omitir pasos el
// espaciado se comprime porque el offset del paso omitido no se suma).
// Pura y determinística: misma entrada → misma salida. Se usa tanto en
// el preview de UI como en la generación real de tareas.
export function adaptarCadencia(
  pasos: CadenciaPaso[],
  disponibles: Set<CanalCadenciaPaso>,
  fechaInicio: string
): CadenciaAdaptada {
  const ordenados = [...pasos].sort((a, b) => a.orden - b.orden);
  const resultado: PasoAdaptado[] = [];
  const omitidos: CadenciaAdaptada["omitidos"] = [];

  let fechaBase = fechaInicio;
  let canalAnterior: CanalCadenciaPaso | null = null;

  for (const paso of ordenados) {
    const canal = resolverCanal(paso, disponibles, canalAnterior);
    if (canal === null) {
      omitidos.push({ orden: paso.orden, canal: paso.canal });
      continue; // su dia_offset no se acumula → el espaciado se comprime
    }
    const fecha = sumarDiasHabilesDesde(fechaBase, paso.dia_offset);
    resultado.push({
      orden: paso.orden,
      canal,
      canalOriginal: paso.canal,
      fecha,
      intencion: paso.intencion,
      pasoId: paso.id,
    });
    fechaBase = fecha;
    canalAnterior = canal;
  }

  return { pasos: resultado, omitidos };
}

// ── Etiquetas para UI ─────────────────────────────────────────
export const CANAL_PASO_LABEL: Record<CanalCadenciaPaso, string> = {
  whatsapp: "WhatsApp",
  correo: "Correo",
  linkedin: "LinkedIn",
  llamada: "Llamada",
};

export const CANAL_PASO_EMOJI: Record<CanalCadenciaPaso, string> = {
  whatsapp: "📱",
  correo: "📧",
  linkedin: "💼",
  llamada: "📞",
};

// interacciones.tipo correspondiente a cada canal de cadencia
export function canalATipoInteraccion(canal: CanalCadenciaPaso): string {
  return canal === "correo" ? "email" : canal;
}

export function tipoInteraccionACanal(tipo: string): CanalCadenciaPaso | null {
  switch (tipo) {
    case "email": return "correo";
    case "whatsapp": case "linkedin": case "llamada":
      return tipo;
    default: return null;
  }
}
