# Estado de sesión — Copiloto Comercial

Última actualización: sesión de features (21 jul 2026) — enfriamiento, montos,
rediseño Hoy, diferenciación ganado/perdido y prospectos ligeros.
Commits `6bee8ab`–`da5b345`.

---

## Commits de esta sesión (21 jul 2026)

| Hash | Descripción |
|------|-------------|
| `6bee8ab` | feat: días en etapa + alertas de enfriamiento silencioso (sin IA) |
| `a28a36c` | feat: montos en pipeline — valor estimado CLP por oportunidad (sin IA) |
| `2d76daa` | feat: diferenciación visual de ganado/perdido en kanban, lista y ficha |
| `25829f0` | feat: rediseño de Hoy — lista unificada y compacta de tareas |
| `da5b345` | feat: alta rápida de prospectos ligeros ("Por calificar") + promoción al pipeline |

Rama: `main`. Sincronizado con `origin/main`.

### Prospectos ligeros ("Por calificar") — `da5b345`
- **Discriminador:** columna `empresas.tipo_registro` ('ligero' | 'completo',
  default 'completo'). Migración `20260721_tipo_registro.sql` (aditiva).
- **Separación total:** filtro `tipo_registro='completo'` en `getEmpresas`,
  `getEmpresasPriorizadas`, `/api/panorama`, `/api/interacciones/vencidas` y
  `/api/metricas/hoy`. Los ligeros no aparecen en Cuentas, Panorama, priorización
  IA, Hoy ni Alertas.
- **Alta sin IA:** `POST /api/prospectos` (solo nombre + URL opcional).
- **Contactos libres:** reutilizan la tabla `contactos` (`es_decisor=false`),
  CRUD vía `/api/contactos` + `/api/contactos/[id]`. No usan los 6 cargos fijos.
- **Detalle liviano:** `/cuentas/[id]` bifurca por `tipo_registro` →
  `ProspectoLigeroDetail` (header slate, contactos, historial reutilizando
  `TabHistorial`) vs `EmpresaTabs`.
- **Promoción:** botón "⚡ Investigar y pasar a pipeline" → cliente llama
  `regenerar` (investigación IA existente, por id) → `PATCH .../promover`
  (flip a 'completo' + `estado_desde=hoy`, guard 409 si ya está en pipeline).
- **Estado:** el ligero se crea con `estado='prospecto'` (no hay columna
  `etapa_pipeline`; la etapa es `estado`); `tipo_registro` lo mantiene oculto.

### Rediseño de Hoy — `25829f0`
- Lista única de tareas: prioridades IA + tareas de interacciones, unificadas
  como `TareaPendiente` y ordenadas por fecha.
- Sub-pestañas: Vencidas / Tareas (hoy+futuras) / Realizadas. Se eliminaron
  "Hoy" y "Todas". Máximo 10 visibles + "Ver X tareas más".
- Diferenciación por borde izquierdo: hoy verde, vencida roja, futura apagada.
- Se eliminó `PrioridadCard` (tarjeta grande). Nuevo campo opcional
  `TareaPendiente.razon_ia` (línea gris al expandir tareas de IA).
- Completar IA de hoy ahora pasa por `/api/tareas/completar` (origen 'ia'),
  con verificación "¿realizaste este contacto?" igual que las vencidas.

### Diferenciación ganado/perdido — `2d76daa`
- Borde izquierdo verde (ganado) / gris + opacidad (perdido) en kanban y lista.
- Header de ficha: verde sólido (ganado) / gris (perdido) en vez del gradiente.

### Montos en pipeline — `a28a36c`
- Reusa columna `empresas.valor_estimado_clp` (entero). Se captura al pasar a
  "cotizado" (dialog de rangos) o desde la ficha. Suma por etapa en kanban,
  ponderación en Panorama, sección "Montos" en Rendimiento. Sin IA.

### Días en etapa + enfriamiento — `6bee8ab`
- Columna `empresas.estado_desde` (date). `lib/enfriamiento.ts` con umbrales por
  etapa (reglas puras, cero IA). Alertas de "enfriamiento silencioso" en Panorama.

---

## Sesión anterior (corrección de 5 bugs) — `8c086b3`–`a5d9d7f`

