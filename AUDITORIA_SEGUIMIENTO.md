# Auditoría de seguimiento de contactos

Fecha: 2026-09-22
Alcance: solo lectura. No se modificó ni se construyó nada.
Árbol auditado: raíz del proyecto. Se ignoró `.claude/worktrees/` (copias obsoletas del repo).

## Método y confiabilidad

Se leyeron el esquema SQL completo (15 archivos), las rutas de API, la capa de datos
(`lib/queries.ts`), los prompts (`lib/prompts.ts`) y los componentes de contactos,
cadencias y Hoy.

Los hallazgos marcados con `°` provienen de los lectores automáticos y **no fueron
re-verificados uno por uno** (la pasada de verificación adversarial se cortó por límite
de sesión). Todo lo demás fue comprobado abriendo el archivo citado.

Hechos verificados directamente: esquema de `contactos` e `interacciones`, las tres tablas
de cadencias y su índice único, `prioridades_diarias`, el auto-disparo de prioridades,
`getPrioridadesCache` sin llamadores, `/api/prioridades/completar` sin llamadores,
`cerrarPorRespuesta`, el destino del sync de Gmail, las tablas que tocan los borradores,
el corte cliente/servidor de vencidas, el conflicto de `estado_empresa`, la forma de
salida de `PROMPT_PRIORIZAR`, el inventario de tablas y columnas sin DDL.

---

## 1. CONTACTOS

### ✅ Cómo está implementada la tabla

`supabase/schema.sql:58-79`. Doce columnas:

```
id             uuid PK default uuid_generate_v4()
empresa_id     uuid NOT NULL references empresas(id) ON DELETE CASCADE
nombre         text NOT NULL   -- pasó a nullable en contactos_nombre_nullable.sql
cargo          text
area           text CHECK in ('adquisiciones','calidad','operaciones','gerencia','otro')
email          text
telefono       text
linkedin_url   text
notas_ia       text
es_decisor     boolean NOT NULL default false
creado_en      timestamptz NOT NULL default now()
actualizado_en timestamptz NOT NULL default now()
```

Índices: `idx_contactos_empresa (empresa_id)`, `idx_contactos_decisor (empresa_id, es_decisor)`.
Trigger `trg_contactos_actualizado` BEFORE UPDATE. RLS desactivado.

### ❌ ¿Tiene estados? ¿Tiene seguimiento?

**No.** La tabla `contactos` no tiene ninguna columna de estado, etapa, temperatura,
última interacción, próximo paso ni fecha de seguimiento. El único flag es `es_decisor`
(booleano). No existe ninguna tabla auxiliar de estado por contacto en ningún `.sql`.

### ✅ ¿Está ligada a empresa o es independiente?

**Ligada, obligatoriamente.** `empresa_id` es `NOT NULL` con `ON DELETE CASCADE`
(`supabase/schema.sql:60`). Un contacto no puede existir sin empresa: si se borra la
empresa, se borran sus contactos. `GET /api/contactos` exige `empresa_id` como filtro.

### ✅ Qué muestra el panel de actividad de contactos

`components/cuentas/panel-seguimiento-contactos.tsx` (440 líneas). Es un `Sheet` lateral
que se abre desde las tarjetas de empresa con el botón "Seguimiento contactos".

- Al abrir hace **dos GET** en paralelo (`panel-seguimiento-contactos.tsx:100-102`):
  `/api/contactos?empresa_id=…` y `/api/interacciones/empresa/{id}`. Cero créditos de IA.
- La "última interacción por contacto" se calcula **en el cliente**, con un `Map`
  (`:126-138`), descartando dos familias de stub: las que traen `contacto_id` null y las
  que pasan `esStubDeTarea()`.
- Semáforo de actividad por contacto, 3 niveles hardcodeados en días hábiles (`:37-53`):
  **Activo** ≤5, **Enfriándose** ≤10, **Frío** >10.
- Renderiza dos secciones: "Con actividad" y "Sin contactar aún". No filtra por
  `es_decisor` — comentario explícito en `:140-141`: ese flag es false en el 100% de los
  contactos de prospectos ligeros y el panel saldría vacío.
- Cada fila: iniciales, nombre/cargo, tipo y antigüedad del último toque, píldora de nivel
  y barra. Al expandir: solo canales de contacto (teléfono, email, LinkedIn) con copiar.

