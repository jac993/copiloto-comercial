// =============================================================
// Utilidades de fecha para zona horaria de Chile (America/Santiago).
// Vercel corre en UTC — todos los cálculos de "hoy" del servidor
// deben usar estas funciones en lugar de new Date().toISOString().
// Chile: UTC-3 en invierno (abril-septiembre), UTC-4 en verano.
// =============================================================

/** Retorna "YYYY-MM-DD" en la zona horaria de Chile. */
export function hoyCL(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

/**
 * Retorna "YYYY-MM-DDTHH:MM" en hora de Chile.
 * Para inicializar <input type="datetime-local"> con la hora correcta.
 * El locale "sv-SE" produce formato "YYYY-MM-DD HH:MM:SS" — slice(0,16) da "YYYY-MM-DD HH:MM".
 */
export function nowChileLocal(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Santiago" })
    .slice(0, 16)
    .replace(" ", "T");
}

/**
 * Retorna los instantes UTC (ISO) que delimitan un día calendario chileno.
 * Necesario para filtrar columnas timestamptz por "día de Chile": la medianoche
 * chilena cae a las 03:00Z o 04:00Z según horario de verano/invierno.
 * Sin esto, una llamada registrada a las 21:00 hora Chile queda fuera de la
 * ventana UTC del mismo día y los filtros de "hoy" la pierden.
 */
export function rangoDiaChileUTC(fecha: string): { desde: string; hasta: string } {
  // Probar 03:00Z y 04:00Z: la correcta es la que en Chile marca medianoche.
  let desde = new Date(`${fecha}T04:00:00Z`); // UTC-4 (horario de invierno)
  const candidata = new Date(`${fecha}T03:00:00Z`); // UTC-3 (horario de verano)
  const horaChile = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Santiago",
      hour: "numeric",
      hour12: false,
    }).format(candidata)
  );
  if (horaChile === 0 || horaChile === 24) desde = candidata;
  const hasta = new Date(desde.getTime() + 24 * 3600_000);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}
