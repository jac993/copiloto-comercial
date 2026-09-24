# Funcionalidades de Copiloto Comercial Industrial

CRM de uso personal para un vendedor B2B de etiquetas autoadhesivas e imprenta industrial en Chile. Stack: Next.js 14 (App Router), TypeScript, Supabase (Postgres + Storage), Anthropic Claude, Perplexity, AssemblyAI, Gmail OAuth. Deploy en Vercel.

---

## 🎯 Módulos Principales

### Hoy (`/`)
Pantalla de entrada diaria. Muestra métricas del día, racha de contactos, prioridades sugeridas por IA (top-5 cuentas a contactar), tareas vencidas de días anteriores, tarjetas de reactivación de negocios perdidos con fecha vencida, y el diálogo "Reportar mi día" para coaching de cierre de jornada.
- Ruta: `/` — `app/page.tsx` → `components/hoy/hoy-client.tsx`

### Cuentas (`/cuentas`)
Pipeline tipo kanban con drag & drop entre estados (prospecto → contactado → en conversación → reunión agendada → cotizado → ganado/perdido). Distingue empresas "completas" (investigadas por IA) de "prospectos ligeros" (alta rápida sin IA, solo nombre + URL).
- Ruta: `/cuentas` — `app/cuentas/page.tsx`

### Ficha de empresa (`/cuentas/[id]`)
La pantalla más importante del producto. Muestra la ficha generada por IA, los 6 decisores estándar del rubro, tablero MEDDIC, historial completo de interacciones, chat contextual con la IA sobre esa empresa, generación de borradores de mensajes por canal, búsqueda web adicional y correos de Gmail detectados.
- Ruta: `/cuentas/[id]` — `app/cuentas/[id]/page.tsx`

### Panorama (`/panorama`)
Vista consolidada de todos los prospectos activos con semáforo (rojo/amarillo/verde) según días sin contacto y reglas de enfriamiento por etapa del pipeline.
- Ruta: `/panorama` — `app/panorama/page.tsx`

### Alertas (`/alertas`)
Lista global de interacciones sin respuesta hace más de 48 horas, agrupadas por empresa, con sugerencia de siguiente touch según la cadencia heurística.
- Ruta: `/alertas` — `app/alertas/page.tsx`

### Casos (`/casos`)
Base de referencia de casos reales de la empresa (One Label) que la IA usa para no inventar ejemplos al redactar mensajes o dar coaching.
- Ruta: `/casos` — `app/casos/page.tsx`

### Configuración (`/configuracion`)
Conexión/sincronización/desconexión de Gmail, gestión de casos de éxito y panel de costos y uso de APIs externas.
- Ruta: `/configuracion` — `app/configuracion/page.tsx`

### Rendimiento (`/rendimiento`)
Métricas ejecutivas acumuladas, cumplimiento de tareas, montos de pipeline y evaluaciones semanales generadas por IA.
- Ruta: `/rendimiento` — `app/rendimiento/page.tsx`

---

## 📊 Por cada módulo

### Hoy
- **Inputs:** ninguno manual (todo se calcula); acciones de un clic (Hecho / No realizada / Reportar mi día).
- **Outputs:** top-5 prioridades con razón y acción sugerida, métricas del día, racha, tareas vencidas.
- **Integraciones externas:** Anthropic Claude (priorización, coaching de misión).
- **Datos guardados en BD:** `prioridades_diarias`, `metricas_diarias`, `misiones_diarias`, `rendimiento_ejecutivo`.

### Cuentas (pipeline)
- **Inputs:** drag & drop de tarjetas entre columnas de estado; alta de prospecto ligero (nombre + URL opcional).
- **Outputs:** tablero visual del pipeline con conteos e indicadores de días sin contacto.
- **Integraciones externas:** ninguna (operación pura sobre BD).
- **Datos guardados en BD:** `empresas.estado`, `empresas.estado_desde`, `empresas` (alta de prospectos ligeros).