### ⚠️ El panel es de solo lectura

No ofrece ninguna acción de seguimiento: no registra interacciones, no cambia estados, no
inicia cadencias y no persiste nada. El semáforo se recalcula en cada render.°

### ⚠️ Existen tres depósitos distintos de "personas"

1. La tabla `contactos` (filas reales).
2. Los **decisores** guardados como JSON dentro de `empresas.ficha_ia` — generados por la
   IA al investigar. Son cargos sugeridos, no personas confirmadas.°
3. `FichaIA.contactos_reales`, un tercer array que no se muestra ni se persiste en la
   tabla `contactos`.°

La sincronización decisores(JSON) → contactos(tabla) es **unidireccional** y solo ocurre
al investigar o regenerar. `tab-decisores.tsx` es el único lugar que cruza los dos
conceptos, y lo hace comparando por **texto del cargo**.°

### ⚠️ Deriva de esquema en contactos

- `contactos.verificado` se usa en el código y está en `lib/types.ts`, pero **no existe en
  ningún `.sql` del repo**. (Verificado: 0 archivos SQL la mencionan.)
- El `CHECK` de `area` no incluye `'compras'`, valor que sí emiten los prompts de IA y
  ofrece la UI.°
- No existe constraint única `(empresa_id, cargo)`, pero hay un upsert vivo que la asume.°

### 💡 Reutilizable

- `lib/queries.ts` expone exactamente **4 funciones CRUD** de contactos (verificado):
  `getContactosPorEmpresa` (:239), `insertContacto` (:250), `updateContacto` (:261),
  `deleteContacto` (:273). Todas planas, por empresa.
- `DELETE /api/contactos/[id]` ya cierra las cadencias activas del contacto antes de
  borrarlo (`app/api/contactos/[id]/route.ts:58`) — el gancho contacto→cadencia ya existe.
- `PATCH /api/contactos/[id]` acepta 9 campos: es el punto natural donde colgaría un
  campo de estado.
- El `Map` de última actividad del panel (`:126-138`) es la lógica de "último toque por
  persona" ya escrita; hoy vive en el cliente.

---

## 2. INTERACCIONES

### ✅ Cómo está implementada la tabla

`supabase/schema.sql:86-112`. Dieciséis columnas:

```
id, empresa_id (NOT NULL, CASCADE), contacto_id (nullable, SET NULL),
tipo CHECK in ('llamada','reunion','email','whatsapp'), fecha, audio_url,
transcripcion, resumen_ia, compromisos jsonb, sentimiento CHECK in
('positivo','neutro','negativo'), tecnica_usada, coaching_ia,
proximo_paso, proximo_paso_fecha date, creado_en, actualizado_en
```

Cuatro índices, incluido `idx_interacciones_contacto (contacto_id)`.

Cinco migraciones agregan columnas: `parent_id` (self-FK), `remitente`, `no_realizada`,
`motivo_fecha_sugerida` y `cadencia_asignacion_id`.

### ✅ El vínculo interacción → contacto SÍ existe a nivel de datos

`contacto_id uuid references contactos(id) on delete set null` más su propio índice
(`schema.sql:89`, `:107`). No hay que crearlo.

### ⚠️ ¿Se puede saber la última interacción por contacto?

**Sí, pero no hay una query dedicada.** El dato es derivable y de hecho se deriva en
varios lugares, siempre recalculándolo:

- **En el cliente**, dentro de una sola empresa: `panel-seguimiento-contactos.tsx:126-138`
  y `tab-chat.tsx:224`.
- **En el servidor**, agrupando por contacto: `app/api/interacciones/vencidas/route.ts:101-120`
  construye un `Map` `contacto_id → interacciones[]` y llama `calcularCadencia` por
  contacto. `app/api/panorama/route.ts:156` hace un `conteoPorContacto`.
  `app/api/preparacion/route.ts:297` filtra por `contacto_id`.
- `lib/queries.ts:818` — `getHistorialResumido(empresaId, contactoId?)` acepta filtro por
  contacto (`:824`). Es la única función de la capa de datos con grano por contacto.

No existe ninguna función tipo `getUltimaInteraccionPorContacto()` ni ninguna vista SQL.
Cada consumidor lo recalcula a mano.

### ⚠️ `contacto_id` nace NULL en la mayoría de los flujos

