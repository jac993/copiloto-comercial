// =============================================================
// Utilidades de parseo JSON compartidas entre rutas de servidor.
// Usadas en /api/investigar y /api/empresas/[id]/regenerar-decisores.
// =============================================================

// Limpia texto externo antes de inyectarlo en prompts de Claude.
// Evita que caracteres de control o comillas rompan el JSON de respuesta.
export function sanitizarTexto(texto: string, maxChars = 3000): string {
  return texto
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")   // control chars (sin \t \n \r)
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\t/g, " ")
    .replace(/"/g, "'")
    .replace(/\\/g, "/")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")                // fuera de ASCII imprimible + latin-1
    .slice(0, maxChars)
    .trim();
}

// Extrae un objeto JSON de la respuesta de Claude con 4 intentos progresivos.
// Devuelve null si todos fallan — el caller decide el fallback.
export function extraerJsonSeguro<T>(texto: string): T | null {
  // Intento 1: parse directo
  console.log('[JSON_PARSER_INTENTO1] largo:', texto.length, 'inicio:', texto.substring(0, 50))
  try { return JSON.parse(texto) as T; } catch {}

  // Intento 2: bloque markdown ```json ... ```
  const mdMatch = texto.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const extraido = mdMatch?.[1];
  console.log('[JSON_PARSER_INTENTO2]', extraido?.substring(0, 200))
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1]) as T; } catch {}
  }

  // Intento 3: primer objeto { ... } del texto
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]) as T; } catch {}

    // Intento 4: limpiar el bloque extraído y reintentar
    try {
      let limpio = jsonMatch[0]
        .replace(/[\x00-\x1F]/g, " ")           // todos los control chars → espacio
        .replace(/,(\s*[}\]])/g, "$1")           // comas finales antes de } o ]
        .replace(/([{,]\s*)(\w+)(\s*):/g, '$1"$2"$3:'); // claves sin comillas → con comillas
      limpio = limpio.replace(/:\s*"([^"]*)"/g, (_, v) =>
        ': "' + v.replace(/\n/g, ' ').replace(/\r/g, '') + '"');
      return JSON.parse(limpio) as T;
    } catch {}
  }

  console.error('[JSON_PARSE_FAIL] Raw Claude output:', texto.substring(0, 500));
  return null;
}
