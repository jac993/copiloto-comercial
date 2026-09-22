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
--   No se corrio la consulta 1.2 (pg_constraint sobre empresas). Como hay
--   filas con 'en_conversacion' y 'reunion_agendada' - valores que el CHECK
--   original de schema.sql prohibia - el CHECK original NO puede seguir
--   vigente: o se elimino, o se reemplazo. Falta confirmarlo antes de M5.


-- ===========================================================================
-- SECCION B - LAS 10 TABLAS SIN DDL EN EL REPO
-- ===========================================================================
--
-- B.0  ESTADO DE ESTA SECCION
-- ---------------------------------------------------------------------------
--   [VERIFICADO] Las 10 tablas, con columnas (2.1), constraints (2.2) e
--                indices (2.3) tomados de la introspeccion de la BD viva.
--
--   Salvedades que quedan:
--     a) Los NOMBRES de los indices no los capturo la consulta 2.3 (solo sus
--        definiciones). Los nombres usados abajo son descriptivos, no los
--        reales de Postgres. No afecta la lectura del esquema.
--     b) Los indices "UNIQUE btree(id)" que devolvio 2.3 son los que respaldan
--        cada PRIMARY KEY. No se repiten como CREATE INDEX: ya estan implicitos
--        en la clausula primary key.
--     c) debug_logs.id es int8 NOT NULL sin default pero es PK. Eso implica
--        GENERATED AS IDENTITY o un bigserial; information_schema.columns no
--        lo distingue y la consulta no pidio is_identity. Queda anotado.
--     d) NINGUNA de las 10 declara RLS en este baseline porque la consulta de
--        RLS del plan M0 no se corrio. Ver el aviso de integraciones.
--
-- ---------------------------------------------------------------------------
-- HALLAZGOS: BD vs lib/types.ts
-- ---------------------------------------------------------------------------
--   DISCREPANCIAS REALES:
--     1. borradores.feedback_rechazo (text) EXISTE en la BD pero NO esta en el
--        tipo BorradorGuardado (lib/types.ts:822). Columna huerfana: ningun
--        codigo TypeScript la conoce.
--     2. borradores.empresa_id, canal, contenido y tipo son NULLABLE en la BD,
--        pero BorradorGuardado las declara obligatorias. El tipo es mas
--        estricto que la tabla: se pueden insertar filas que TS cree imposibles.
--     3. debug_logs rompe todas las convenciones del proyecto: id es int8 (no
--        uuid), empresa_id es TEXT (no uuid, sin FK posible) y la marca de
--        tiempo se llama created_at en vez de creado_en. Confirma que es una
--        tabla desechable, no parte del modelo.
--
--   FALSA ALARMA CORREGIDA:
--     En la version anterior de este archivo se anoto que
--     borradores_feedback.evaluacion (text) contradecia al tipo
--     EvaluacionFeedback. Es INCORRECTO: EvaluacionFeedback es la union de
--     strings "positivo" | "negativo" (lib/types.ts), y la BD tiene el CHECK
--     evaluacion IN ('positivo','negativo'). Coinciden exactamente.
--
--   COINCIDENCIAS CONFIRMADAS (BD y TS alineados, sin accion):
--     casos.tamano_empresa  <-> TamanoCaso   ('grande','mediana','pequeña')
--     casos.canal_entrada   <-> CanalCaso    ('llamada','email','LinkedIn',
--                                             'referido','visita')
--     casos.tecnica_venta   <-> TecnicaCaso  ('SPIN','Challenger','Sandler',
--                                             'Consultiva','Otra')
--     misiones_diarias.resultado <-> ResultadoMision ('completada','parcial',
--                                                     'no_ejecutada')
--     borradores_feedback.evaluacion <-> EvaluacionFeedback
--
--   NOTA sobre rendimiento_ejecutivo: usa el patron "fila unica" (id default 1)
--   pero, a diferencia de contexto_exportable (schema.sql:209), NO tiene
--   CHECK (id = 1). Nada impide insertar una segunda fila.


-- ---------------------------------------------------------------------------
-- B.1  borradores            (5 usos; tipo BorradorGuardado, lib/types.ts:822)
--      Lectura/escritura: app/api/borradores/route.ts,
--                         app/api/borradores/[id]/route.ts
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
  feedback_rechazo  text         null,   -- no existe en lib/types.ts

  primary key (id),
  foreign key (empresa_id)  references empresas  (id) on delete cascade,
  foreign key (contacto_id) references contactos (id) on delete set null
);