La columna existe, pero **se escribe solo cuando el usuario elige un contacto explícitamente**.
En toda la UI el selector de contacto es opcional y arranca vacío.°
Lo escriben: `interacciones/crear` (`:68`), `analizar-interaccion` (`:69`, `:199`),
`nueva-interaccion-sheet.tsx`, `panel-texto.tsx`, `upload-llamada.tsx`, `sin-respuesta.tsx`.
Tres flujos lo heredan de una fila previa en vez de volver a pedirlo (`tab-historial.tsx:362,392,686`).°

### ✅ ¿Distingue remitente vendedor de contacto?

**Sí.** `add_remitente_interacciones.sql:3`:
`ALTER TABLE interacciones ADD COLUMN IF NOT EXISTS remitente text DEFAULT 'vendedor'`.
Sin `CHECK`. Dos valores en uso: `'vendedor'` y `'prospecto'`.

Se usa de forma sustantiva: `/api/interacciones/vencidas` filtra `.eq("remitente","vendedor")`
con el comentario "Solo los mensajes que ENVIÓ el vendedor pueden estar esperando respuesta"
(`vencidas/route.ts:52-56`). `calcularCadencia` trata `remitente === 'prospecto'` como
evento de engagement que reinicia la racha (`lib/cadencia.ts:109`).

### ⚠️ Inconsistencias conocidas en `remitente`

- Solo un endpoint puede escribir `remitente='prospecto'`, y solo dos componentes se lo mandan.°
- El botón "Sí, respondió" de `/alertas` guarda la fila con `remitente='vendedor'` y
  `resuelta=false`.°
- Los marcadores negativos del historial se guardan con `remitente='prospecto'` aunque
  signifiquen que el prospecto **no** respondió.°

### ❌ Gmail no genera interacciones

`app/api/gmail/sync/route.ts:101` escribe en `correos_detectados`, tabla que **no tiene
`contacto_id`** y que no tiene DDL en el repo. El sync nunca inserta en `interacciones`.
(Verificado: las únicas tablas que toca son `integraciones`, `empresas` y `correos_detectados`.)

### ❌ Aprobar o enviar un borrador no crea ninguna interacción

`app/api/borradores/route.ts` y `app/api/borradores/[id]/route.ts` solo tocan la tabla
`borradores`. No hay insert en `interacciones`. (Verificado.)

### ⚠️ Columnas sin DDL en el repo

`resuelta`, `badge_estado` y `decision_sugerida` se leen y escriben en ~25 archivos pero
**no tienen `CREATE` ni `ALTER` en ningún `.sql`**. `resuelta` solo aparece mencionada en
un comentario de `add_no_realizada.sql:2-4`. Es la columna central del filtro de tareas
pendientes de /hoy. (Verificado.)

Los `CHECK` de `tipo` y `sentimiento` no cubren valores que el código escribe
(`'linkedin'`, `'sin_respuesta'`).°

### 💡 Reutilizable

- `contacto_id` + su índice ya existen: la granularidad por persona está disponible sin
  migración.
- `remitente` ya distingue dirección del mensaje — base para saber "esperando respuesta".
- `getHistorialResumido(empresaId, contactoId?)` ya filtra por contacto.
- `supersederTareasPendientesEmpresa` (`lib/queries.ts:412`) es la regla de "una sola
  tarea pendiente", hoy anclada a empresa.
- `lib/interaccion-meta.ts` centraliza `esStubDeTarea()` y `TIPO_CONF` — el filtro de
  ruido ya está resuelto y lo comparten historial y panel.

---

## 3. CADENCIAS

Hay **dos sistemas de cadencia distintos**, ambos vivos.

### ✅ Sistema A — cadencias explícitas, persistidas en BD

Creado entero por `supabase/migrations/20260713_cadencias.sql`. Tres tablas:

```
cadencias             (id, nombre, etapa_pipeline CHECK 6 valores, activa, creado_en)
cadencia_pasos        (id, cadencia_id FK, orden, dia_offset, canal CHECK 4 valores,
                       canal_fallback text[], omitible, intencion, UNIQUE(cadencia_id,orden))
cadencia_asignaciones (id, empresa_id FK CASCADE, contacto_id FK CASCADE, cadencia_id FK,
                       fecha_inicio, paso_actual, estado CHECK
                       ('activa','pausada','completada','cancelada'), motivo_cierre
                       CHECK ('respondio','manual','agotada'), creado_en)
```

