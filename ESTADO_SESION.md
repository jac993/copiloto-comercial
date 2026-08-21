# Estado de sesión — Copiloto Comercial

Última actualización: 21 ago 2026 — panel lateral de seguimiento de contactos,
dos acciones apiladas por tarjeta, revert de la barra de actividad en la pestaña
Decisores, y consolidación de `hrefLinkedIn` y `TIPO_CONF` en `lib/`.
Commits `d76fd07`–`80ba3b9`.

**Si el build local falla con errores raros de archivos, ver la nota de
`attrib +P -U .next` en Notas de entorno — es el arreglo real, borrar `.next`
no alcanza.**

Sesión previa (20 ago): rotación de la `service_role` key (deuda de seguridad
saldada), fix transversal de sincronización de Server Components y cuatro
mejoras a prospectos ligeros. Commits `385d269`–`ee95da1`.

---

## Commits del 21 ago 2026

| Hash | Descripción |
|------|-------------|
| `d76fd07` | feat: barra de actividad por decisor y datos de contacto colapsables — **revertido** |
| `ca7f416` | fix: normalizar href de LinkedIn y ajustar umbrales del semáforo |
| `74c8ca9` | feat: panel lateral de seguimiento de contactos y dos acciones por tarjeta |
| `3258ce0` | docs: actualizar ESTADO_SESION (panel de contactos + revert) |
| `80ba3b9` | feat: tipo de última interacción en el panel y botones apilados en tarjetas |

Rama: `main`. Sincronizado con `origin/main`.

### ⚠️ `d76fd07` fue revertido — la pestaña Decisores NO tiene barra de actividad

Se construyó la barra de actividad dentro de `tab-decisores.tsx` y luego, por
decisión de producto, se revirtió en `74c8ca9`. **El estado actual de la pestaña
Decisores es el previo a `d76fd07`**: secciones "✅ Contactos confirmados" /
"🔍 Cargos por identificar", badge "Decisor", y canales de contacto siempre
visibles sin colapso. Lo único que sobrevivió de esos dos commits es el fix de
`hrefLinkedIn`.

La información de actividad por contacto vive ahora **solo** en
`panel-seguimiento-contactos.tsx`. Si mañana se cambian los umbrales, se cambian
ahí y la pestaña Decisores no los refleja — es duplicación aceptada
explícitamente por el usuario, no un descuido.

### Panel lateral de seguimiento de contactos — `74c8ca9`

- **Componente nuevo** `components/cuentas/panel-seguimiento-contactos.tsx`,
  compartido por el pipeline y "Por calificar". Usa el `Sheet` de
  `components/ui/sheet.tsx` (entra desde la derecha, `max-w-sm`).
- **Barra de actividad por contacto** en días hábiles desde su última
  interacción: verde ≤5, ámbar 6–10, rojo >10. Umbrales de *persona*, distintos
  de `UMBRAL_ENFRIAMIENTO` de `lib/enfriamiento.ts`, que mide la empresa por etapa.
- **Agrupación:** "Con actividad" arriba ordenado por más reciente;
  "Sin contactar aún" al final con `opacity-60` (mezcla personas nunca
  contactadas con los cargos placeholder sin nombre).
- **Carga al abrir, no antes:** `GET /api/contactos?empresa_id=` y
  `GET /api/interacciones/empresa/[id]` en paralelo, con `AbortController` si el
  usuario cierra antes de que respondan. **Ambos endpoints ya existían** y ambos
  ya traían `fetchCache = "force-no-store"` — no se creó ninguna ruta API.
  Cero créditos de IA, así que no lleva chip ⚡.
- **Cuatro estados:** skeleton, error con botón Reintentar, vacío útil, y datos.
- Ignora las interacciones con `contacto_id = null` (son stubs de sistema).
- Queda montado aunque esté cerrado (Radix no renderiza nada con `open=false`).
  Es a propósito: si el padre lo desmonta al cerrar, **se pierde la animación de
  salida**.

### Dos acciones por tarjeta en vez de tarjeta clickeable — `74c8ca9`

Las tres tarjetas (`empresa-card.tsx`, `vista-kanban.tsx`,
`prospecto-ligero-card.tsx`) pasaron de "toda la tarjeta navega" a dos botones:
**Ver empresa** → `/cuentas/[id]`, y **Seguimiento contactos** → abre el panel.
En kanban van compactos ("Ver" / "Contactos") porque la columna es de 220px.

