// =============================================================
// Gate de calidad de datos para generación de borradores.
// Corre ANTES de llamar a buildPromptBorradores/buildPromptBorradorCanal
// para impedir que Claude rellene vacíos con generalidades.
// No hace queries a Supabase: trabaja con datos ya cargados.
// =============================================================

import type { EmpresaCompleta, AreaContacto } from "@/lib/types";

// Palabras clave en el cargo → área normalizada.
// Exportado para poder ajustarlo sin tocar la lógica del gate.
// Las frases más largas primero para evitar falsos positivos
// (ej: "gerente general" debe ganar a "gerente" sola).
export const MAPEO_CARGO_AREA: Record<string, AreaContacto> = {
  // Calidad
  "aseguramiento de la calidad": "calidad",
  "control de calidad":          "calidad",
  "aseguramiento":               "calidad",
  "calidad":                     "calidad",
  "qc":                          "calidad",
  "qa":                          "calidad",
  // Gerencia
  "gerente general":             "gerencia",
  "director general":            "gerencia",
  "director ejecutivo":          "gerencia",
  "gerencia general":            "gerencia",
  "director":                    "gerencia",
  "dueño":                       "gerencia",
  "dueno":                       "gerencia",
  "ceo":                         "gerencia",
  "gerencia":                    "gerencia",
  // Adquisiciones/Compras
  "jefe de adquisiciones":       "adquisiciones",
  "jefe de compras":             "adquisiciones",
  "gerente de compras":          "adquisiciones",
  "adquisiciones":               "adquisiciones",
  "compras":                     "adquisiciones",
  "procurement":                 "adquisiciones",
  "abastecimiento":              "adquisiciones",
  // Operaciones
  "supply chain":                "operaciones",
  "operaciones":                 "operaciones",
  "producción":                  "operaciones",
  "produccion":                  "operaciones",
  "manufactura":                 "operaciones",
  "logística":                   "operaciones",
  "logistica":                   "operaciones",
  "planta":                      "operaciones",
  "despacho":                    "operaciones",
};

export type ResultadoValidacion =
  | {
      ok: true;
      advertencias: string[];
      // Si el área fue inferida desde el cargo, el endpoint puede persistirla
      actualizarContacto?: {
        id: string;
        area: AreaContacto;
        agregarNota: string;
      };
    }
  | {
      ok: false;
      error: "datos_insuficientes";
      mensaje: string;
      campos_faltantes: string[];
      accion_recomendada: string;
    };

// Infiere el área desde el cargo usando MAPEO_CARGO_AREA.
// Ordena las claves por longitud descendente para que frases largas ganen.
export function inferirArea(cargo: string): { area: AreaContacto; inferido: boolean } {
  const lower = cargo.toLowerCase();
  const claves = Object.keys(MAPEO_CARGO_AREA).sort((a, b) => b.length - a.length);
  for (const clave of claves) {
    if (lower.includes(clave)) {
      return { area: MAPEO_CARGO_AREA[clave], inferido: true };
    }
  }
  return { area: "otro", inferido: false };
}