Más `ALTER TABLE interacciones ADD COLUMN cadencia_asignacion_id`.

### ⚠️ ¿Ligadas a empresa o a contacto? — A ambos, pero mandan la empresa

`cadencia_asignaciones` guarda **los dos ids** y `contacto_id` es `NOT NULL`. Pero el
índice único es por empresa:

```sql
create unique index idx_asignacion_activa_unica
  on cadencia_asignaciones (empresa_id) where estado = 'activa';
```

→ **Máximo una cadencia activa por EMPRESA, no por contacto.** No se pueden correr dos
contactos de la misma empresa en paralelo.

Todas las consultas del flujo buscan por `empresa_id`; solo el borrado de contacto busca
por `contacto_id`.° `cerrarPorRespuesta(supabase, empresaId)` recibe **solo la empresa** y
cierra la única asignación activa (`lib/cadencias-server.ts`, verificado).

### ✅ Plantillas sembradas (literal, del seed)

| Cadencia | Etapa | Pasos |
|---|---|---|
| Frío estándar | prospecto | 5 |
| Post-cotización | cotizado | 3 |
| Reactivación | perdido | 3 |

"Frío estándar": `(1, día 0, correo, fallback linkedin)`, `(2, +3, linkedin, fallback correo, omitible)`,
`(3, +3, llamada, fallback whatsapp/correo)`, `(4, +4, correo, fallback linkedin, omitible)`,
`(5, +6, correo, break-up)`. `dia_offset` son **días hábiles desde el paso anterior**.

### ✅ Cómo calculan el próximo paso

- Al asignar se crea **una sola tarea** (la del primer paso ejecutable), nunca la secuencia
  completa.°
- Cada tarea se materializa como **fila de `interacciones`** con `cadencia_asignacion_id`
  y un prefijo de texto parseable (`PREFIJO_CADENCIA`).°
- El avance ocurre **solo** en el hook de `POST /api/tareas/completar` con origen `'manual'`.
  No hay cron ni avance por tiempo.°
- `avanzarCadencia` avanza un paso por vez y calcula la fecha **relativa a HOY**, no a la
  fecha planificada.°
- `resolverCanal` deriva los canales disponibles de tres columnas de `contactos`:
  `email`, `linkedin_url`, `telefono`.°
- Tres cierres: `'agotada'`, `'respondio'`, `'manual'`. `cerrarAsignacion` también cancela
  las tareas pendientes.°

### ✅ Sistema B — cadencia inferida por contacto, sin persistencia

`lib/cadencia.ts` (188 líneas). `calcularCadencia(interacciones, contactoId)` filtra por
`contacto_id` (`:98`), detecta el último evento de engagement para reiniciar la racha
(`:105-113`), cuenta *touches* salientes del vendedor excluyendo tareas de cadencia
pendientes (`:122-128`), y calcula días hábiles y canal sugerido.

**Es la única lógica de negocio real con grano por contacto del proyecto.** No persiste
nada: se recalcula en cada request. Consumidores: `/api/interacciones/vencidas:8`,
`/api/preparacion:17`, `tab-chat.tsx:21`.

### ✅ Los tres archivos son sistemas distintos, ninguno es código muerto

Verificado por imports:
- `lib/cadencia.ts` → cadencia **inferida por contacto** (vencidas, preparación, tab-chat).
- `lib/cadencias.ts` → helpers puros de canal/label (asignacion, asignar, metricas/hoy,
  cadencia-panel).
- `lib/cadencias-server.ts` → escritura en BD (asignar, cerrar, contactos/[id], crear,
  tareas/completar, metricas/hoy).

### ⚠️ Puntos incompletos

- El estado `'pausada'` existe en el `CHECK` de la tabla y en `lib/types.ts:480`
  (`EstadoAsignacion`), pero **ningún código lo escribe ni lo lee**. (Verificado: los
  únicos usos de "pausada" en el código son `conversacion_pausada_at`, que es pausa a
  nivel de **empresa**, otra cosa distinta.)
- El preview del panel usa `adaptarCadencia` (encadena fechas desde `fecha_inicio`)
  mientras el servidor usa offsets desde hoy: las fechas mostradas y las reales divergen.°
- `diasHabilesEntre` está duplicada en `lib/cadencia.ts` y `lib/fecha.ts`, con firmas y
  semánticas distintas.°
