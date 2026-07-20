// =============================================================
// Formato de montos en pesos chilenos (CLP). Sin decimales:
// el CLP no usa centavos en la práctica comercial.
// =============================================================

/** $1.500.000 — separador de miles chileno, para cards y detalle. */
export function formatCLP(monto: number): string {
  return "$" + Math.round(monto).toLocaleString("es-CL");
}

/**
 * Versión compacta para espacios chicos (cabeceras de columna kanban):
 * $850K · $1,5M · $12M. Bajo 1.000 se muestra completo.
 */
export function formatCLPCompacto(monto: number): string {
  const n = Math.round(monto);
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    // 1 decimal solo cuando aporta ($1,5M sí; $12,0M no)
    const texto = m >= 10 || Number.isInteger(m)
      ? String(Math.round(m))
      : m.toFixed(1).replace(".", ",");
    return `$${texto}M`;
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return formatCLP(n);
}

// Rangos rápidos del dialog de captura al pasar a "cotizado".
// Se guarda el punto medio del rango como entero CLP (valores
// confirmados por el usuario).
export const RANGOS_MONTO: { label: string; valor: number }[] = [
  { label: "Menos de $500 mil", valor: 250_000 },
  { label: "$500 mil – $2 millones", valor: 1_250_000 },
  { label: "$2 – $5 millones", valor: 3_500_000 },
  { label: "$5 – $15 millones", valor: 10_000_000 },
  { label: "Más de $15 millones", valor: 20_000_000 },
];
