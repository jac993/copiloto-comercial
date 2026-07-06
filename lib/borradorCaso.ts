// =============================================================
// Construye un borrador de Caso a partir de una empresa ganada,
// usando SOLO datos que ya existen en la BD (cero IA / cero costo).
// "solucion" y "resultado" quedan vacíos a propósito: son los dos
// campos que solo el vendedor conoce y debe completar/confirmar.
// =============================================================

import type { Empresa, CasoInsert, TecnicaCaso, TamanoCaso } from "@/lib/types";

// Borrador parcial + el nombre de empresa (solo para el aviso, no es campo del caso)
export type BorradorCaso = Partial<Omit<CasoInsert, "activo">> & { _empresaNombre?: string };

// La técnica de la ficha (TecnicaVenta) no coincide 1:1 con la del caso (TecnicaCaso)
const TECNICA_MAP: Record<string, TecnicaCaso> = {
  spin:       "SPIN",
  challenger: "Challenger",
  consultiva: "Consultiva",
  relacional: "Otra",
};

const TAMANO_MAP: Record<string, TamanoCaso> = {
  grande:  "grande",
  mediana: "mediana",
  "pequeña": "pequeña",
  pequena: "pequeña",
};

// Clave de sessionStorage para pasar el borrador del Kanban a la pantalla de Casos
export const BORRADOR_CASO_STORAGE_KEY = "borrador_caso_pendiente";

export function construirBorradorCaso(empresa: Empresa): BorradorCaso {
  const ficha = empresa.ficha_ia;

  // Problema: prioriza el dolor MEDDIC (lo más específico que confirmó el vendedor),
  // luego el "por qué necesitan etiquetas" de la ficha, luego el resumen ejecutivo.
  const problema =
    empresa.meddic?.dolor_identificado?.texto?.trim() ||
    ficha?.por_que_necesitan_etiquetas?.trim() ||
    ficha?.resumen_ejecutivo?.trim() ||
    "";

  const tecnica = ficha?.tecnica_recomendada
    ? TECNICA_MAP[ficha.tecnica_recomendada.toLowerCase()] ?? null
    : null;

  const tamanoRaw = empresa.tamano_estimado ?? ficha?.tamano_estimado ?? null;
  const tamano = tamanoRaw ? TAMANO_MAP[tamanoRaw.toLowerCase()] ?? null : null;

  return {
    sector: empresa.industria?.trim() || "",
    tamano_empresa: tamano,
    cargo_decisor: ficha?.decisores?.[0]?.cargo ?? null,
    problema,
    tipo_etiqueta: ficha?.productos_etiquetas?.[0]?.tipo ?? null,
    tecnica_venta: tecnica,
    // El vendedor completa estos dos — no se inventan:
    solucion: "",
    resultado: "",
    _empresaNombre: empresa.nombre,
  };
}