- Las tablas de cadencia no están en `supabase/schema.sql` y la migración no define RLS ni
  policies.

### 💡 Reutilizable

- `cadencia_asignaciones.contacto_id` ya es la única ligadura de seguimiento que apunta a
  una persona: quitar/ampliar el índice único por empresa es el cambio mínimo para
  permitir cadencias paralelas por contacto.
- `cadencia_pasos.intencion` ya se inyecta como bloque prioritario en el prompt de borrador
  (`/api/preparacion`).°
- Las 4 rutas `/api/cadencias/{'', asignar, asignacion, cerrar}` son la superficie HTTP
  completa y ya están escritas.
- `calcularCadencia` es una función pura, sin BD: sirve tal cual como motor de estado por
  contacto si se decide persistir su salida.

---

## 4. /HOY

### ✅ Arquitectura

`app/page.tsx` es un Server Component vacío que solo monta `HoyClient`.
`components/hoy/hoy-client.tsx` (1446 líneas) consume **7 endpoints**.° No llama a
`/api/panorama`, `/api/preparacion` ni `/api/interacciones/vencidas`.°

### ✅ Qué tablas consulta

`GET /api/metricas/hoy` toca **5 tablas**: `empresas`, `interacciones`, `contactos`,
`metricas_diarias` y `prioridades_diarias`.°

### ✅ Cómo calcula las tareas vencidas

**El corte no ocurre en el servidor.** Verificado:

- `/api/metricas/hoy:133-139` trae las tareas **sin ningún filtro de fecha**:
  ```
  .from("interacciones")
  .not("proximo_paso","is",null)
  .neq("resuelta", true)        // captura false Y null de filas antiguas
  .order("proximo_paso_fecha", asc)
  .limit(50)
  ```
- El split vencida/hoy se hace **en el cliente**, comparando strings:
  `hoy-client.tsx:471` → `.filter(t => t.proximo_paso_fecha < hoyStr)` y
  `:474` → `.filter(t => t.proximo_paso_fecha >= hoyStr)`, donde
  `hoyStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" })` (`:432`).

Las **prioridades de IA vencidas** son otra cosa: salen de `prioridades_diarias` con
`fecha < hoy` y `completada = false`, sin límite inferior de antigüedad.°

Nota aparte: `/api/interacciones/vencidas` **sí** corta en el servidor
(`.lt("fecha", limite48h)`), pero alimenta la campanita del nav, no la pantalla Hoy.

### ⚠️ Consecuencia del corte por string

Una tarea con `proximo_paso` no nulo y `proximo_paso_fecha` **nulo** no cae en ninguno de
los dos filtros (ambas comparaciones dan false), por lo que no aparece en ninguna de las
tres pestañas.°

### ✅ Cómo funciona la priorización con Claude

`POST /api/priorizar` (321 líneas):
- Modelo `claude-haiku-4-5-20251001`, `max_tokens 2000`, `maxDuration 60`.°
- System = `SYSTEM_PROMPT_VALE` + `PROMPT_PRIORIZAR` (`lib/prompts.ts:747`).
- **Entrada**: hasta 20 empresas del pipeline, cada una con días sin contacto, señales,
  aprendizajes y un array `contactos_registrados` (`priorizar/route.ts:101-139`). Si el
  array está vacío inyecta `nota_contactos: "…No inventes nombres."`
- **Salida** (`route.ts:178-181`): array de objetos con
  `empresa_id`, `score`, `razon`, `accion_sugerida`, `urgencia`.
- Escribe `score_prioridad` y `razon_de_contacto_actual` en `empresas`, y reescribe
  `prioridades_diarias` con delete + upsert. Excluye empresas ya gestionadas hoy.

### ✅ Las prioridades son POR EMPRESA, no por contacto

Verificado: `prioridades_diarias` tiene `unique (fecha, empresa_id)` y **no tiene columna
`contacto_id`**. El JSON que devuelve Claude tampoco: los contactos entran como contexto y
el nombre puede aparecer dentro del texto libre de `accion_sugerida`, pero no hay vínculo
estructurado a una persona.

### ✅ Auto-disparo (cumple la regla de CLAUDE.md)

`hoy-client.tsx:226-243`, verificado. Tres guardas más exclusión de fin de semana:

```js
const generadasHoy = !!data.prioridades_generadas_en && (… === hoyClStr);
const yaAutoDisparadoHoy = localStorage.getItem("prioridades_auto_fecha") === hoyClStr;
if (!generadasHoy && !autoTriggeredRef.current && !yaAutoDisparadoHoy) {
  if (!esFinDeSemanaCl()) { … void actualizarPrioridades({ auto: true }); }
}
```

`localStorage` es la segunda línea de defensa por si `guardarPrioridadesCache` falló en el
servidor y `prioridades_generadas_en` quedó null.

### ⚠️ Código escrito pero no conectado

- `getPrioridadesCache` (`lib/queries.ts:1202`) **no tiene ningún llamador**. Solo se
  importa `guardarPrioridadesCache`. `metricas_diarias.prioridades_cache` se escribe y
  nunca se lee. (Verificado.)
- `POST /api/prioridades/completar` existe como ruta pero **ninguna pantalla la llama**.
  (Verificado: la única mención en el código es un comentario en `interacciones/crear:212`.)
- `metricas_diarias.prioridades_cache`, `prioridades_generadas_en` y `notas_dia` no tienen
  DDL en el repo. (Verificado.)
- `ganados_mes` usa corte de mes en UTC puro, no la ventana chilena.°
- El `GET` de `/api/metricas/hoy` **escribe**: recalcula y persiste la racha en cada
  llamada.°
- La reprogramación de fecha desde Hoy envía un ISO en UTC a una columna `date`.°
- El filtro de prospectos ligeros se aplica a tareas pero no a las prioridades de IA.°

### 💡 Reutilizable

- `prioridades_diarias` ya tiene ciclo de vida completo (generada → completada →
  carry-over a vencidas) sin cron. Agregarle `contacto_id` es una columna.
- `lib/fecha.ts`: `hoyCL()`, `rangoDiaChileUTC()`, `esFinDeSemanaCl()`, `diasHabilesEntre()`.
- El patrón de guardas del auto-disparo (ref + localStorage + timestamp en BD) ya resuelve
  "una sola llamada de IA por día".
- `/api/tareas/completar` ya verifica que exista una interacción real de hoy en la ventana
  chilena antes de dar por hecha una tarea.°

---

## 5. LO QUE FALTA

### (A) Estados por contacto — ❌ no existe persistido, ⚠️ existe derivado

No hay ninguna tabla, columna ni enum de estado por contacto. Los valores `copilot`,
`waiting`, `human_action`, `nurturing` **no aparecen en ninguna parte del proyecto**
(buscado en `app/`, `lib/`, `components/`, `supabase/`).

Lo que sí existe, todo **derivado y no persistido**:

| Mecanismo | Archivo | Grano | Persiste |
|---|---|---|---|
| `calcularCadencia()` — racha, touches, canal sugerido | `lib/cadencia.ts:93` | contacto | no |
| `detectarTipo()` — 4 valores | `tab-chat.tsx`° | contacto | no |
| Semáforo Activo/Enfriándose/Frío | `panel-seguimiento-contactos.tsx:37-53` | contacto | no |
| `badge_estado` — 7 valores | `interacciones.badge_estado`° | **interacción** | sí (sin DDL) |

El estado persistido más fino hoy es **por interacción**, no por contacto.°

### (B) Coordinación entre contactos de una misma empresa — ⚠️ parcial

Existe coordinación, pero es **excluyente, no orquestadora**:

1. ✅ Índice único: una sola cadencia activa por empresa (verificado).
2. ✅ `supersederTareasPendientesEmpresa` — una sola tarea pendiente no-cadencia por
   empresa (`lib/queries.ts:412`).
3. ✅ `cerrarPorRespuesta(supabase, empresaId)` — si **cualquier** contacto responde, se
   cierra la cadencia de toda la empresa (verificado).
4. ⚠️ Panorama y el prompt de preparación sí arman contexto compartido y desglose por
   contacto, pero **solo de lectura**.°

❌ **No existe escalamiento de un contacto a otro**, ni regla que decida *a quién* de la
empresa contactar, ni handoff Calidad → Operaciones → Procurement. El sistema impide
contactar a dos a la vez, pero no elige ni rota.

### (C) Next Best Action — ⚠️ existe fragmentado, siempre con clave empresa

No existe una entidad ni un módulo llamado Next Best Action. Lo que hay son **6 campos
dispersos**, todos con clave `empresa_id`:°