El estado del panel vive **en cada tarjeta**, no elevado al padre: así no hubo
que tocar `cuentas-client.tsx`. Solo una instancia está abierta a la vez en la
práctica.

### `hrefLinkedIn` consolidado en `lib/utils.ts` — `74c8ca9`

Estaba duplicado en 3 archivos y con el panel iban a ser 4. Ahora vive en
`lib/utils.ts` junto a `cn`, y los 4 componentes lo importan de ahí. No se puso
en `lib/fecha.ts` porque ese módulo es estrictamente lógica de fechas.

### Tipo de última interacción en el panel + `TIPO_CONF` consolidado — `80ba3b9`

- El mapa `ultimaActividad` del panel pasó de guardar solo la fecha a
  `{ fecha, tipo }`, y cada fila muestra
  **"📞 Llamada · Hace 24 días hábiles · Frío"**.
- **`TIPO_CONF` consolidado en `lib/interaccion-meta.ts`.** Estaba duplicado en
  4 componentes (`llamadas-client`, `tab-historial`, `nueva-interaccion-sheet`,
  `alertas/page`) y el panel habría sido la quinta copia. Los 5 importan de ahí.
- `nueva-interaccion-sheet` es el único caso parcial: conserva su array `TIPOS`
  porque lleva el **orden del selector** y el flag **`ia`** (qué canal gasta
  créditos), y solo hace spread de la parte presentacional.

**Trampa al consolidar:** quitar los 4 mapas locales dejó **19 imports de
lucide sin uso** repartidos en esos archivos. Se eliminaron todos menos `Mail`
(en `tab-historial`) y `PhoneOff` (en `nueva-interaccion-sheet`), que sí se usan
en JSX. Sin ese barrido el build de Vercel falla por lint — la misma clase de
error que tumbó el deploy con `router` el 20 ago. **Antes de borrar un mapa que
referencia iconos, contar los usos en JSX del archivo.**

### ⚠️ `TipoInteraccion` tiene 6 valores y uno se llama `email`, no `correo`

El union real es:
```
"llamada" | "email" | "linkedin" | "whatsapp" | "reunion" | "sin_respuesta"
```
El **label** de `email` es "Correo" (así se muestra al usuario), pero la **clave**
es `email`. Es fácil equivocarse: un mapa escrito con la clave `correo` deja sin
icono justo al canal más frecuente, y en silencio. `hoy-client.tsx` sí usa la
clave `correo`, pero ese es otro dominio (`CANAL_TAREA_META`, canales de tarea),
no `TipoInteraccion` — no confundirlos.

### Botones apilados por tarjeta — `80ba3b9`

Las 3 tarjetas pasaron de una fila horizontal a dos botones apilados:
**"Seguimiento contactos"** arriba (primario naranja) y **"Detalle empresa"**
abajo (outline). Antes era "Ver empresa" primero y en horizontal.

`bg-primary` **ya es `#F97316`** (`--primary: 25 95% 53%` en `globals.css`), así
que el `<Button>` por defecto ya es naranja — no hubo que tocar colores.

**Se cumplió la advertencia que dejé el 20 ago:** los botones del kanban medían
44px sólo porque el flex *row* los estiraba, y al apilarlos volvieron a los 36px
de `h-9`. Se subieron a `h-11` explícito, así que ahora las tres pantallas
cumplen el mínimo táctil de 44px de CLAUDE.md sin depender de un efecto
colateral del layout. Apilados también entran los labels completos en la columna
de 220px, sin acortar a "Seguimiento".

### 🔴 TRAMPA DE DATOS — `contactos.es_decisor` no significa "es decisor"

Medido sobre los 98 contactos reales:

```
tipo_registro = completo  +  es_decisor = true   →  61
tipo_registro = ligero    +  es_decisor = false  →  37
```

**Correlación perfecta.** `es_decisor` no es un flag semántico: es un duplicado
accidental de `tipo_registro`, consecuencia de que los prospectos ligeros
reutilizan la tabla `contactos` con `es_decisor = false`.

Consecuencias prácticas:
- **Nunca filtrar una lista de contactos por `es_decisor`.** Si se hace, en
  "Por calificar" sale vacío siempre. El panel nuevo lo evita a propósito.