| Hash | Descripción |
|------|-------------|
| `8c086b3` | fix: corregir prefer-const que bloqueaba build en Vercel |
| `8a93e6f` | fix: detectar fechas mencionadas por prospecto e inferir seguimiento por tono |
| `f14be7e` | fix: una empresa = máximo una tarea pendiente (supersederTareasPendientesEmpresa) |
| `bc611ab` | fix: ocultar stubs de tarea/estado del historial de la ficha |
| `a5d9d7f` | fix: boton No contesto ahora actualiza la UI (esStubDeTarea respeta parent_id) |

---

## Bugs resueltos en esta sesión

### 1. Build de Vercel bloqueado (`prefer-const`) — `8c086b3`
- **Síntoma:** todos los deploys fallaban desde el commit del sistema de cadencias.
- **Causa:** dos variables declaradas con `let` que nunca se reasignaban.
- **Fix:** `let canalAnterior` → `const` en:
  - `app/api/cadencias/asignar/route.ts` (línea 79)
  - `lib/cadencias-server.ts` (línea 109)

### 2. Fecha de seguimiento ignoraba lo que decía el prospecto — `8a93e6f`
- **Síntoma:** `proximo_paso_fecha` siempre se calculaba como +3 o +7 días hábiles,
  ignorando frases como "hablemos el jueves 17".
- **Arquitectura:**
  - Nueva función `resolverFechaSeguimiento()` en `lib/fecha.ts` con cascada de 3 niveles:
    1. Fecha explícita del prospecto (validada: formato YYYY-MM-DD, no pasada, ≤66 días hábiles)
    2. Inferencia por tono: interesado/cotización→2 días, neutral/consulta jefe→5, no respondió→3, frío→14
    3. Fallback: `hayCompromisos ? 3 : 7` días hábiles
  - 3 nuevos campos en `ResultadoAnalisis` y en la tabla `interacciones`:
    `fecha_mencionada`, `dias_habiles_sugeridos`, `motivo_fecha_sugerida`
  - Migración ejecutada: `supabase/migrations/20260713_motivo_fecha_sugerida.sql`
  - Prompt actualizado en `lib/prompts.ts` (`PROMPT_COACH_ESCRITO`): Claude resuelve
    la fecha en 2 vías excluyentes (A: fecha explícita → YYYY-MM-DD; B: sin fecha → días hábiles)
  - Endpoints actualizados: `analizar-interaccion/route.ts` y `interacciones/[id]/analizar/route.ts`
  - Ancla de fecha HOY (Chile, día de la semana) inyectada en el mensaje a Claude
- **Nota:** `motivo_fecha_sugerida` se guarda correctamente en BD pero aún no se
  muestra en la UI (card de Hoy ni historial). Pendiente baja prioridad.

### 3. Una empresa acumulaba múltiples tareas pendientes — `f14be7e`
- **Síntoma:** G&N Brands aparecía 4 veces en Hoy (fechas 19/20/21 jul) porque cada
  interacción nueva creaba su propia tarea sin cancelar las anteriores.
- **Regla:** una empresa = máximo una tarea pendiente activa (excluye cadencias).
- **Arquitectura:**
  - Nueva función `supersederTareasPendientesEmpresa(empresaId, exceptoId)` en `lib/queries.ts`:
    nulifica `proximo_paso`, `proximo_paso_fecha`, `motivo_fecha_sugerida` en las
    filas previas (no las marca `resuelta=true`) para que desaparezcan de Hoy,
    Realizadas y Rendimiento sin contaminar métricas.
  - Semántica "newest-wins": la nueva tarea siempre gana. La que conserva entre
    las existentes es la de fecha más próxima a hoy (más urgente).
  - Llamada añadida en: `analizar-interaccion`, `interacciones/[id]/analizar`,
    `interacciones/crear` (post-auto-tarea), `interacciones/[id]` PATCH.
  - SQL de limpieza puntual ejecutado en Supabase para nulificar los 4 duplicados
    de G&N: conservó la fila con `proximo_paso_fecha` más cercana a hoy.

### 4. Historial de la ficha mostraba stubs de tarea/estado — `bc611ab`
- **Síntoma:** burbujas naranjas "Llamada sin respuesta" aparecían mezcladas con
  conversaciones reales en el historial.
- **Causa:** esas filas existen en BD para crear tareas en Hoy, no para mostrar
  conversación. No son `transcripcion=null` puro — tienen texto marcador.
- **Fix:** función `esStubDeTarea()` en `components/cuentas/tab-historial.tsx`:
  oculta filas SIN `resumen_ia` cuyo texto es vacío o coincide con los marcadores
  `MARCADORES_OCULTAR = ["Llamada sin respuesta", "Sin respuesta tras 48h"]`.
  Los registros se filtran de `visibles` antes de construir los hilos.
  Las filas siguen en BD, aparecen en Hoy y en métricas — solo se ocultan del historial.

