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