- El badge "Decisor" de `tab-decisores.tsx` se muestra en el 100% de las filas
  de ese componente (solo ve empresas `completo`), así que no informa nada. Se
  quitó en `d76fd07` y **volvió con el revert**.

### Otros datos del diagnóstico (21 ago, 34 empresas / 98 contactos / 222 interacciones)

- **Contactos por empresa:** promedio 3,2 · máximo 9 · el caso más común es
  **1 solo contacto** (13 de 31 empresas). 3 empresas sin ningún contacto.
- **Trazabilidad interacción → persona:** 201 de 222 (90,5%) tienen
  `contacto_id`. De las 21 que no, **18 son stubs de sistema**
  (`crearStubInteraccion` lo pone en `null` a propósito). O sea que casi toda
  conversación real es atribuible a alguien.
- **Calidad de los contactos:** 46 de 98 (47%) no tienen ninguna interacción ·
  28 tienen `nombre = null` (cargos sugeridos por IA sin persona real) ·
  68 están `verificado = false`.
- **`linkedin_url` sin protocolo:** 2 de 53. Ese era el bug de `ca7f416`.

---

## Commits del 20 ago 2026

| Hash | Descripción |
|------|-------------|
| `385d269` | feat: campo LinkedIn URL en el formulario de contacto de prospecto ligero |
| `d3c878e` | chore: forzar redeploy con nueva service role key |
| `e7ad196` | chore: forzar redeploy con nueva JWT signing key |
| `cfc34a3` | fix: router.refresh() en crear, eliminar y editar interacciones |
| `01dc70d` | fix: router.refresh() en contactos de prospecto ligero |
| `24fa53c` | fix: agregar useRouter al componente TabHistorial |
| `4df4578` | feat: visual de tarjeta de prospecto ligero (badge de días, estilo naranja) |
| `d35fa61` | feat: contactos expandibles y congelamiento de prospectos ligeros |

Rama: `main`. Sincronizado con `origin/main`.

### ✅ RESUELTO — rotación de la `service_role` key

La deuda crítica que arrastraba varias sesiones **quedó saldada**.

- **Alcance real de la exposición:** la key `eyJhbGci...4TDa_ZUR` estaba en
  `.claude/settings.local.json` en 3 commits del historial (`03bbcc2`,
  `3102048`, `d7ff832`), como argumento de un `curl` dentro de la lista de
  permisos. Todos esos commits están en `origin/main`.
- **Rotación efectiva:** Supabase → Project Settings → **JWT Keys** →
  *Create standby key* (ES256) → *Rotate signing key* → **revocar la
  Previous key**. La key expuesta ya **no funciona**.
- La app corre con una JWT nueva, generada el 20 ago, que nunca estuvo en git.
  `.env.local` y las variables de Vercel actualizadas + redeploy.
- El archivo ya está gitignoreado desde `a8dae31`, así que no puede volver a
  filtrarse.

**Intento fallido con el formato nuevo `sb_secret_`:** se probó migrar a la
Secret Key nueva de Supabase. Las llamadas REST directas a PostgREST la
rechazan con `"Forbidden use of secret API key in browser"`, lo que dejó
inservibles los scripts de diagnóstico. Se volvió a una JWT `service_role`
(rotada). **Migrar de verdad al esquema `sb_publishable_`/`sb_secret_` sigue
pendiente** y es prerequisito para poder deshabilitar las legacy JWT keys.

**Queda vivo (bajo riesgo):** el *Legacy JWT secret* no se puede revocar sin
antes deshabilitar las legacy API keys — y eso tumbaría la app, porque la key
en uso es justamente una JWT legacy. No es un riesgo activo: lo que estaba
expuesto en git era la key derivada, ya revocada.

### Bug transversal — mutaciones no se reflejaban hasta recargar (`cfc34a3`, `01dc70d`, `24fa53c`)

- **Síntoma:** crear/eliminar interacciones y contactos "funcionaba" (HTTP 200,
  fila correcta en BD) pero al recargar la pantalla el cambio desaparecía. Al
  editar, el nuevo valor solo se veía al reabrir el formulario.