- `empresas.razon_de_contacto_actual` y `empresas.score_prioridad` (escritos por `/api/priorizar`).
- `prioridades_diarias.accion_sugerida` + `urgencia`.
- `interacciones.proximo_paso` + `proximo_paso_fecha`.
- `interacciones.decision_sugerida` — literalmente una línea de acción generada por IA.°
- `cadencia_pasos.intencion` — la única con contacto identificado vía la asignación.
- El bloque semáforo/`mensaje_accion` de `/api/panorama` — el NBA por reglas más cercano a
  una función pura.°

⚠️ Asimetría clave (verificada): las tareas **manuales y de cadencia** llegan a /hoy con
contacto identificado; las de **IA no** — el JSON de `PROMPT_PRIORIZAR` solo devuelve
`empresa_id`.

### (D) Centro de Prospección — ❌ no existe como pantalla

`components/layout/nav.tsx:34-39` tiene exactamente **4 secciones**: Hoy, Cuentas,
Rendimiento, Configuración (verificado). Ninguna se llama prospección.

⚠️ Lo que existe es el tab **"Por calificar"** dentro de `/cuentas`, con 3 sub-vistas y
ciclo de vida completo de prospecto ligero (`lib/prospecto-ligero.ts`,
`/api/prospectos`, `nuevo-prospecto-dialog.tsx`, `prospecto-ligero-card.tsx`,
`prospecto-ligero-detail.tsx`, y las migraciones `20260721_tipo_registro`,
`20260820_prospecto_congelado_hasta`, `20260821_prospecto_ligero_perdido_razon`).

❌ No existe ingreso masivo: el alta es unitaria, nombre + URL, un prospecto por diálogo.°

---

## Deriva de esquema (hecho transversal)

**10 tablas que el código consulta no tienen DDL en el repositorio** (verificado
comparando `grep .from("…")` contra `grep "create table"` en `supabase/`):

`chat_empresa`, `misiones_diarias`, `evaluaciones_semanales`, `rendimiento_ejecutivo`,
`integraciones`, `casos`, `borradores`, `borradores_feedback`, `correos_detectados`,
`debug_logs`.

Tablas con DDL: 13 (`empresas`, `contactos`, `interacciones`, `senales`, `aprendizajes`,
`patrones_conversion`, `metricas_diarias`, `contexto_exportable`, `prioridades_diarias`,
`cadencias`, `cadencia_pasos`, `cadencia_asignaciones`, `api_usage`).

**Columnas usadas por el código sin DDL en el repo** (verificado, 0 archivos SQL las
definen): `interacciones.resuelta`, `interacciones.badge_estado`,
`interacciones.decision_sugerida`, `contactos.verificado`,
`metricas_diarias.prioridades_cache`, `metricas_diarias.prioridades_generadas_en`,
`metricas_diarias.notas_dia`, `empresas.conversacion_pausada_at`, `empresas.meddic`,
`empresas.valor_estimado_clp`, `empresas.angulo_entrada`.

**Conflicto de `estado_empresa`** (verificado). Dos definiciones incompatibles:

- `supabase/schema.sql:34-38` → `text` con `CHECK in ('prospecto','contactado','reunion','cotizado','cliente','perdido')`
- `add_ficha_columns.sql:23-33` → `CREATE TYPE estado_empresa AS ENUM ('prospecto','contactado','en_conversacion','reunion_agendada','cotizado','ganado','perdido')`

No son solo 6 vs 7 valores: `reunion`/`cliente` vs `en_conversacion`/`reunion_agendada`/`ganado`
son conjuntos distintos. El `ALTER TABLE … ADD COLUMN IF NOT EXISTS estado` de la migración
es no-op porque la columna ya existía.

---

## Resumen consolidado

### ✅ Lo que YA existe