### 5. Botón "No contestó" no actualizaba la UI — `a5d9d7f`
- **Síntoma:** al presionar "❌ No contestó" en el historial, no pasaba nada
  visualmente. El botón seguía ahí. El vendedor de CCU lo presionó 7 veces.
- **Causa:** el fix anterior de los stubs (commit `bc611ab`) también ocultaba los
  mensajes de resolución del botón ("Sin respuesta tras 48h") porque comparten
  el mismo texto. Pero estos mensajes SÍ tienen `parent_id` (son hijos del mensaje
  original), mientras que los stubs standalone NO lo tienen.
- **Fix:** en `esStubDeTarea()`, añadir `if (i.parent_id) return false;` como
  primera guarda. Mensajes con `parent_id` = resoluciones reales → siempre visibles.
  Resultado: presionar el botón muestra la burbuja "❌ Sin respuesta tras 48h" en el
  hilo y los botones de respuesta desaparecen (porque ya hay un mensaje del prospecto).
- **Efecto secundario cosmético:** en CCU (hilo de John Velásquez, LinkedIn) aparecen
  7 burbujas "❌ Sin respuesta tras 48h" del 14 jul — los 7 clicks previos que se
  guardaron pero no eran visibles. Son datos reales en BD; se pueden eliminar
  una a una con el ícono de basura de cada burbuja.

---

## Bugs pendientes

### Cosmético — duplicados históricos de "No contestó" en CCU
- Empresa: CCU S.A., contacto John Velásquez (LinkedIn)
- 7 burbujas "❌ Sin respuesta tras 48h" del 14 jul visibles ahora que el fix aplicó.
- No afecta funcionalidad. Se pueden borrar manualmente desde el historial.

### Cosmético — `motivo_fecha_sugerida` no se muestra en UI
- La columna se guarda correctamente en BD (desde `8a93e6f`).
- No se muestra en la card de Hoy ni en el detalle del historial.
- Baja prioridad. Implementar si se quiere que el vendedor vea el "por qué" de la fecha.

### Cosmético — `toLocaleString` sin `timeZone` en componentes cliente
- Archivos: alertas, configuracion, panorama, tab-historial, hoy-client,
  vista-kanban, llamadas, costos.
- Corren en el navegador del vendedor (Chile) → actualmente correctos.
- Solo daría determinismo entre dispositivos. Baja prioridad.

---

## Features completadas (esta sesión)

- ✅ **Prompt 2 — días en etapa + alertas de enfriamiento** (`6bee8ab`)
- ✅ **Prompt 4 — montos en pipeline** (`a28a36c`)

## Features pendientes (en orden de prioridad)

1. **Prompt 3 — razones de pérdida**
   - Al marcar un negocio como perdido, capturar la razón (precio, competidor,
     no hay necesidad, timing, etc.).
   - Alimentar análisis de patrones de pérdida.

2. **Prompt 7 — resumen Panorama**
   - Resumen semanal/mensual generado por IA con las métricas de Panorama.
   - Estado de la cartera, tendencias, alertas.

3. **Prompt 5 — sugerencia de movimiento en pipeline**
   - IA sugiere cuándo avanzar una cuenta de etapa basada en señales de la
     conversación y tiempo en etapa.

4. **Prompt 6 — preparador de reuniones**
   - Antes de una reunión, generar un briefing: contexto del prospecto,
     objetivos, preguntas clave, posibles objeciones.

5. **Prompt 10 — cosméticos fecha cliente**
   - Mejoras visuales en la presentación de fechas en la ficha del cliente.

---

## Decisiones arquitectónicas tomadas en esta sesión

### Nulificación vs. marcado `resuelta=true` para superseder tareas
- **Decisión:** nulificar `proximo_paso`, `proximo_paso_fecha` y `motivo_fecha_sugerida`
  (en lugar de marcar `resuelta=true`).
- **Razón:** las 3 vistas de métricas (Hoy, Realizadas, Rendimiento) filtran por
  `proximo_paso IS NOT NULL`. Nulificar hace desaparecer las filas de todas las vistas
  sin afectar `resuelta` ni `no_realizada`, que alimentan métricas de actividad real.

### Conservar tarea más próxima al hoy (no la más reciente)
- **Decisión:** cuando hay múltiples tareas pendientes al crear una nueva,
  conservar la con `proximo_paso_fecha` más cercana a hoy (inclusive vencidas).
