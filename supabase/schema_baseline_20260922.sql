-- ###########################################################################
-- ##                                                                       ##
-- ##                    NO EJECUTAR - SOLO DOCUMENTACION                   ##
-- ##                                                                       ##
-- ##  Este archivo NO es una migracion. No lo pegues en el SQL editor de   ##
-- ##  Supabase. Es el retrato de lo que HAY en la base de datos viva, para ##
-- ##  que el repositorio deje de mentir sobre su propio esquema.           ##
-- ##                                                                       ##
-- ##  Correrlo sobre la BD de produccion no arregla nada y puede fallar a  ##
-- ##  mitad de camino dejando el esquema inconsistente.                    ##
-- ##                                                                       ##
-- ##  ADEMAS: los CREATE TABLE de la Seccion B estan INCOMPLETOS a         ##
-- ##  proposito - les faltan PK, FK, UNIQUE, CHECK e indices (ver B.0).    ##
-- ##                                                                       ##
-- ###########################################################################
--
-- Baseline generado: 2026-09-22
-- Motivo: la auditoria (AUDITORIA_SEGUIMIENTO.md) encontro que el codigo
--         consulta 23 tablas pero el repo solo define 13. Las otras 10 se
--         crearon a mano en el dashboard de Supabase y nunca se versionaron.
--
-- Como se aplican las migraciones en este proyecto:
--   NO hay CLI de Supabase ni runner. No existe supabase/config.toml y
--   package.json solo tiene dev/build/start/lint. Cada archivo de
--   supabase/migrations/ se pego a mano en el SQL editor (ver el comentario
--   de 20260713_cadencias.sql: "Ejecutada por el usuario en Supabase").
--   Consecuencia: LA BD VIVA ES LA FUENTE DE VERDAD, NO ESTE REPO.


-- ===========================================================================
-- SECCION A - empresas.estado  [VERIFICADO POR INTROSPECCION 2026-09-22]
-- ===========================================================================
--
-- Resultado de las consultas M0:
--   * information_schema.columns -> data_type = 'text'  (NO es USER-DEFINED)
--   * El ENUM estado_empresa de add_ficha_columns.sql NUNCA se aplico a la
--     columna: su "ADD COLUMN IF NOT EXISTS estado estado_empresa" fue un
--     no-op porque schema.sql ya habia creado la columna como text.
--   * Valores presentes en datos (6):
--       prospecto, perdido, contactado, en_conversacion, cotizado,
--       reunion_agendada
--   * Sin datos corruptos.
--
-- ATENCION - diferencia entre "valores en datos" y "valores permitidos":
--   'ganado' NO aparece en los datos (aun no hay negocios ganados), pero SI
--   lo escribe y lo lee el codigo:
--     - components/cuentas/vista-kanban.tsx:44   columna "Ganado" del Kanban
--     - app/api/metricas/hoy/route.ts:70         .eq("estado","ganado")
--     - app/api/panorama/route.ts:75             .not("estado","in","(ganado,perdido)")
--     - app/api/rendimiento/route.ts:80          e.estado === "ganado"
--     - lib/types.ts:160                         EstadoEmpresa incluye "ganado"
--   PATCH /api/empresas/[id]/estado NO valida contra una whitelist en runtime
--   (confia en el tipo de TypeScript), asi que un CHECK sin 'ganado' haria
--   fallar el arrastre del Kanban a la columna Ganado con un error de BD.
--
--   Por eso supabase/schema.sql quedo con los 7 valores de EstadoEmpresa,
--   no con los 6 observados en datos.
--
-- Estado del CHECK en la BD viva: DESCONOCIDO.
--   No se corrio la consulta 1.2 (pg_constraint). Como hay filas con
--   'en_conversacion' y 'reunion_agendada' - valores que el CHECK original
--   de schema.sql prohibia - el CHECK original NO puede seguir vigente:
--   o se elimino, o se reemplazo. Falta confirmarlo antes de M5.


