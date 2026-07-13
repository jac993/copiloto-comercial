// =============================================================
// Lógica de cadencia de seguimiento (secuencias multi-touch).
// Función PURA calculada — no requiere columnas nuevas en la BD.
//
// Un "touch" = un mensaje saliente del vendedor por un canal real
// (whatsapp/correo/linkedin/llamada). La racha se reinicia con
// cualquier señal de engagement: respuesta del prospecto,
// sentimiento positivo o una reunión.
//
// Reglas de cadencia (en DÍAS HÁBILES, lun-vie):
//  - Touch 1 sin respuesta ≥3 días → sugerir touch 2 por otro canal
//  - Touch 2 sin respuesta ≥4 días → sugerir touch 3 por otro canal
//  - Touch 3 sin respuesta         → sugerir pausar + reactivar 30 días
//  - Rotación: preferir un canal no usado; si todos usados, uno
//    distinto del último.
//
// Este módulo NO importa de lib/types para evitar ciclos (types.ts
// importa el tipo Cadencia desde aquí para InteraccionVencida).
// =============================================================

export type CanalCadencia = "whatsapp" | "correo" | "linkedin" | "llamada";

export type AccionCadencia = "esperar" | "siguiente_touch" | "pausar";

// Forma mínima que necesita el cálculo — Interaccion la satisface estructuralmente
export interface InteraccionCadencia {
  tipo: string;
  fecha: string;
  remitente?: string | null;
  sentimiento?: string | null;
  contacto_id?: string | null;
  // Para excluir tareas de cadencia pendientes del cálculo de touches:
  // son recordatorios de "enviar", no intentos salientes reales.
  cadencia_asignacion_id?: string | null;
  resuelta?: boolean | null;
}

export interface Cadencia {
  touch: number;                    // nº de intentos salientes sin respuesta en la racha actual
  totalTouches: number;             // umbral máximo de la secuencia (3)
  canalesUsados: CanalCadencia[];   // canales ya usados en la racha, en orden
  ultimoCanal: CanalCadencia | null;
  diasHabilesDesdeUltimo: number | null;
  canalSugerido: CanalCadencia | null;
  canalSugeridoLabel: string | null;
  accion: AccionCadencia;
  listoParaSiguiente: boolean;      // true si ya se cumplió el umbral de días para el siguiente touch
  resumen: string;                  // frase lista para prompt / UI
}

const MAX_TOUCHES = 3;
const DIAS_TOUCH_1 = 3; // días hábiles antes de sugerir el touch 2
const DIAS_TOUCH_2 = 4; // días hábiles antes de sugerir el touch 3
const DIAS_REACTIVACION = 30;

// Orden de preferencia para rotar de canal
const ORDEN_CANALES: CanalCadencia[] = ["whatsapp", "correo", "linkedin", "llamada"];

const CANAL_LABEL: Record<CanalCadencia, string> = {
  whatsapp: "WhatsApp",
  correo:   "Correo",
  linkedin: "LinkedIn",
  llamada:  "Llamada",
};

// interacciones.tipo → canal de cadencia. null = no es un touch de canal
// (reunion, sin_respuesta, etc. no cuentan como intento saliente).
function tipoACanal(tipo: string): CanalCadencia | null {
  switch (tipo) {
    case "whatsapp": return "whatsapp";
    case "email":    return "correo";
    case "linkedin": return "linkedin";
    case "llamada":  return "llamada";
    default:         return null;
  }
}

// Cuenta días hábiles (excluye sábado y domingo) entre dos fechas
function diasHabilesEntre(desde: Date, hasta: Date): number {
  const ini = new Date(desde); ini.setHours(0, 0, 0, 0);
  const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
  if (fin <= ini) return 0;
  let count = 0;
  const cur = new Date(ini);
  while (cur < fin) {
    cur.setDate(cur.getDate() + 1);
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
  }
  return count;
}