- **Causa:** los componentes actualizaban su estado local de forma optimista
  pero nunca invalidaban el Server Component que había servido los datos
  iniciales. La siguiente lectura volvía a pintar la versión vieja.
- **Fix:** `router.refresh()` después de cada mutación exitosa —
  `tab-historial.tsx` (5 sitios: alta desde el sheet, alta inline, eliminar
  hilo, eliminar mensaje, editar mensaje) y `prospecto-ligero-detail.tsx`
  (3 sitios: alta, edición y borrado de contacto).
- **Trampa asociada:** `tab-historial.tsx` importaba `useRouter` pero nunca
  llamaba `const router = useRouter()`. El build de Vercel falló con
  `Cannot find name 'router'` (`24fa53c`). `tsc --noEmit` local lo habría
  detectado antes del push.

### Bug — `<button>` dentro de `<button>` rompía la hidratación

- **Síntoma:** `Error: Hydration failed... In HTML, <button> cannot be a
  descendant of <button>` en la ficha de empresa. Con la hidratación rota, los
  handlers no se conectaban y el basurero de las interacciones no respondía.
- **Causa:** en `tab-historial.tsx` la cabecera expandir/colapsar del hilo era
  un `<button>` que contenía los botones de lápiz y basura.
- **Fix:** la cabecera pasó a `<div role="button" tabIndex={0}>` con
  `onKeyDown` para Enter. Los botones internos quedan válidos.
- **Regla para el futuro:** cualquier fila clickeable que contenga botones de
  acción va como `div role="button"`, nunca como `<button>`. Se aplicó el mismo
  patrón en los contactos expandibles de `d35fa61`.

### Congelamiento de prospectos ligeros — `d35fa61`

- **Columna:** `empresas.prospecto_congelado_hasta` (date, nullable).
  Migración `20260820_prospecto_congelado_hasta.sql` + índice parcial
  (solo indexa los no-nulos). Aditiva: `NULL` = activo.
- **Partición de las dos vistas** (en `lib/queries.ts`):
  - `getProspectosLigeros()` → Activos:
    `congelado IS NULL OR congelado <= hoyCL()`
  - `getProspectosCongelados()` → Congelados: `congelado > hoyCL()`
  - Son **complementarias y exhaustivas**: todo ligero cae en una y solo una.
- **Vuelve solo:** al llegar la fecha, el filtro por fecha lo devuelve a
  Activos en la siguiente lectura. **No hay cron ni job.**
- **Endpoints:** `PATCH /api/empresas/[id]/congelar` (valida formato
  `YYYY-MM-DD`, rechaza `hasta <= hoy`, techo defensivo de 2 años, guard 409 si
  no es `ligero`) y `.../descongelar` (idempotente, mismo guard).
- **UI:** sub-toggle `Activos | Congelados` dentro de "Por calificar", con chip
  "Recontactar el DD/MM" por tarjeta. En la ficha, banner de congelado +
  Descongelar, o botón "Congelar prospecto" con dialog de presets
  (1 semana / 1 mes / 3 meses) + fecha manual con `min` = mañana.

### Contactos expandibles en "Por calificar" — `d35fa61`

- Cabecera clickeable (`div role="button"`) despliega un panel **hermano** —
  nunca anidado — con una fila por canal: teléfono con `tel:`, email con
  copiar al portapapeles (feedback "Copiado" 2s), LinkedIn con abrir en
  pestaña nueva.
- Colapsado muestra solo **iconitos de presencia**, sin valores: así la
  expansión tiene propósito real en vez de repetir lo visible.
- Acordeón de uno a la vez. Estado vacío útil si el contacto no tiene canales.
- `Linkedin` **no existe** en esta versión de lucide-react (quitaron los iconos
  de marca). El proyecto usa `Briefcase` como icono de LinkedIn — misma
  convención que `llamadas-client.tsx` y `nueva-interaccion-sheet.tsx`.

### Visual de la tarjeta de prospecto ligero — `4df4578`

Borde izquierdo naranja, avatar con fondo `#FFF7ED`, nombre a `text-base`,
chips de contactos/interacciones en píldoras naranja, y badge de días desde
`creado_en` con semáforo: 0-3 verde, 4-7 ámbar, +7 naranja.

### Campo LinkedIn URL — `385d269`