-- ---------------------------------------------------------------------------
-- B.2  borradores_feedback   (4 usos; tipo BorradorFeedback, lib/types.ts:794)
--      Lectura/escritura: lib/queries.ts:1287 insertBorradorFeedback,
--                         lib/queries.ts:1296 getFeedbackEjemplos
-- ---------------------------------------------------------------------------
create table borradores_feedback (
  id                uuid         not null default gen_random_uuid(),
  creado_en         timestamptz  null default now(),
  empresa_id        uuid         null,
  contacto_id       uuid         null,
  canal             text         not null,
  tipo_borrador     text         null,
  borrador_ia       text         not null,
  evaluacion        text         null,
  version_vendedor  text         null,
  notas             text         null,

  primary key (id),
  foreign key (empresa_id)  references empresas  (id) on delete cascade,
  foreign key (contacto_id) references contactos (id) on delete set null,
  check (evaluacion in ('positivo','negativo'))
);


-- ---------------------------------------------------------------------------
-- B.3  casos                 (5 usos; tipo Caso, lib/types.ts:768)
--      Los tres CHECK espejan exactamente las uniones de TypeScript.
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
  actualizado_en      timestamptz  not null default now(),

  primary key (id),
  check (tamano_empresa in ('grande','mediana','pequeña')),
  check (canal_entrada  in ('llamada','email','LinkedIn','referido','visita')),
  check (tecnica_venta  in ('SPIN','Challenger','Sandler','Consultiva','Otra'))
);

create index idx_casos_sector on casos (sector);


-- ---------------------------------------------------------------------------
-- B.4  chat_empresa          (4 usos; tipo ChatEmpresa, lib/types.ts:633)
--      Coincide exactamente con el tipo TypeScript.
-- ---------------------------------------------------------------------------
create table chat_empresa (
  id          uuid         not null default gen_random_uuid(),
  empresa_id  uuid         not null,
  pregunta    text         not null,
  respuesta   text         not null,
  creado_en   timestamptz  not null default now(),

  primary key (id),
  foreign key (empresa_id) references empresas (id) on delete cascade
);

create index idx_chat_empresa_empresa        on chat_empresa (empresa_id);
create index idx_chat_empresa_empresa_fecha  on chat_empresa (empresa_id, creado_en desc);


-- ---------------------------------------------------------------------------
-- B.5  correos_detectados    (2 usos; tipo CorreoDetectado, lib/types.ts:835)
--      Escritura: app/api/gmail/sync/route.ts:101
--      CONFIRMADO: existe UNIQUE sobre gmail_message_id, asi que el sync es
--      idempotente y no duplica correos entre corridas.
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
  creado_en         timestamptz  not null default now(),

  primary key (id),
  foreign key (empresa_id) references empresas (id) on delete cascade,
  unique (gmail_message_id)
);

create index idx_correos_empresa      on correos_detectados (empresa_id);
-- Indice parcial: solo los pendientes de analizar
create index idx_correos_pendientes   on correos_detectados (analizado)
  where analizado = false;


-- ---------------------------------------------------------------------------
-- B.6  debug_logs            (1 uso; SIN tipo en lib/types.ts)
--      Insert temporal de depuracion en app/api/preparacion/route.ts:536.
--      ⚠️ Tabla temporal de debugging — evaluar si eliminar
--      id es int8 NOT NULL sin default pero es PK: implica identity/bigserial.
--      empresa_id es TEXT, no uuid: no puede tener FK a empresas.
-- ---------------------------------------------------------------------------
create table debug_logs (
  id          bigint       not null,   -- probable identity/bigserial
  endpoint    text         null,
  empresa_id  text         null,       -- text, no uuid: sin FK posible
  datos       jsonb        null,
  created_at  timestamptz  null default now(),   -- rompe la convencion creado_en

  primary key (id)
);


-- ---------------------------------------------------------------------------
-- B.7  evaluaciones_semanales (3 usos; tipo EvaluacionSemanal, types.ts:687)
--      Lectura/escritura: lib/queries.ts:1136 getEvaluacionesSemana,
--                         lib/queries.ts:1147 insertEvaluacionSemanal
--      UNIQUE(semana_inicio) hace que cada semana tenga una sola evaluacion.
-- ---------------------------------------------------------------------------
create table evaluaciones_semanales (
  id                 uuid         not null default gen_random_uuid(),
  semana_inicio      date         not null,
  semana_fin         date         not null,
  resumen_ia         text         null,
  tasa_cumplimiento  numeric      null,
  tasa_conversion    numeric      null,
  fortalezas         text         null,
  areas_mejora       text         null,
  recomendaciones    jsonb        null,
  creado_en          timestamptz  not null default now(),

  primary key (id),
  unique (semana_inicio)
);