### Ficha de empresa
- **Inputs:** URL de la empresa (para investigar), audio de llamada (para transcribir), clics de aprobación/generación por tab.
- **Outputs:** ficha comercial completa, decisores, tablero MEDDIC, historial de interacciones, borradores de mensajes, resultados de búsqueda web, correos relacionados.
- **Integraciones externas:** Anthropic Claude, Perplexity, scraping propio, AssemblyAI, Gmail.
- **Datos guardados en BD:** `empresas` (incluye `ficha_ia`, `meddic`, `notas_vendedor`, `busqueda_web_*`), `contactos`, `interacciones`, `chat_empresa`, `borradores`, `senales`, `correos_detectados`.

### Panorama
- **Inputs:** ninguno (vista de solo lectura).
- **Outputs:** semáforo de estado por empresa, días sin contacto, historial acumulado.
- **Integraciones externas:** ninguna.
- **Datos guardados en BD:** solo lectura de `empresas`, `interacciones`, `cadencia_asignaciones`, `cadencias`, `contactos`.

### Alertas
- **Inputs:** botones "Sí contestó" / "No contestó" por interacción.
- **Outputs:** lista de conversaciones estancadas con sugerencia de siguiente canal.
- **Integraciones externas:** ninguna (cálculo local con `lib/cadencia.ts`).
- **Datos guardados en BD:** `interacciones` (actualización de estado).

### Casos
- **Inputs:** formulario manual de alta/edición de caso (sector, problema, solución, resultado, objeción vencida, técnica de venta).
- **Outputs:** listado de casos activos usados como contexto en los prompts de IA.
- **Integraciones externas:** ninguna.
- **Datos guardados en BD:** `casos`.

### Configuración
- **Inputs:** clic "Conectar Gmail" (OAuth), clic "Sincronizar ahora".
- **Outputs:** estado de conexión Gmail, resumen de costos de uso de APIs.
- **Integraciones externas:** Gmail OAuth (Google).
- **Datos guardados en BD:** `integraciones`, lectura de `api_usage`.

### Rendimiento
- **Inputs:** botón "Evaluar semana".
- **Outputs:** evaluación semanal con fortalezas, áreas de mejora y recomendaciones.
- **Integraciones externas:** Anthropic Claude.
- **Datos guardados en BD:** `evaluaciones_semanales`, `rendimiento_ejecutivo`.

---

## 🔌 APIs externas usadas