El formulario de contacto de prospecto ligero ya tenía email; se agregó
`linkedin_url` (`type="url"`) y se marcó el email como `type="email"`. La
columna y el endpoint ya lo soportaban: fue solo UI.

---

## Commits de la sesión anterior (21 jul 2026)

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

## Bugs resueltos en la sesión de los 5 bugs (`8c086b3`–`a5d9d7f`)

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

### Sin verificar — pulsación táctil larga sobre los botones del kanban
Los botones nuevos llevan `onPointerDown` con `stopPropagation` justamente para
que una pulsación de más de 200ms no arrastre la tarjeta (`TouchSensor`
`delay: 200`). Se verificó con la secuencia `pointerdown → pointerup → click`
simulada, que **no reproduce** una pulsación táctil sostenida real. **Falta
probarlo con el dedo en el celular.** Si mantener el botón un instante arrastra
la tarjeta en vez de activarlo, el `stopPropagation` no alcanzó.

### Sin verificar — ancho de la línea de actividad a 375px
La línea del panel pasó a ser más larga ("📞 Llamada · Hace 24 días hábiles").
A 384px de sheet el navegador no reporta desborde, pero **no se pudo medir a
375px** porque `resize_window` no funciona con el panel oculto. A esa anchura el
contenedor pasa de 196 a ~187px, así que en el peor caso el `truncate` recorta la
cola de "hábiles" — no el número de días. Vale mirarlo en el celular.

### Sin caso real — banda ámbar del semáforo de actividad
Verde (≤5 días hábiles) y rojo (>10) se verificaron con datos reales. La banda
ámbar (6–10) **no tiene ningún contacto** que caiga ahí en empresas del pipeline,
así que nunca se vio renderizada. Comparte el mismo `find()` que las otras dos.

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

## Features completadas (acumulado)

- ✅ **Prompt 2 — días en etapa + alertas de enfriamiento** (`6bee8ab`)
- ✅ **Prompt 4 — montos en pipeline** (`a28a36c`)
- ✅ **Prospectos ligeros "Por calificar"** (`da5b345`) + LinkedIn (`385d269`),
  visual de tarjeta (`4df4578`), contactos expandibles y congelamiento (`d35fa61`)
- ✅ **Panel de seguimiento de contactos** con barra de actividad por persona,
  accesible desde las tarjetas de pipeline y de "Por calificar" (`74c8ca9`)

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

### Deuda de plataforma (no bloquea features)

- **Mover `distDir` fuera de OneDrive** en `next.config.mjs`. Es el arreglo
  definitivo al problema de `.next`; hoy se trabaja con el paliativo `attrib`.

- **Migrar al esquema de keys nuevo de Supabase** (`sb_publishable_` /
  `sb_secret_`). Es prerequisito para poder deshabilitar las legacy JWT keys y
  revocar el Legacy JWT secret. Ojo: las llamadas REST directas rechazan la
  `sb_secret_` con `"Forbidden use of secret API key in browser"`, así que hay
  que validar bien el camino por supabase-js antes de cambiar.
- **Auditar `fetchCache = "force-no-store"`** en el resto de páginas que leen
  BD. Ya faltaba en `app/cuentas/page.tsx` y causó un bug que parecía de lógica.

### Idea planteada, aplazada por decisión del usuario

- **Uso por un equipo de 8 personas.** El usuario lo mencionó como dirección
  futura y luego decidió: *"de momento estoy solo, enfoquémonos solo en mí como
  usuario"*. **No implementar nada multi-usuario hasta que lo pida.**
  Cuando llegue, la pregunta que quedó sin responder es si serían 8 vendedores
  con pipelines independientes, 1 vendedor + 7 observadores, u 8 sobre un
  pipeline compartido — la respuesta define si hace falta autenticación
  multi-usuario y separación de datos (semanas de trabajo), y hoy el diseño
  asume un solo usuario sin login.

---

## Decisiones arquitectónicas (21 ago 2026)

### Interactivos anidados: la regla completa (corrige la nota del 20 ago)
Ayer quedó escrito "toda fila clickeable va como `div role="button"`". Eso está
**incompleto** y llevaba a usar el div donde no hace falta. La regla real:

- **`<a>` no puede contener `<button>`** — mismo problema que `<button>` dentro
  de `<button>`. Por eso `empresa-card.tsx` y `prospecto-ligero-card.tsx`
  tuvieron que salir del `<Link>` que envolvía toda la tarjeta antes de poder
  meterle botones.
