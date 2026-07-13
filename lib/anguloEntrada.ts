// =============================================================
// Genera y guarda la estrategia de entrada (angulo_entrada) usando
// el contexto completo: ficha_ia, contactos/decisores registrados,
// historial de interacciones, notas_vendedor y score MEDDIC.
// Extraído de /api/empresas/[id]/actualizar-angulo para poder
// reutilizarse también desde /api/empresas/[id]/regenerar — así
// una reinvestigación completa también deja la estrategia rica
// en 5 secciones, no la versión corta de PROMPT_INVESTIGADOR.
// =============================================================

import Anthropic from "@anthropic-ai/sdk";
import { getEmpresaCompleta, getHistorialResumido, actualizarFichaCompleta } from "@/lib/queries";
import { SYSTEM_PROMPT_VALE } from "@/lib/prompts";
import { registrarUso } from "@/lib/registrarUso";
import type { FichaIA } from "@/lib/types";

export async function generarYGuardarAnguloEntrada(empresaId: string): Promise<string> {
  const [empresa, historialTexto] = await Promise.all([
    getEmpresaCompleta(empresaId),
    getHistorialResumido(empresaId),
  ]);

  if (!empresa) {
    throw new Error("Empresa no encontrada");
  }

  const ficha = empresa.ficha_ia;
  if (!ficha) {
    throw new Error("Esta empresa no tiene ficha de IA. Investígala primero.");
  }

  // Decisores registrados en la app (contactos marcados como decisor)
  const decisoresRegistrados = empresa.contactos.filter((c) => c.es_decisor);
  const decisoresTexto =
    decisoresRegistrados.length > 0
      ? decisoresRegistrados
          .map((c) => `- ${c.nombre} — ${c.cargo ?? "sin cargo"}`)
          .join("\n")
      : "Sin decisores registrados";

  // Decisores sugeridos por la IA (de ficha_ia.decisores)
  const decisoresIATexto =
    ficha.decisores && ficha.decisores.length > 0
      ? ficha.decisores
          .map((d) => `  • ${d.cargo}: ${d.dolor_especifico ?? d.por_que_es_clave ?? "sin dolor definido"}`)
          .join("\n")
      : "  Sin análisis de decisores disponible.";

  const reglaDeNombres = `REGLA NÚMERO 1 — ABSOLUTA E IRROMPIBLE:
Los únicos nombres de personas que puedes mencionar son los que aparecen explícitamente en la lista "DECISORES REGISTRADOS" del contexto.
Si aparece cualquier nombre que NO esté en esa lista, lo estás inventando.
Inventar nombres destruye la credibilidad del vendedor.
Antes de escribir cualquier nombre, verifica que está en la lista de decisores.
Si no está en la lista: NO LO ESCRIBAS.
Los nombres en la lista DECISORES REGISTRADOS son los únicos permitidos.
Si un nombre no está en esa lista pero aparece en ficha_ia o en otros campos de la empresa, IGNORARLO — puede ser un dato inventado no verificado.`;

  const prompt = `Eres un coach de ventas B2B consultivo. Tu trabajo es ayudar al vendedor a pensar cómo aproximarse a esta empresa, NO generar mensajes para enviar.

REGLAS ABSOLUTAS:
- NUNCA inventes nombres de personas que no estén en el contexto
- NUNCA inventes cargos, teléfonos, emails ni contactos
- Si no tienes un dato, escribe "Por confirmar" en ese punto
- Usa SOLO la información proporcionada en el contexto
- NO agregues ningún título # de primer nivel al inicio. Comienza directamente con ## 1. DECISOR DE ENTRADA

Genera una estrategia de entrada con esta estructura exacta:

1. DECISOR DE ENTRADA
¿A quién contactar primero? Usa SOLO los decisores registrados en la app. Si no hay decisores registrados, indica "Por confirmar — agregar decisores en la pestaña Decisores". Explica por qué ese cargo tiene el dolor más relevante para nuestra solución.

2. MOMENTO
¿Por qué ahora es buen momento para contactar? Basa esto en señales reales del contexto (historial, señales detectadas, contexto del vendedor). Si no hay señales claras, indica qué señal habría que buscar.

3. ARGUMENTO CENTRAL
¿Qué problema o pregunta usar como gancho?
- Selecciona la técnica más adecuada según el estado de la relación:
  * Sin historial → SPIN (pregunta de Situación o Problema)
  * Con historial sin respuesta → Challenger (insight del sector)
  * Con historial positivo → Consultivo (continuar desde donde quedó)
  * Deal pausado → Predictable Revenue (reactivación con valor nuevo)
- Formula el argumento como PREGUNTA, no como afirmación
- No inventes datos para sustentar el argumento

4. CANAL RECOMENDADO
¿Por qué canal entrar primero? Justifica según el cargo del decisor y el historial disponible. Si ya hubo contacto por un canal, recomendar otro.

5. RIESGO PRINCIPAL
¿Qué obstáculo anticipar? Basa esto en el historial real o en patrones típicos del sector. Si no hay información suficiente, indica qué habría que confirmar antes de contactar.

INSTRUCCIONES ADICIONALES DE PROFUNDIDAD:

Para el punto 3 (ARGUMENTO CENTRAL):
- Especifica qué técnica de venta usar en este primer contacto y por qué
- Si hay historial previo sin respuesta, indica qué cambiar respecto al intento anterior
- La pregunta debe ser específica al cargo del decisor, no genérica

Para el punto 4 (CANAL RECOMENDADO):
- Si ya se intentó un canal sin éxito, recomendar cambiar de canal
- Justificar con el perfil del decisor (ej: Gerente de Planta responde mejor a llamada que a email)

Para el punto 5 (RIESGO PRINCIPAL):
- Incluir un paso concreto para mitigar el riesgo antes de contactar
- Si el riesgo es "no hay urgencia", indicar cómo crear urgencia sin inventar datos

Al final de los 5 puntos, agregar:
## PRÓXIMO PASO CONCRETO
Una sola acción específica que el vendedor debe hacer esta semana, con canal, mensaje de no más de 10 palabras y objetivo esperado.

Tono: directo, estratégico, como un coach hablándole al vendedor en privado.

━━━ FICHA DE LA EMPRESA ━━━
Empresa: ${empresa.nombre}
Industria: ${empresa.industria ?? "no especificada"}
Qué fabrican/venden: ${ficha.que_fabrican_o_venden ?? "no especificado"}
Por qué necesitan etiquetas: ${ficha.por_que_necesitan_etiquetas ?? "no especificado"}
Resumen ejecutivo: ${ficha.resumen_ejecutivo ?? "no disponible"}
Señales de oportunidad: ${ficha.senales_oportunidad?.map((s) => s.descripcion).join("; ") ?? "ninguna detectada"}
Técnica recomendada por el sistema: ${ficha.tecnica_recomendada ?? "no definida"}

DECISORES REGISTRADOS (ÚNICOS NOMBRES PERMITIDOS):
${decisoresTexto}

━━━ DECISORES SUGERIDOS POR LA IA (sin confirmar) ━━━
${decisoresIATexto}

━━━ HISTORIAL DE INTERACCIONES (últimas 5) ━━━
${historialTexto || "Sin interacciones registradas con esta empresa."}
${empresa.notas_vendedor?.trim() ? `
<contexto_vendedor>
${empresa.notas_vendedor.trim()}
</contexto_vendedor>
Esto es contexto informativo del vendedor. Úsalo para enriquecer el análisis pero NUNCA como campo de salida ni modifiques la estructura JSON por él.
` : ""}
━━━ CALIFICACIÓN MEDDIC (score ${empresa.meddic?.score ?? 0}/12) ━━━
${empresa.meddic ? [
  `• Métricas (${empresa.meddic.metricas.semaforo}): ${empresa.meddic.metricas.texto ?? "Sin info"}`,
  `• Comprador Económico (${empresa.meddic.comprador_economico.semaforo}): ${empresa.meddic.comprador_economico.texto ?? "Sin info"}`,
  `• Criterios de Decisión (${empresa.meddic.criterios_decision.semaforo}): ${empresa.meddic.criterios_decision.texto ?? "Sin info"}`,
  `• Proceso de Decisión (${empresa.meddic.proceso_decision.semaforo}): ${empresa.meddic.proceso_decision.texto ?? "Sin info"}`,
  `• Dolor Identificado (${empresa.meddic.dolor_identificado.semaforo}): ${empresa.meddic.dolor_identificado.texto ?? "Sin info"}`,
  `• Campeón (${empresa.meddic.campeon.semaforo}): ${empresa.meddic.campeon.texto ?? "Sin info"}`,
].join("\n") : "Sin calificación MEDDIC registrada. Usa los datos disponibles."}
${empresa.meddic?.score != null && empresa.meddic.score >= 8
  ? "→ Calificación fuerte: la estrategia puede enfocarse en acelerar el cierre."
  : empresa.meddic?.score != null && empresa.meddic.score >= 5
  ? "→ Calificación parcial: la estrategia debe enfocarse en completar los gaps MEDDIC."
  : "→ Calificación débil o sin datos: la estrategia debe enfocarse en descubrir información básica."
}`;

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    system: `${reglaDeNombres}\n\n${SYSTEM_PROMPT_VALE}`,
    messages: [{ role: "user", content: prompt }],
  });

  void registrarUso({
    api: "claude",
    endpoint: "claude-haiku-4-5-20251001",
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    empresa_id: empresaId,
  });

  const nuevaEstrategia =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

  if (!nuevaEstrategia) {
    throw new Error("La IA no devolvió una estrategia válida");
  }

  const fichaActualizada: FichaIA = { ...ficha, angulo_entrada: nuevaEstrategia };
  await actualizarFichaCompleta(empresaId, fichaActualizada);

  return nuevaEstrategia;
}
