-- =============================================================
-- Sistema de cadencias de seguimiento por reglas (sin IA).
-- Ejecutada por el usuario en Supabase el 2026-07-13.
-- Plantillas (cadencias + pasos con fallback de canal) y
-- asignaciones por empresa+decisor. Las tareas de cada paso
-- viven en interacciones vía cadencia_asignacion_id.
-- =============================================================

create table cadencias (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  etapa_pipeline text not null check (etapa_pipeline in
                   ('prospecto','contactado','en_conversacion','reunion_agendada','cotizado','perdido')),
  activa         boolean not null default true,
  creado_en      timestamptz not null default now()
);

create table cadencia_pasos (
  id             uuid primary key default gen_random_uuid(),
  cadencia_id    uuid not null references cadencias(id) on delete cascade,
  orden          int not null,
  dia_offset     int not null,          -- días hábiles desde el paso anterior
  canal          text not null check (canal in ('whatsapp','correo','linkedin','llamada')),
  canal_fallback text[] not null default '{}',  -- cascada ordenada
  omitible       boolean not null default false,
  intencion      text not null,          -- se inyecta al prompt del borrador
  unique (cadencia_id, orden)
);

create table cadencia_asignaciones (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  contacto_id   uuid not null references contactos(id) on delete cascade,
  cadencia_id   uuid not null references cadencias(id),
  fecha_inicio  date not null,
  paso_actual   int not null default 1,
  estado        text not null default 'activa' check (estado in
                  ('activa','pausada','completada','cancelada')),
  motivo_cierre text check (motivo_cierre in ('respondio','manual','agotada')),
  creado_en     timestamptz not null default now()
);

-- Máximo UNA asignación activa por empresa
create unique index idx_asignacion_activa_unica
  on cadencia_asignaciones (empresa_id) where estado = 'activa';

alter table interacciones
  add column if not exists cadencia_asignacion_id uuid
  references cadencia_asignaciones(id) on delete set null;

-- ── Seed: 3 cadencias ─────────────────────────────────────────
with c1 as (
  insert into cadencias (nombre, etapa_pipeline) values ('Frío estándar', 'prospecto') returning id
)
insert into cadencia_pasos (cadencia_id, orden, dia_offset, canal, canal_fallback, omitible, intencion)
select id, orden, dia_offset, canal, fallback::text[], omitible, intencion from c1, (values
  (1, 0, 'correo',   '{linkedin}',        false, 'Apertura SPIN Estado 1: pregunta abierta sobre un quiebre operacional concreto (etiquetas que se despegan, quiebres de stock, demoras de proveedor)'),
  (2, 3, 'linkedin', '{correo}',          true,  'Solicitud de conexión + nota breve mencionando algo específico de la empresa, sin pitch'),
  (3, 3, 'llamada',  '{whatsapp,correo}', false, 'Intento de contacto directo, referencia liviana al toque anterior'),
  (4, 4, 'correo',   '{linkedin}',        true,  'Aporte de valor: dato de industria o caso similar, sin pedir nada'),
  (5, 6, 'correo',   '{}',                false, 'Break-up elegante: cerrar el loop dejando la puerta abierta')
) as p(orden, dia_offset, canal, fallback, omitible, intencion);

with c2 as (
  insert into cadencias (nombre, etapa_pipeline) values ('Post-cotización', 'cotizado') returning id
)
insert into cadencia_pasos (cadencia_id, orden, dia_offset, canal, canal_fallback, omitible, intencion)
select id, orden, dia_offset, canal, fallback::text[], omitible, intencion from c2, (values
  (1, 2, 'correo',  '{linkedin}',        false, 'Confirmar recepción + ofrecer resolver dudas técnicas (pregunta de proceso, no de presión)'),
  (2, 4, 'llamada', '{whatsapp,correo}', false, 'Conversación sobre timeline de decisión y quién más participa (MEDDIC: proceso de decisión)'),
  (3, 6, 'correo',  '{}',                false, 'Pregunta directa sobre estado: ¿sigue vigente el proyecto o cambió la prioridad?')
) as p(orden, dia_offset, canal, fallback, omitible, intencion);

with c3 as (
  insert into cadencias (nombre, etapa_pipeline) values ('Reactivación', 'perdido') returning id
)
insert into cadencia_pasos (cadencia_id, orden, dia_offset, canal, canal_fallback, omitible, intencion)
select id, orden, dia_offset, canal, fallback::text[], omitible, intencion from c3, (values
  (1, 0, 'correo',   '{linkedin}', false, 'Retomar con contexto nuevo (cambio de temporada, novedad de producto, normativa) — nunca "solo hacía seguimiento"'),
  (2, 7, 'linkedin', '{correo}',   true,  'Interacción liviana: comentar publicación de la empresa o compartir contenido relevante'),
  (3, 8, 'correo',   '{}',         false, 'Última pregunta abierta: ¿el tema sigue en agenda para este semestre?')
) as p(orden, dia_offset, canal, fallback, omitible, intencion);