- **Si la fila clickeable CONTIENE otros interactivos** (lápiz, basura) → va
  como `div role="button"` con `tabIndex` y `onKeyDown`, y los internos llevan
  `onClick={(e) => e.stopPropagation()}`.
- **Si NO contiene interactivos** (el detalle expandido es *hermano*, no hijo) →
  va como `<button>` de verdad. Es HTML válido y mejor para teclado y lectores
  de pantalla. Así está el panel nuevo.

El div no es la opción "segura por defecto": es la opción para el caso anidado.

### Botones dentro de tarjetas arrastrables (dnd-kit)
`KanbanCardDraggable` monta `{...listeners}` en el div contenedor, así que un
`pointerdown` en cualquier botón interno burbujea hasta dnd-kit. Los sensores
tienen umbrales (`PointerSensor { distance: 8 }`, `TouchSensor { delay: 200 }`),
así que un clic de ratón no dispara arrastre — **pero una pulsación táctil de
más de 200ms sí**. Todo botón dentro de una tarjeta del kanban necesita
`onPointerDown={(e) => e.stopPropagation()}`.

Efecto lateral útil descubierto al verificar: los dos botones del kanban miden
**44px** aunque tengan `h-9` (36px), porque el flex padre los estira para
igualar alturas. Cumplen el mínimo táctil de CLAUDE.md por accidente; si se
cambia ese contenedor, vuelven a 36px.

### El panel carga al abrir, no se precarga
Los datos de actividad requieren 2 GET por empresa. Precargarlos para las 15
tarjetas de la lista serían 30 peticiones para que el vendedor abra una. El
`useEffect` está bloqueado por `if (!abierto) return;`.

## Decisiones arquitectónicas (20 ago 2026)

### Congelar se resuelve por filtro de fecha, no por job
- **Decisión:** el "descongelamiento automático" no existe como proceso. Las
  dos queries parten el universo de ligeros por `hoyCL()` en cada lectura.
- **Razón:** cero infraestructura, cero estado que se pueda desincronizar, y
  es imposible que un prospecto quede en las dos listas o en ninguna.

### `prospecto_congelado_hasta` opcional en `EmpresaInsert`
- **Decisión:** agregarla al `Omit` de `EmpresaInsert` y re-declararla opcional,
  igual que `tipo_registro`.
- **Razón:** un campo requerido nuevo en `Empresa` se propaga a todos los
  inserts existentes y rompe el build de `/api/prospectos` y
  `guardarEmpresaDesdeFicha`. La columna es nullable, así que opcional es
  además lo semánticamente correcto.

### Rechazar `hasta <= hoy` con 400 en vez de aceptarlo
- **Decisión:** congelar hasta hoy o al pasado devuelve 400.
- **Razón:** el filtro de Activos usa `<= hoy`, así que se aceptaría la
  escritura y el prospecto reaparecería al instante — el vendedor concluiría
  que el botón está roto. Mejor fallar ruidosamente.

### Filas clickeables con botones adentro: `div role="button"`, nunca `<button>`
- **Decisión:** patrón fijo para toda cabecera expandible que contenga acciones.
- **Razón:** `<button>` anidado es HTML inválido y rompe la hidratación de React
  entera, lo que desconecta handlers en toda la página (no solo el botón
  culpable). Ya costó un bug difícil de diagnosticar en `tab-historial.tsx`.