export function calcularCadencia(
  interacciones: InteraccionCadencia[],
  contactoId?: string | null
): Cadencia | null {
  const rel = (contactoId
    ? interacciones.filter((i) => i.contacto_id === contactoId)
    : interacciones
  )
    .slice()
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  if (rel.length === 0) return null;

  // Último evento de engagement → reinicia la racha (lo posterior es la secuencia activa)
  let inicioRacha = 0;
  for (let i = 0; i < rel.length; i++) {
    const it = rel[i];
    const esEngagement =
      it.remitente === "prospecto" ||
      it.sentimiento === "positivo" ||
      it.tipo === "reunion";
    if (esEngagement) inicioRacha = i + 1;
  }

  const racha = rel.slice(inicioRacha);

  // Touches = mensajes salientes del vendedor por un canal real. Se excluyen
  // las tareas de cadencia pendientes (recordatorios de enviar, aún no
  // ejecutados): no son intentos salientes y contaminarían el conteo.
  const touches = racha.filter(
    (i) =>
      (i.remitente ?? "vendedor") === "vendedor" &&
      tipoACanal(i.tipo) !== null &&
      !(i.cadencia_asignacion_id && i.resuelta === false)
  );

  if (touches.length === 0) return null; // no hay intentos pendientes de respuesta

  const canalesUsados = touches
    .map((t) => tipoACanal(t.tipo))
    .filter((c): c is CanalCadencia => c !== null);

  const ultimoTouch = touches[touches.length - 1];
  const ultimoCanal = tipoACanal(ultimoTouch.tipo);
  const diasHabiles = diasHabilesEntre(new Date(ultimoTouch.fecha), new Date());
  const touch = touches.length;

  // Canal sugerido: primero no usado; si todos usados, primero distinto del último
  const noUsados = ORDEN_CANALES.filter((c) => !canalesUsados.includes(c));
  const canalSugerido =
    noUsados[0] ?? ORDEN_CANALES.find((c) => c !== ultimoCanal) ?? null;

  // Acción según touch + días hábiles transcurridos
  let accion: AccionCadencia;
  let listoParaSiguiente = false;
  if (touch >= MAX_TOUCHES) {
    accion = "pausar";
  } else {
    const umbral = touch === 1 ? DIAS_TOUCH_1 : DIAS_TOUCH_2;
    if (diasHabiles >= umbral) {
      accion = "siguiente_touch";
      listoParaSiguiente = true;
    } else {
      accion = "esperar";
    }
  }

  const usadosLabel = canalesUsados.length
    ? canalesUsados.map((c) => CANAL_LABEL[c]).join(", ")
    : "ninguno";
  const sugLabel = canalSugerido ? CANAL_LABEL[canalSugerido] : null;

  let resumen: string;
  if (accion === "pausar") {
    resumen = `Touch ${touch} de ${MAX_TOUCHES} sin respuesta (ya probaste ${usadosLabel}). Se sugiere pausar la secuencia y reactivar en ${DIAS_REACTIVACION} días.`;
  } else if (accion === "siguiente_touch") {
    resumen = `Vas en el touch ${touch} de ${MAX_TOUCHES} (ya probaste ${usadosLabel} sin respuesta). Toca el siguiente intento — canal sugerido: ${sugLabel ?? "otro canal"}.`;
  } else {
    resumen = `Touch ${touch} de ${MAX_TOUCHES} enviado por ${ultimoCanal ? CANAL_LABEL[ultimoCanal] : "—"} hace ${diasHabiles} día(s) hábil(es). Aún dentro del plazo de espera; si no responde, el siguiente será por ${sugLabel ?? "otro canal"}.`;
  }

  return {
    touch,
    totalTouches: MAX_TOUCHES,
    canalesUsados,
    ultimoCanal,
    diasHabilesDesdeUltimo: diasHabiles,
    canalSugerido,
    canalSugeridoLabel: sugLabel,
    accion,
    listoParaSiguiente,
    resumen,
  };
}

export { CANAL_LABEL as CANAL_CADENCIA_LABEL };