-- ===========================================================================
-- SECCION B - LAS 10 TABLAS SIN DDL EN EL REPO
-- ===========================================================================
--
-- B.0  ESTADO DE ESTA SECCION
-- ---------------------------------------------------------------------------
--   [VERIFICADO]  Consulta 2.1 (columnas) para 6 de las 10 tablas:
--                 borradores, borradores_feedback, casos, chat_empresa,
--                 correos_detectados, debug_logs.
--                 De esas 6, los CREATE TABLE de abajo son fieles: nombre de
--                 columna, tipo, nullability y default salen tal cual de
--                 information_schema.columns.
--
--   [PENDIENTE]   Consulta 2.1 para las 4 restantes: evaluaciones_semanales,
--                 integraciones, misiones_diarias, rendimiento_ejecutivo.
--                 (La salida llego cortada en "evaluacion...".)
--
--   [PENDIENTE]   Consulta 2.2 (PK / FK / UNIQUE / CHECK) para las 10.
--   [PENDIENTE]   Consulta 2.3 (indices) para las 10.
--
--   POR ESO NINGUN CREATE TABLE DE ABAJO LLEVA CONSTRAINTS.
--   No se escribio "primary key" ni "references" en ninguno: seria inventado.
--   En todas, id es uuid NOT NULL con default gen_random_uuid(), lo que hace
--   casi seguro que sea la PK - pero "casi seguro" no es "verificado", y este
--   archivo existe justamente para no repetir esa clase de suposicion.
--
--   PARA COMPLETAR: correr 2.2 y 2.3, y 2.1 para las 4 que faltan.
--   Alternativa mas directa, trae todo de una y ya formateado:
--       npx supabase db dump --db-url "<DIRECT_URL>" --schema public
--
-- ---------------------------------------------------------------------------
-- HALLAZGOS NUEVOS de la consulta 2.1 (discrepancias BD vs lib/types.ts)
-- ---------------------------------------------------------------------------
--   1. borradores.feedback_rechazo (text) EXISTE en la BD pero NO esta en el
--      tipo BorradorGuardado (lib/types.ts:822). Columna huerfana: ningun
--      codigo TypeScript la conoce.
--   2. borradores_feedback.evaluacion es TEXT en la BD, pero el tipo
--      BorradorFeedback la declara como EvaluacionFeedback (objeto), no string.
--      O se guarda JSON serializado en texto, o el tipo miente.
--   3. borradores.empresa_id es NULLABLE en la BD, pero BorradorGuardado la
--      declara como string obligatorio. Mismo caso en canal, contenido y tipo.
--   4. debug_logs rompe todas las convenciones del proyecto: id es int8 (no
--      uuid), empresa_id es TEXT (no uuid, sin FK posible) y la marca de
--      tiempo se llama created_at en vez de creado_en. Confirma que es una
--      tabla desechable, no parte del modelo.


-- ---------------------------------------------------------------------------
-- B.1  borradores            (5 usos; tipo BorradorGuardado, lib/types.ts:822)
--      Lectura/escritura: app/api/borradores/route.ts,
--                         app/api/borradores/[id]/route.ts
--      [VERIFICADO 2.1] columnas / [PENDIENTE 2.2-2.3] PK, FK, indices
-- ---------------------------------------------------------------------------
create table borradores (
  id                uuid         not null default gen_random_uuid(),
  empresa_id        uuid         null,
  contacto_id       uuid         null,
  canal             text         null,
  contenido         text         null,
  tipo              text         null,
  usado             boolean      null default false,
  creado_en         timestamptz  null default now(),
  feedback_rechazo  text         null   -- no existe en lib/types.ts
);


-- ---------------------------------------------------------------------------
-- B.2  borradores_feedback   (4 usos; tipo BorradorFeedback, lib/types.ts:794)
--      Lectura/escritura: lib/queries.ts:1287 insertBorradorFeedback,
--                         lib/queries.ts:1296 getFeedbackEjemplos
--      [VERIFICADO 2.1] columnas / [PENDIENTE 2.2-2.3] PK, FK, indices
-- ---------------------------------------------------------------------------
create table borradores_feedback (
  id                uuid         not null default gen_random_uuid(),
  creado_en         timestamptz  null default now(),
  empresa_id        uuid         null,
  contacto_id       uuid         null,
  canal             text         not null,
  tipo_borrador     text         null,
  borrador_ia       text         not null,
  evaluacion        text         null,   -- TS la declara como objeto, no string
  version_vendedor  text         null,
  notas             text         null
);


