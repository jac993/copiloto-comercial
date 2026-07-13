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

/** Fecha calendario chilena "YYYY-MM-DD" para un instante epoch (ms). */
function fechaChileDeMs(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

/** true si el instante cae en sábado o domingo en hora de Chile. */
export function esFinDeSemanaChile(ms: number): boolean {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    weekday: "short",
  }).format(new Date(ms));
  return wd === "Sat" || wd === "Sun";
}

/**
 * Suma N días hábiles (lun-vie) a una fecha calendario "YYYY-MM-DD".
 * n=0 retorna la misma fecha, salvo que caiga en fin de semana: en ese
 * caso avanza al lunes siguiente (una tarea nunca debe agendarse en
 * sábado/domingo). Aritmética en UTC mediodía para evitar saltos DST.
 */
export function sumarDiasHabilesDesde(fechaBase: string, n: number): string {
  const d = new Date(fechaBase + "T12:00:00Z");
  let restantes = n;
  while (restantes > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) restantes--;
  }
  // Si la fecha resultante cae en fin de semana (posible cuando n=0), correr al lunes
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().split("T")[0];
}

/**
 * Milisegundos "hábiles" (lun-vie, hora Chile) transcurridos entre dos instantes.
 * El contador de respuesta se congela sábado y domingo y se reanuda el lunes:
 * un mensaje enviado el viernes no acumula tiempo el fin de semana, así no
 * dispara alertas de "sin respuesta" cuando el prospecto simplemente no trabaja.
 * Avanza día calendario chileno por iteración (máx. unos pocos ciclos), por lo
 * que es DST-safe al apoyarse en rangoDiaChileUTC.
 */
export function msRespuestaHabil(desdeMs: number, hastaMs: number): number {
  if (hastaMs <= desdeMs) return 0;
  let total = 0;
  let t = desdeMs;
  while (t < hastaMs) {
    // Fin del día calendario chileno que contiene a t (siguiente medianoche CL).
    const finDiaMs = new Date(rangoDiaChileUTC(fechaChileDeMs(t)).hasta).getTime();
    const segFin = Math.min(finDiaMs, hastaMs);
    if (!esFinDeSemanaChile(t)) total += segFin - t;
    t = segFin;
  }
  return total;
}

/**
 * Resuelve la fecha de seguimiento de una interacción analizada por IA.
 * Cascada con validación — nunca confía ciegamente en la aritmética de fechas
 * del modelo:
 *  1) fecha explícita que mencionó el prospecto (validada: formato YYYY-MM-DD,
 *     no pasada y dentro de un techo de ~3 meses hábiles).
 *  2) inferencia por tono (días hábiles, con clamp defensivo 1..20).
 *  3) fallback a la regla histórica (3 hábiles si hubo compromisos, 7 si no).
 * Devuelve la fecha "YYYY-MM-DD" y el motivo (texto corto o "").
 */
export function resolverFechaSeguimiento(opts: {
  fechaMencionada?: string | null;
  diasHabilesSugeridos?: number | null;
  motivo?: string;
  hayCompromisos: boolean;
}): { fecha: string; motivo: string } {
  const hoy = hoyCL();
  const { fechaMencionada, diasHabilesSugeridos, motivo, hayCompromisos } = opts;
  const motivoLimpio = motivo?.trim() || "";

  // 1) Fecha explícita del prospecto — validada.
  if (
    fechaMencionada &&
    /^\d{4}-\d{2}-\d{2}$/.test(fechaMencionada) &&
    fechaMencionada >= hoy &&                          // no puede ser pasada
    fechaMencionada <= sumarDiasHabilesDesde(hoy, 66)  // techo ~3 meses: descarta años erróneos
  ) {
    return { fecha: fechaMencionada, motivo: motivoLimpio || "Fecha mencionada por el prospecto" };
  }

  // 2) Inferencia por tono — clamp defensivo por si el modelo devuelve algo absurdo.
  if (typeof diasHabilesSugeridos === "number" && Number.isFinite(diasHabilesSugeridos) && diasHabilesSugeridos >= 1) {
    const n = Math.min(Math.max(Math.round(diasHabilesSugeridos), 1), 20);
    return { fecha: sumarDiasHabilesDesde(hoy, n), motivo: motivoLimpio };
  }

  // 3) Fallback histórico.
  return { fecha: sumarDiasHabilesDesde(hoy, hayCompromisos ? 3 : 7), motivo: motivoLimpio };
}