// Gate principal. Recibe datos ya cargados — no hace queries.
//
// Regla de bloqueo: si los tres campos de research están vacíos,
// Claude solo tiene el nombre de la empresa para operar → bloquear.
// Regla de advertencia: si el área del contacto no está definida,
// intentar inferirla desde el cargo; si no se puede, advertir sin bloquear.
export function validarDatosParaGeneracion(
  empresa: EmpresaCompleta,
  decisorCargo: string
): ResultadoValidacion {
  const camposFaltantes: string[] = [];

  // ── Campos críticos de empresa ────────────────────────────────────────
  // Si los tres están vacíos, no hay research real — solo el nombre
  const tieneDescripcion      = !!empresa.descripcion_ia?.trim();
  const tieneBusquedaRaw      = !!(empresa as { busqueda_web_raw?: unknown }).busqueda_web_raw;
  const tieneBusquedaAnalisis = !!(empresa as { busqueda_web_analisis?: unknown }).busqueda_web_analisis;

  if (!tieneDescripcion && !tieneBusquedaRaw && !tieneBusquedaAnalisis) {
    camposFaltantes.push("descripcion_ia", "busqueda_web_raw", "busqueda_web_analisis");
  }

  // ── Campo crítico de contacto ─────────────────────────────────────────
  if (!decisorCargo?.trim()) {
    camposFaltantes.push("contacto.cargo");
  }

  if (camposFaltantes.length > 0) {
    return {
      ok: false,
      error: "datos_insuficientes",
      mensaje: "No se puede generar un borrador confiable para este contacto.",
      campos_faltantes: camposFaltantes,
      accion_recomendada:
        "Ejecutar 'Investigar' para esta empresa antes de generar borradores.",
    };
  }

  // ── Inferencia no bloqueante de área ──────────────────────────────────
  const advertencias: string[] = [];
  let actualizarContacto: (ResultadoValidacion & { ok: true })["actualizarContacto"];

  const contacto = empresa.contactos.find(
    (c) => c.cargo?.toLowerCase() === decisorCargo.toLowerCase()
  );

  if (contacto && (!contacto.area || contacto.area === "otro")) {
    const { area, inferido } = inferirArea(decisorCargo);
    if (inferido && area !== "otro") {
      // Inferencia confiable: proponer actualización en DB
      actualizarContacto = {
        id: contacto.id,
        area,
        agregarNota: "[ÁREA INFERIDA AUTOMÁTICAMENTE - validar manualmente]",
      };
      advertencias.push(
        `Área del contacto inferida como "${area}" desde el cargo. Verificar antes de enviar.`
      );
    } else {
      // No se puede inferir: borrador se generará sin contexto de área
      advertencias.push(
        "Área del contacto no identificada. El borrador usa contexto genérico para este cargo. Verificar antes de enviar."
      );
    }
  }

  return { ok: true, advertencias, actualizarContacto };
}

/*
 * ─── Escenarios de referencia (los 3 casos del gate) ──────────────────────
 *
 * ESCENARIO 1 — Bloqueo total (empresa recién agregada sin Investigar):
 *   empresa.descripcion_ia  = null
 *   empresa.busqueda_web_raw    = null
 *   empresa.busqueda_web_analisis = null
 *   → ok: false, campos_faltantes: ["descripcion_ia", "busqueda_web_raw", "busqueda_web_analisis"]
 *   → El frontend muestra aviso amber; NO genera borrador; botón "Reintentar si ya investigaste"
 *
 * ESCENARIO 2 — Paso con inferencia de área:
 *   empresa.descripcion_ia = "UPC fabrica envases termoformados..."   (tiene research)
 *   contacto = { cargo: "Analista de Aseguramiento de la Calidad", area: null }
 *   → ok: true, advertencias: ["Área del contacto inferida como 'calidad'..."]
 *   → actualizarContacto: { id: "...", area: "calidad", agregarNota: "[ÁREA INFERIDA...]" }
 *   → El borrador se genera; banner amber advierte al vendedor
 *
 * ESCENARIO 3 — Paso limpio:
 *   empresa.descripcion_ia = "..."  (tiene research)
 *   contacto = { cargo: "Jefe de Calidad", area: "calidad" }
 *   → ok: true, advertencias: []
 *   → El borrador se genera normalmente, sin advertencias
 * ──────────────────────────────────────────────────────────────────────────
 */

/*
 * ─── Query de diagnóstico (no es código de producción) ────────────────────
 *
 * Empresas que quedarían BLOQUEADAS por el gate (sin research):
 *
 *   SELECT e.id, e.nombre, e.estado, COUNT(c.id) AS contactos_count
 *   FROM empresas e
 *   LEFT JOIN contactos c ON c.empresa_id = e.id
 *   WHERE e.descripcion_ia IS NULL
 *     AND e.busqueda_web_raw IS NULL
 *     AND e.busqueda_web_analisis IS NULL
 *     AND e.estado NOT IN ('perdido', 'ganado')
 *   GROUP BY e.id, e.nombre, e.estado
 *   ORDER BY e.score_prioridad DESC;
 *
 * Contactos sin cargo (bloquearían el gate por campo crítico vacío):
 *
 *   SELECT c.id, c.nombre, c.cargo, c.area, e.nombre AS empresa
 *   FROM contactos c
 *   JOIN empresas e ON e.id = c.empresa_id
 *   WHERE c.cargo IS NULL OR c.cargo = ''
 *   ORDER BY e.nombre;
 * ──────────────────────────────────────────────────────────────────────────
 */