- **Anthropic Claude** (`@anthropic-ai/sdk`, var `ANTHROPIC_API_KEY`): motor de todo el copiloto — investigación de empresas, generación de decisores, análisis de interacciones y coaching, priorización diaria, generación de borradores de mensajes, chat contextual, evaluación semanal. Modelo `claude-sonnet-4-6` para tareas complejas (investigar, análisis profundo) y `claude-haiku-4-5-20251001` para tareas rápidas/económicas (priorizar, preparación de mensajes, feedback de misión).
- **Perplexity** (fetch directo a `api.perplexity.ai`, var `PERPLEXITY_API_KEY` — **no documentada en `.env.local.example`**): búsqueda web complementaria al scraping propio para investigar empresas y encontrar decisores reales.
- **AssemblyAI** (paquete `assemblyai`, var `ASSEMBLYAI_API_KEY`): transcripción de audios de llamadas subidos a Supabase Storage. Nota: `.env.local.example` documenta `OPENAI_API_KEY`/Whisper pero el código real usa AssemblyAI — ese archivo está desactualizado.
- **Gmail / Google OAuth** (`lib/gmail.ts`, vars `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL` — tampoco documentadas en `.env.local.example`): conexión de la cuenta de correo del vendedor para detectar automáticamente correos cruzados con empresas del pipeline.
- **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`): base de datos Postgres, autenticación y Storage (audios de llamadas).
- **Scraping propio** (`lib/scraper.ts`, sin API key): lee el sitio web de la empresa y subrutas comunes (`/nosotros`, `/productos`, etc.) como insumo para la ficha IA.

---

## 📋 Flujos principales

**Investigar una empresa:** el vendedor pega la URL en la ficha y aprieta "Investigar" → se dispara scraping del sitio + búsqueda en Perplexity en paralelo → una llamada a Claude con `PROMPT_INVESTIGADOR` genera la ficha completa; los 6 decisores estándar del rubro se agregan de forma determinística (no dependen de que la IA los invente) → todo se guarda en `empresas.ficha_ia`.

**Agregar contactos:** se agregan manualmente vía `/api/contactos`, o se generan como sugerencias no verificadas durante la investigación/búsqueda web (quedan marcados como no verificados hasta que el vendedor los confirma).

**Crear tareas/seguimiento:** cada interacción registrada (llamada, email, WhatsApp, LinkedIn) puede analizarse con IA (`PROMPT_COACH_ESCRITO`), lo que genera automáticamente un `proximo_paso` con canal y fecha sugerida; ese próximo paso alimenta las prioridades del día siguiente.

**Usar cadencias de outreach:** el vendedor asigna una plantilla de cadencia (ej. "Frío estándar", "Post-cotización", "Reactivación") a una empresa+contacto. Se crea solo la primera tarea ejecutable; al completarla, el sistema recalcula qué canales están disponibles para ese contacto y resuelve el siguiente paso con cascada de fallback — sin usar IA. Si el prospecto responde, la cadencia se cierra automáticamente.

**Priorización diaria:** al abrir "Hoy", si no existen prioridades generadas para el día (y es día hábil), se dispara automáticamente una sola vez `POST /api/priorizar`, que evalúa hasta 20 empresas activas y devuelve un top-5 con razón, acción sugerida y urgencia. El vendedor marca cada una como "Hecho" o "No realizada"; las pendientes reaparecen al día siguiente en "Vencidas".

**Transcribir y analizar una llamada:** el vendedor sube el archivo de audio y aprieta "Transcribir" (AssemblyAI) → puede leer la transcripción cruda sin costo adicional → si quiere coaching, aprieta "Analizar" por separado, lo que dispara Claude con `PROMPT_COACH_ESCRITO`.

---

## ⚡ Acciones que cuestan dinero

Todas requieren un clic explícito del usuario (regla de oro del producto: nada se dispara automáticamente salvo la única excepción documentada abajo).

| Acción | Ruta | Servicio |
|---|---|---|
| Investigar empresa | `POST /api/investigar` | Claude + Perplexity + scraping |
| Regenerar ficha (campos o completa) | `/api/investigar/regenerar`, `/api/empresas/[id]/regenerar` | Claude + Perplexity |
| Regenerar decisores | `/api/empresas/[id]/regenerar-decisores` | Claude + Perplexity |
| Buscar información web adicional | `/api/empresas/[id]/buscar-web` | Claude + Perplexity |
| Analizar conversación completa | `/api/empresas/[id]/analizar-todo` | Claude |
| Chat con la IA sobre una empresa | `/api/empresas/[id]/chat` (POST) | Claude |
| Analizar una interacción (coaching) | `/api/analizar-interaccion`, `/api/interacciones/[id]/analizar` | Claude |
| Generar borrador de mensaje | `/api/preparacion` | Claude |
| Actualizar prioridades del día | `/api/priorizar` | Claude |
| Evaluar semana | `/api/rendimiento/evaluar` | Claude |
| Reportar mi día (feedback de misión) | `/api/misiones/feedback` | Claude |
| Transcribir audio de llamada | `/api/transcribir` | AssemblyAI |

**Excepción automática documentada:** al abrir la pantalla "Hoy" en día hábil, si las prioridades cacheadas no son de hoy, se dispara UNA sola llamada a `POST /api/priorizar` al montar (máximo una vez por día, con doble guarda en `localStorage` y en `prioridades_diarias`/`metricas_diarias.prioridades_generadas_en`). Mientras corre se muestra el skeleton "Preparando tu día...". Si ya existen prioridades de hoy, se cargan desde caché sin gastar créditos.

Todo lo demás (cambiar estado en el kanban, guardar notas, asignar/cerrar cadencias, marcar tareas, editar contactos, sincronizar Gmail, guardar casos) es CRUD directo sobre Supabase, sin costo de IA.
