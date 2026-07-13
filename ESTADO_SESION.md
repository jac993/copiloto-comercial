# Estado de sesión — Copiloto Comercial

Última actualización: sesión de limpieza de hallazgos medios/cosméticos
de la auditoría (posterior a los 5 críticos, commits `a84ab08` + `bc32811`).

## Contexto

Se corrió una auditoría completa (Fable 5) sobre el código. Los 5 hallazgos
críticos/altos ya se resolvieron en `a84ab08` (5 fixes) y `bc32811`
(opción C: notas_vendedor delimitada en los 3 endpoints de personalización).
Esta sesión atacó los hallazgos medios/cosméticos restantes (Fix A–G).

## Resuelto en esta sesión (Fix A–G)

- **Fix A — parseo JSON de IA**: 7 sitios migrados de `JSON.parse` ad-hoc a
  `extraerJsonSeguro()` de `lib/json-parser.ts`, conservando su fallback
  (500 o throw): priorizar, rendimiento/evaluar, preparacion (2 ramas:
  llamada + texto), investigar/regenerar, empresas/[id]/analizar-todo,
  interacciones/[id]/analizar.
- **Fix B — joins de Supabase**:
  - `interacciones/vencidas`: se quitó `empresas(nombre)` del select →
    query separada de nombres + Map.
  - `getMisionesPorFecha` (lib/queries.ts): **borrada** (código muerto sin
    consumidores; el flujo de misiones/reportar-día usa queries inline en
    misiones/feedback y rendimiento/evaluar, no ese helper).
- **Fix C — cadencias huérfanas al borrar contacto**: `DELETE /api/contactos/[id]`
  ahora cierra las asignaciones activas del contacto (`cerrarAsignacion`, marca
  tareas pendientes `resuelta=true/no_realizada=true`) ANTES de borrar. Verificado
  end-to-end: sin tareas huérfanas tras el borrado.
- **Fix D — carry-over**: `tareas/no-realizada` solo arrastra la tarea de cadencia
  a `hoyCL()+1` hábil si su fecha era HOY o anterior; si es futura, la deja intacta.
  Verificado: futura (2026-12-31) intacta, pasada (2026-07-06) avanzó a 2026-07-13.
- **Fix E — heurística/historial contaminados**: se excluyen filas con
  `cadencia_asignacion_id != null && resuelta=false` en: cálculo de touches
  (`lib/cadencia.ts` + selects de vencidas y preparacion), `detectarTipo`
  (tab-chat.tsx) y `getHistorialResumido` (lib/queries.ts).
- **Fix F — 409 amistoso**: `cadencias/asignar` captura el unique violation
  (Postgres 23505) del índice de asignación activa y devuelve 409 en español.
  Verificado: dos asignaciones simultáneas → un 200, un 409.
- **Fix G (solo servidor)**: `timeZone: "America/Santiago"` en los 5
  `toLocaleString`/`toLocaleDateString` de servidor que alimentan prompts o
  notas: analizar-interaccion, analizar-todo, interacciones/[id]/analizar,
  getHistorialResumido, investigar/regenerar.

Typecheck completo limpio. Datos de prueba revertidos en Supabase.

## Pendiente / observaciones para próximas sesiones

- **Fix G cliente (diferido, cosmético)**: los `toLocaleString` de componentes
  cliente (alertas, configuracion, panorama, tab-historial, hoy-client,
  vista-kanban, llamadas, costos) NO llevan `timeZone`. Corren en el navegador
  del vendedor (Chile), así que hoy son correctos; agregar el timeZone solo
  daría determinismo entre dispositivos. Baja prioridad.
- **Fix E — matiz no cubierto (por spec)**: las tareas de cadencia YA resueltas
  siguen contando como touch en la heurística. Como completarlas exige una
  interacción real separada, podría haber un leve doble-conteo. La spec pidió
  excluir solo `resuelta=false`; decidir en el futuro si excluir también las
  resueltas.
- **Fix C — residual menor**: al borrar un contacto con cadencia activa, el
  cascade de la FK pone `cadencia_asignacion_id=null` en sus tareas (ya
  resueltas). Si la fecha de creación de esa tarea es HOY, podría sumar una vez
  a `contactos_hoy` (el filtro de exclusión de Fix 1 es `cadencia_asignacion_id
  IS NULL`). Caso muy raro (borrar contacto el mismo día que arrancó su cadencia).
- **Código muerto no tocado (fuera de alcance de Fix B)**: `getMisionesPorEmpresa`
  e `insertMision` en lib/queries.ts tampoco tienen consumidores. No se borraron
  porque no eran parte de la auditoría de joins. Candidatos a limpieza futura.
- **SQL viejo sin confirmar (arrastrado de sesiones previas)**:
  `UPDATE contactos SET nombre = NULL WHERE cargo = nombre AND verificado = false;`
  — el usuario nunca confirmó haberlo ejecutado. Verificar si sigue siendo relevante.

## Notas de entorno (siguen vigentes)

- **OneDrive restaura archivos borrados**: el proyecto vive en carpeta
  sincronizada. Si un archivo borrado con `rm` reaparece, es OneDrive — borrar
  de nuevo y verificar con `git status` antes de commitear.
- **`.next` y `tsconfig.tsbuildinfo` se corrompen** (`EBUSY`/`EINVAL` de OneDrive).
  Si `tsc`/`build` fallan con errores raros de módulos, correr
  `rm -rf .next tsconfig.tsbuildinfo` y reintentar antes de asumir bug real.
- **Data Cache de Next.js**: toda ruta GET que lea la BD necesita
  `export const fetchCache = "force-no-store"` además de `dynamic = "force-dynamic"`
  (ver memoria del proyecto). Sin esto, supabase-js sirve datos viejos.
- **Fechas siempre con `lib/fecha.ts`** (`hoyCL`, `nowChileLocal`,
  `sumarDiasHabilesDesde`, `rangoDiaChileUTC`, `msRespuestaHabil`): Vercel corre
  en UTC, Chile es UTC-3/UTC-4.