## Decisiones arquitectónicas anteriores (21 jul 2026)

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
- **⭐ `.next` se corrompe con OneDrive — LA SOLUCIÓN REAL es `attrib`**

  OneDrive convierte archivos de `.next` en *placeholders de nube* mientras Next
  los está escribiendo. El build entonces falla con errores de sistema de
  archivos que **cambian en cada corrida** — esa inconsistencia es justamente la
  firma del problema. El 21 ago falló 4 veces con 4 errores distintos:
  ```
  UNKNOWN: unknown error, write            errno -4094
  ENOENT: Cannot find module for page      (ruta distinta cada vez)
  EINVAL: readlink '.next/types/package.json'   errno -4071
  ```
  Ninguna de esas rutas había sido modificada. **Borrar `.next` y reintentar NO
  alcanzó** (era la receta anterior de este documento). Lo que sí funcionó:

  ```powershell
  Get-Process node | Stop-Process -Force
  Remove-Item -Recurse -Force .next
  New-Item -ItemType Directory -Path .next -Force
  attrib +P -U ".next"     # ← "mantener siempre en este dispositivo"
  npm run build            # exit=0
  ```

  `+P -U` marca la carpeta como *pinned / no liberable*, así OneDrive deja de
  hacer placeholders dentro. Hay que reaplicarlo cada vez que se borra `.next`,
  porque el atributo se va con la carpeta.

  **Cómo distinguirlo de un error de código:** si el mensaje dice `Compiled
  successfully` y pasó `Linting and checking validity of types`, y el fallo es
  posterior (en "Collecting page data" o al borrar), es esto. Un error de código
  falla siempre en el mismo archivo; este cambia. Y en Vercel nunca pasa: compila
  en Linux, en contenedor limpio, sin OneDrive.

  **Arreglo definitivo pendiente** (requiere tocar `next.config.mjs`): mover
  `distDir` fuera de la carpeta sincronizada.
- **SWC (dev server) puede mostrar errores HMR stale**: si `tsc --noEmit` pasa
  limpio pero el dev server muestra "Syntax Error", es el caché de HMR. Hacer
  el ciclo de limpiar `.next` siempre resuelve.
- **Dos dev servers a la vez sirven bundles de cliente viejos** (ver más abajo).
- **`resize_window` del navegador integrado no surte efecto** cuando el panel
  está oculto — misma causa por la que fallan los screenshots. Los checks de
  ancho a 375px no se pueden hacer así; `window.innerWidth` sigue reportando el
  tamaño de escritorio aunque la herramienta diga que redimensionó.
- **Data Cache de Next.js**: toda ruta GET que lea la BD necesita
  `export const fetchCache = "force-no-store"` además de `dynamic = "force-dynamic"`.
  Sin esto, supabase-js sirve datos viejos.
  **Caso real (20 ago):** `app/cuentas/page.tsx` tenía `force-dynamic` pero le
  faltaba `fetchCache`. Al congelar un prospecto la BD ya decía la fecha nueva
  pero la lista seguía mostrando 18 activos — incluso con `?nocache=` en la URL
  y con el server re-renderizando (200 en 1396ms). Agregar la línea lo arregló
  al instante. **Si una mutación no se refleja, revisar esto ANTES de dudar del
  código.** Vale la pena auditar el resto de las páginas que leen BD.
- **Dos dev servers compitiendo por `.next` sirven bundles de cliente viejos**:
  el síntoma es peor que un error de sintaxis — la página carga, los datos del
  servidor son correctos, pero un componente de cliente recién editado renderiza
  su versión anterior (el sub-toggle nuevo simplemente no aparecía, aunque
  `grep` confirmaba que el código estaba en el archivo). Ciclo de arreglo:
  `Get-Process node | Stop-Process -Force` → borrar `.next` → un solo server.
- **Tras borrar `.next`, el primer arranque puede colgarse** en "Starting..."
  sin llegar nunca a "Ready" (OneDrive bloquea la recreación). El puerto queda
  escuchando, así que parece vivo. Solución: matar node, borrar `.next` otra
  vez y reintentar — al segundo intento arranca.
- **`git commit -m` con here-string de PowerShell se rompe** si el mensaje tiene
  comillas dobles (`"Por calificar"` partió el mensaje en pathspecs y el commit
  falló dejando todo staged). Usar `git commit -F <archivo>` para mensajes
  largos o con comillas.
- **`gh` CLI no está instalado** en esta máquina (ni en PATH ni en las rutas
  típicas). Para cosas de GitHub (visibilidad del repo, PRs) hay que ir a la
  web. La visibilidad de `jac993/copiloto-comercial` quedó **sin confirmar**.
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

### ✅ ~~CRÍTICO PENDIENTE — Rotar `service_role` key de Supabase~~
**Resuelto el 20 ago 2026.** Ver la sección de rotación al inicio del documento.
La key expuesta en el historial de git fue revocada y la app corre con una JWT
nueva. Lo que queda es la migración al esquema `sb_secret_`, que es trabajo de
plataforma, no una fuga abierta.