| Capacidad | Dónde |
|---|---|
| Tabla `contactos` ligada a empresa (FK NOT NULL, CASCADE) | `schema.sql:58` |
| `interacciones.contacto_id` + índice | `schema.sql:89`, `:107` |
| `interacciones.remitente` (vendedor/prospecto) | `add_remitente_interacciones.sql:3` |
| Cadencias explícitas: 3 tablas + 3 plantillas sembradas | `20260713_cadencias.sql` |
| Cadencia inferida por contacto (función pura) | `lib/cadencia.ts:93` |
| Panel de actividad por contacto con semáforo 3 niveles | `panel-seguimiento-contactos.tsx` |
| Priorización diaria con Claude + caché + auto-disparo 1×/día | `/api/priorizar`, `hoy-client.tsx:226` |
| `prioridades_diarias` con carry-over a vencidas sin cron | `20250708_prioridades_diarias.sql` |
| Coordinación excluyente por empresa (3 reglas) | índice único, `supersederTareas…`, `cerrarPorRespuesta` |
| Ciclo de vida de prospecto ligero | `lib/prospecto-ligero.ts`, tab "Por calificar" |
| Control de costo por llamada de IA | `lib/registrarUso.ts`, `api_usage` |

### ❌ Lo que NO existe

- Columna, tabla o enum de **estado por contacto** (`copilot`/`waiting`/`human_action`/`nurturing`: cero apariciones).
- Query, función o vista que devuelva **la última interacción por contacto** de forma directa.
- **Escalamiento entre contactos** de una misma empresa; ninguna lógica decide *a quién* contactar.
- **Cadencias paralelas por contacto** (bloqueadas por el índice único por empresa).
- **Next Best Action** como entidad; y las acciones de IA **no traen contacto**.
- **Centro de Prospección** como pantalla o ruta; **ingreso masivo** de prospectos.
- Interacción creada al **sincronizar Gmail** o al **aprobar un borrador**.

### ⚠️ Lo que existe pero está incompleto

- El panel de contactos es **solo lectura**: no registra, no cambia estado, no inicia cadencia.
- `contacto_id` existe pero **nace NULL** salvo elección explícita del usuario.
- `EstadoAsignacion.'pausada'` declarado, **nunca escrito ni leído**.
- `getPrioridadesCache` y `POST /api/prioridades/completar`: escritos, **sin llamadores**.
- Tareas vencidas: el corte es **client-side por string**; con `proximo_paso_fecha` null la tarea desaparece de las 3 pestañas.
- Tres depósitos de personas (`contactos`, decisores JSON, `contactos_reales`) sincronizados en un solo sentido y cruzados **por texto de cargo**.
- 10 tablas y 11 columnas **sin DDL** en el repo; `estado_empresa` con dos definiciones en conflicto.

### 💡 Qué se puede reutilizar para construir encima

1. **`interacciones.contacto_id` + `remitente` + índice** — el grano por persona ya existe
   en datos. Falta poblarlo siempre y consultarlo agrupado.
2. **`calcularCadencia()`** (`lib/cadencia.ts:93`) — función pura, sin BD, ya calcula racha,
   touches, días hábiles y canal sugerido **por contacto**. Es el motor de estado por
   contacto ya escrito; solo falta persistir su salida.
3. **`cadencia_asignaciones.contacto_id`** — la ligadura a persona ya está. El cambio mínimo
   para cadencias paralelas es el índice `idx_asignacion_activa_unica`.
4. **`PATCH /api/contactos/[id]`** (9 campos) y las 4 funciones CRUD de `lib/queries.ts` —
   punto de entrada natural para un campo `estado`.
5. **`prioridades_diarias`** — ciclo completo generada→completada→vencida sin cron. Admite
   una columna `contacto_id` y un `unique(fecha, empresa_id, contacto_id)`.
6. **`GET /api/panorama`** — ya calcula estado consolidado por empresa **sin IA**, incluido
   desglose por contacto. Es el NBA por reglas más avanzado del proyecto.
7. **`lib/fecha.ts` + `lib/enfriamiento.ts` + `lib/urgencia-visual.ts` + `lib/interaccion-meta.ts`**
   — utilidades puras de fecha chilena, umbrales de enfriamiento, color por urgencia y
   filtro de stubs. Ya compartidas por varias pantallas.
8. **`lib/prompts.ts`** — 13 constantes + 2 builders (`buildPromptBorradores`,
   `buildPromptBorradorCanal`), cada uno con su shape JSON escrito dentro del prompt.
9. **Las 4 rutas `/api/cadencias/*`** y el patrón "tarea = fila de `interacciones` con
   `cadencia_asignacion_id`" — la materialización de pasos ya funciona.
10. **El patrón de guardas del auto-disparo** (ref + localStorage + timestamp en BD) —
    resuelve "máximo una llamada de IA por día" y es replicable.