-- ---------------------------------------------------------------------------
-- B.3  casos                 (5 usos; tipo Caso, lib/types.ts:768)
--      [VERIFICADO 2.1] columnas / [PENDIENTE 2.2-2.3] PK, CHECK, indices
--      OJO: tamano_empresa, canal_entrada y tecnica_venta son TEXT planos en
--      la BD, pero en TS son uniones cerradas (TamanoCaso / CanalCaso /
--      TecnicaCaso). Si 2.2 no devuelve un CHECK para ellas, no hay nada que
--      impida escribir un valor fuera de la union.
-- ---------------------------------------------------------------------------
create table casos (
  id                  uuid         not null default gen_random_uuid(),
  sector              text         not null,
  tamano_empresa      text         null,
  cargo_decisor       text         null,
  problema            text         not null,
  proveedor_anterior  text         null,
  solucion            text         not null,
  tipo_etiqueta       text         null,
  resultado           text         not null,
  objecion_vencida    text         null,
  canal_entrada       text         null,
  tecnica_venta       text         null,
  tiempo_cierre       text         null,
  activo              boolean      not null default true,
  creado_en           timestamptz  not null default now(),
  actualizado_en      timestamptz  not null default now()
);


-- ---------------------------------------------------------------------------
-- B.4  chat_empresa          (4 usos; tipo ChatEmpresa, lib/types.ts:633)
--      [VERIFICADO 2.1] columnas / [PENDIENTE 2.2-2.3] PK, FK, indices
--      Coincide exactamente con el tipo TypeScript.
-- ---------------------------------------------------------------------------
create table chat_empresa (
  id          uuid         not null default gen_random_uuid(),
  empresa_id  uuid         not null,
  pregunta    text         not null,
  respuesta   text         not null,
  creado_en   timestamptz  not null default now()
);


-- ---------------------------------------------------------------------------
-- B.5  correos_detectados    (2 usos; tipo CorreoDetectado, lib/types.ts:835)
--      Escritura: app/api/gmail/sync/route.ts:101
--      [VERIFICADO 2.1] columnas / [PENDIENTE 2.2-2.3] PK, FK, UNIQUE, indices
--      OJO: falta confirmar si hay UNIQUE sobre gmail_message_id. El sync
--      reinserta en cada corrida; sin esa restriccion se duplican correos.
--      NO tiene contacto_id - por eso el sync de Gmail nunca puede atribuir
--      un correo a una persona ni crear interacciones.
-- ---------------------------------------------------------------------------
create table correos_detectados (
  id                uuid         not null default gen_random_uuid(),
  empresa_id        uuid         not null,
  gmail_thread_id   text         not null,
  gmail_message_id  text         not null,
  asunto            text         null,
  remitente         text         null,
  fecha             timestamptz  not null,
  snippet           text         null,
  analizado         boolean      not null default false,
  creado_en         timestamptz  not null default now()
);


-- ---------------------------------------------------------------------------
-- B.6  debug_logs            (1 uso; SIN tipo en lib/types.ts)
--      Insert temporal de depuracion en app/api/preparacion/route.ts:536.
--      ⚠️ Tabla temporal de debugging — evaluar si eliminar
--      [VERIFICADO 2.1] columnas / [PENDIENTE 2.2-2.3] PK, indices
--      id es int8 sin default: probablemente GENERATED AS IDENTITY o un
--      serial, pero information_schema no lo distingue aca. Falta 2.2.
--      empresa_id es TEXT, no uuid: no puede tener FK a empresas.
-- ---------------------------------------------------------------------------
create table debug_logs (
  id          bigint       not null,
  endpoint    text         null,
  empresa_id  text         null,   -- text, no uuid: sin FK posible
  datos       jsonb        null,
  created_at  timestamptz  null default now()   -- rompe la convencion creado_en
);


