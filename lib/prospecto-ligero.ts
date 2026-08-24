// =============================================================
// Razones de descarte de un prospecto ligero ("Por calificar").
//
// Vive en lib/ porque las necesitan dos pantallas: el dialog de
// prospecto-ligero-detail (para elegir) y la sub-vista "Perdidos" de
// cuentas-client (para mostrar la razón en cada tarjeta).
//
// Se guarda el `value` (slug) en empresas.prospecto_ligero_perdido_razon y se
// muestra el `label`. La columna no tiene check constraint a propósito: agregar
// una razón nueva es editar este array, sin migración.
// =============================================================

export interface RazonPerdidaLigero {
  value: string;
  label: string;
}

// El orden es el de la UI: primero las razones más frecuentes.
export const RAZONES_PERDIDA_LIGERO: RazonPerdidaLigero[] = [
  { value: "no_responde",        label: "No responde" },
  { value: "no_es_icp",          label: "No es mi cliente objetivo" },
  { value: "tiene_proveedor",    label: "Ya tiene proveedor fijo" },
  { value: "muy_pequeno",        label: "Muy pequeño / no rentable" },
  { value: "importa_no_fabrica", label: "Importa, no fabrica en Chile" },
  { value: "otro",               label: "Otro" },
];

// Para validar en el endpoint sin recorrer el array en cada request.
export const SLUGS_PERDIDA_LIGERO = new Set(
  RAZONES_PERDIDA_LIGERO.map((r) => r.value)
);

// Label para mostrar. Si el slug no está en la lista devuelve el slug crudo:
// como la columna no tiene constraint, podría contener una razón vieja o
// escrita a mano, y es mejor mostrarla tal cual que hacerla desaparecer.
export function labelRazonPerdida(slug: string): string {
  return RAZONES_PERDIDA_LIGERO.find((r) => r.value === slug)?.label ?? slug;
}