- **Razón:** la más urgente es la que el vendedor necesita ver primero.
- **Excepción:** newest-wins se mantiene para tareas creadas en tiempo real
  (la nueva tarea siempre supersede a las anteriores).

### Detección de fechas: cascada de 3 niveles
- **Decisión:** `resolverFechaSeguimiento()` aplica: fecha explícita → inferencia
  por tono → fallback histórico. Nunca usa ambas a la vez.
- **Razón:** evita contradicciones y mantiene comportamiento predecible. La función
  vive en `lib/fecha.ts` (source of truth para lógica de fechas en Chile).

### Stubs de sistema: ocultar del historial, no borrar
- **Decisión:** los registros de sistema (stubs de tarea sin conversación real)
  se ocultan en la vista del historial pero no se eliminan de BD.
- **Razón:** siguen siendo necesarios en Hoy (como tareas) y en métricas (como
  registros de actividad). El historial es solo una vista filtrada.

### Discriminador `parent_id` para resoluciones vs. stubs
- **Decisión:** `esStubDeTarea()` respeta `parent_id`: un mensaje con `parent_id`
  es una resolución real (botón "No contestó"), no un stub autónomo.
- **Razón:** ambos tipos comparten el mismo texto marcador ("Sin respuesta tras 48h"),
  pero su semántica es diferente. `parent_id` es el discriminador correcto.

---

## Notas de entorno (siguen vigentes)

- **OneDrive restaura archivos borrados**: el proyecto vive en carpeta sincronizada.
  Si un archivo borrado con `rm` reaparece, es OneDrive. Borrar con PowerShell
  `Remove-Item -Recurse -Force` para mayor fuerza.
- **`.next` se corrompe con OneDrive** (`EBUSY`/`EINVAL`): si el dev server y
  `npm run build` corren al mismo tiempo, o si OneDrive sincroniza `.next`, el
  compilador falla con errores raros de módulos. Solución:
  1. Detener el dev server
  2. `Remove-Item -Recurse -Force .next` (PowerShell)
  3. `npm run build` o reiniciar dev server
- **SWC (dev server) puede mostrar errores HMR stale**: si `tsc --noEmit` pasa
  limpio pero el dev server muestra "Syntax Error", es el caché de HMR. Hacer
  el ciclo de limpiar `.next` siempre resuelve.
- **Data Cache de Next.js**: toda ruta GET que lea la BD necesita
  `export const fetchCache = "force-no-store"` además de `dynamic = "force-dynamic"`.
  Sin esto, supabase-js sirve datos viejos.
- **Fechas siempre con `lib/fecha.ts`** (`hoyCL`, `nowChileLocal`,
  `sumarDiasHabilesDesde`, `resolverFechaSeguimiento`, `rangoDiaChileUTC`,
  `msRespuestaHabil`): Vercel corre en UTC, Chile es UTC-3/UTC-4.

---

## Resuelto en sesiones anteriores (referencia rápida)

### Fix A–G de auditoría (`a397a7c`)
- Fix A: parseo JSON de IA con `extraerJsonSeguro()` en 7 sitios.
- Fix B: joins de Supabase — vencidas usa query separada; borrada `getMisionesPorFecha`.
- Fix C: cadencias huérfanas al borrar contacto.
- Fix D: carry-over solo si fecha era HOY o anterior.
- Fix E: tareas de cadencia excluidas de heurística/historial.
- Fix F: 409 amistoso en `cadencias/asignar`.
- Fix G servidor: `timeZone: "America/Santiago"` en 5 `toLocaleString` de servidor.

### Código muerto (no borrado, candidatos a limpieza futura)
- `getMisionesPorEmpresa` e `insertMision` en `lib/queries.ts`: sin consumidores.

### SQL viejo sin confirmar (arrastrado de sesiones anteriores)
- `UPDATE contactos SET nombre = NULL WHERE cargo = nombre AND verificado = false;`
  — el usuario nunca confirmó haberlo ejecutado. Verificar si sigue siendo relevante.

### CRÍTICO PENDIENTE — Rotar `service_role` key de Supabase
- La key quedó expuesta en `.claude/settings.local.json` (ya gitignoreado).
- La key sigue en el historial de git. **Debe rotarse en Supabase dashboard →
  Project Settings → API → Reset service_role key**, luego actualizar `.env.local`
  y las variables de entorno en Vercel.