-- ---------------------------------------------------------------------------
-- B.7  evaluaciones_semanales (3 usos; tipo EvaluacionSemanal, types.ts:687)
--      campos segun TS: id, semana_inicio, semana_fin, resumen_ia?,
--                       tasa_cumplimiento?, tasa_conversion?, fortalezas?,
--                       areas_mejora?, recomendaciones? (jsonb), creado_en
-- [PENDIENTE: consulta 2.1 llego cortada - falta CREATE TABLE real]
--
-- B.8  integraciones         (7 usos; tipo Integracion, lib/types.ts:749)
--      campos segun TS: id, tipo, access_token, refresh_token?, email?, activo,
--                       expira_en?, creado_en, actualizado_en
--      ⚠️ access_token y refresh_token se guardan en texto plano — revisar
--      RLS y encriptación
--      Verificar RLS con la consulta extra del plan M0 antes de dar por
--      buena esta tabla.
-- [PENDIENTE: consulta 2.1 llego cortada - falta CREATE TABLE real]
--
-- B.9  misiones_diarias      (7 usos; tipo MisionDiaria, lib/types.ts:671)
--      campos segun TS: id, empresa_id, fecha, accion_sugerida, resultado?,
--                       detalle_vendedor?, feedback_ia?, creado_en
--      OJO: resultado es ResultadoMision en TS - probable CHECK en la BD.
-- [PENDIENTE: consulta 2.1 llego cortada - falta CREATE TABLE real]
--
-- B.10 rendimiento_ejecutivo (2 usos; tipo RendimientoEjecutivo, types.ts:704)
--      campos segun TS: id (siempre 1 - fila unica), score_actual, racha_record,
--                       tasa_cumplimiento_historica, tasa_conversion_historica,
--                       canal_mas_efectivo?, tecnica_mas_efectiva?, ultimo_calculo?
--      OJO: el patron "fila unica" sugiere CHECK (id = 1), igual que
--           contexto_exportable en schema.sql:209.
-- [PENDIENTE: consulta 2.1 llego cortada - falta CREATE TABLE real]


-- ===========================================================================
-- SECCION C - LAS 11 COLUMNAS SIN DDL EN EL REPO
-- ===========================================================================
--
-- Columnas que el codigo lee y escribe pero que no tienen CREATE ni ALTER en
-- ningun .sql del repositorio. Verificado: 0 archivos de supabase/ las define.
-- ('resuelta' aparece solo dentro de un comentario de add_no_realizada.sql,
--  nunca como definicion.)
--
--   interacciones.resuelta                  <- CRITICA: es el filtro central de
--                                              las tareas pendientes de /hoy
--   interacciones.badge_estado
--   interacciones.decision_sugerida
--   contactos.verificado
--   metricas_diarias.prioridades_cache
--   metricas_diarias.prioridades_generadas_en
--   metricas_diarias.notas_dia
--   empresas.conversacion_pausada_at
--   empresas.meddic
--   empresas.valor_estimado_clp
--   empresas.angulo_entrada
--
-- [PENDIENTE: tipos y defaults reales - consulta 3 del plan M0]
--
-- Estas columnas se formalizan en M5 con ALTER TABLE ... ADD COLUMN IF NOT
-- EXISTS, que seran no-ops contra la BD viva. Existen para que el repo pueda
-- reconstruir el esquema desde cero.


-- ===========================================================================
-- COMO COMPLETAR ESTE ARCHIVO
-- ===========================================================================
--
-- 1. Correr la consulta 2.1 para las 4 tablas que faltan (B.7 a B.10).
-- 2. Correr las consultas 2.2 (constraints) y 2.3 (indices) para las 10, y
--    agregar PK, FK con su ON DELETE, UNIQUE, CHECK e indices a cada
--    CREATE TABLE de la Seccion B.
-- 3. Correr la consulta 3 y completar la Seccion C con tipos y defaults.
-- 4. Correr la consulta 1.2 (pg_constraint sobre empresas) y quitar de la
--    Seccion A la nota "Estado del CHECK: DESCONOCIDO".
-- 5. Los avisos [VERIFICADO] / [PENDIENTE] se van borrando a medida que cada
--    bloque queda respaldado por introspeccion real.
-- 6. El encabezado NO EJECUTAR se queda. Siempre.