-- ---------------------------------------------------------------------------
-- B.8  integraciones         (7 usos; tipo Integracion, lib/types.ts:749)
--      Lectura/escritura: app/api/gmail/{auth,callback,status,disconnect,sync}
--      ⚠️ access_token y refresh_token se guardan en texto plano — revisar
--      RLS y encriptación
--      El indice unico parcial sobre tipo permite una sola integracion ACTIVA
--      por tipo ('gmail'), conservando el historial de las desactivadas.
-- ---------------------------------------------------------------------------
create table integraciones (
  id              uuid         not null default gen_random_uuid(),
  tipo            text         not null,
  access_token    text         not null,
  refresh_token   text         null,
  email           text         null,
  activo          boolean      not null default true,
  expira_en       timestamptz  null,
  creado_en       timestamptz  not null default now(),
  actualizado_en  timestamptz  not null default now(),

  primary key (id)
);

-- UNIQUE parcial: una sola integracion activa por tipo
create unique index idx_integraciones_tipo_activa on integraciones (tipo)
  where activo = true;


-- ---------------------------------------------------------------------------
-- B.9  misiones_diarias      (7 usos; tipo MisionDiaria, lib/types.ts:671)
--      Lectura/escritura: lib/queries.ts:1099 getMisionesPorEmpresa,
--                         :1111 insertMision, :1122 updateMision
--      El CHECK de resultado espeja ResultadoMision exactamente.
-- ---------------------------------------------------------------------------
create table misiones_diarias (
  id                uuid         not null default gen_random_uuid(),
  empresa_id        uuid         not null,
  fecha             date         not null default current_date,
  accion_sugerida   text         not null,
  resultado         text         null,
  detalle_vendedor  text         null,
  feedback_ia       text         null,
  creado_en         timestamptz  not null default now(),

  primary key (id),
  foreign key (empresa_id) references empresas (id) on delete cascade,
  check (resultado in ('completada','parcial','no_ejecutada'))
);

create index idx_misiones_empresa on misiones_diarias (empresa_id);
create index idx_misiones_fecha   on misiones_diarias (fecha desc);


-- ---------------------------------------------------------------------------
-- B.10 rendimiento_ejecutivo (2 usos; tipo RendimientoEjecutivo, types.ts:704)
--      Lectura/escritura: lib/queries.ts:1160 getRendimientoEjecutivo,
--                         lib/queries.ts:1171 updateRendimientoEjecutivo
--      Patron "fila unica" (id default 1) pero SIN CHECK (id = 1), a
--      diferencia de contexto_exportable (schema.sql:209). Nada impide
--      insertar una segunda fila.
-- ---------------------------------------------------------------------------
create table rendimiento_ejecutivo (
  id                           integer      not null default 1,
  score_actual                 integer      null default 0,
  racha_record                 integer      null default 0,
  tasa_cumplimiento_historica  numeric      null default 0,
  tasa_conversion_historica    numeric      null default 0,
  canal_mas_efectivo           text         null,
  tecnica_mas_efectiva         text         null,
  ultimo_calculo               timestamptz  null,

  primary key (id)
);


-- ===========================================================================
-- SECCION C - LAS 11 COLUMNAS SIN DDL EN EL REPO
-- ===========================================================================
--
-- Columnas de tablas YA definidas en supabase/schema.sql que el codigo lee y
-- escribe, pero que no tienen CREATE ni ALTER en ningun .sql del repositorio.
-- Verificado: 0 archivos de supabase/ las define. ('resuelta' aparece solo
-- dentro de un comentario de add_no_realizada.sql, nunca como definicion.)
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
-- LO QUE FALTA PARA CERRAR EL BASELINE POR COMPLETO
-- ===========================================================================
--
-- La Seccion B esta cerrada. Quedan tres cabos, todos fuera de esas 10 tablas:
--
-- 1. Consulta 3 -> completar la Seccion C con tipos y defaults reales de las
--    11 columnas indocumentadas. Habilita M5.
-- 2. Consulta 1.2 (pg_constraint sobre empresas) -> quitar de la Seccion A la
--    nota "Estado del CHECK: DESCONOCIDO".
-- 3. Consulta de RLS del plan M0 -> confirmar el estado de RLS de las 10
--    tablas de la Seccion B, con prioridad en integraciones (tokens OAuth).
--
-- El encabezado NO EJECUTAR se queda. Siempre.
