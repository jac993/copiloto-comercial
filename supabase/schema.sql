-- =============================================================
-- Copiloto Comercial Industrial — Esquema de base de datos
-- Pegar completo en Supabase > SQL Editor > New query
-- RLS desactivado: app de uso personal, un solo usuario
-- =============================================================


-- ─── EXTENSIONES ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ─── FUNCIÓN REUTILIZABLE: actualiza "actualizado_en" ────────
-- Se reutiliza en todos los triggers de la app
create or replace function actualizar_timestamp()
returns trigger as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$ language plpgsql;


-- ─── TABLA: empresas ─────────────────────────────────────────
create table empresas (
  id                      uuid primary key default uuid_generate_v4(),
  nombre                  text not null,
  rut                     text,
  url                     text,
  industria               text,
  descripcion_ia          text,                      -- generada por Anthropic al investigar
  productos_que_compraria text,                      -- inferido por la IA desde el sitio web
  tamano_estimado         text,                      -- "micro / pequeña / mediana / grande"
  region                  text,
  estado                  text not null default 'prospecto'
                          check (estado in (
                            'prospecto','contactado','reunion',
                            'cotizado','cliente','perdido'
                          )),
  razon_de_contacto_actual text,                     -- por qué contactar AHORA (generado por IA)
  score_prioridad         smallint default 0
                          check (score_prioridad between 0 and 100),
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now()
);

create index idx_empresas_estado        on empresas (estado);
create index idx_empresas_score         on empresas (score_prioridad desc);
create index idx_empresas_actualizado   on empresas (actualizado_en desc);

create trigger trg_empresas_actualizado
  before update on empresas
  for each row execute function actualizar_timestamp();

alter table empresas disable row level security;


-- ─── TABLA: contactos ────────────────────────────────────────
create table contactos (
  id           uuid primary key default uuid_generate_v4(),
  empresa_id   uuid not null references empresas (id) on delete cascade,
  nombre       text not null,
  cargo        text,
  area         text check (area in (
                 'adquisiciones','calidad','operaciones','gerencia','otro'
               )),
  email        text,
  telefono     text,
  linkedin_url text,
  notas_ia     text,                                 -- perfil inferido por la IA
  es_decisor   boolean not null default false,
  creado_en    timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index idx_contactos_empresa    on contactos (empresa_id);
create index idx_contactos_decisor    on contactos (empresa_id, es_decisor);

create trigger trg_contactos_actualizado
  before update on contactos
  for each row execute function actualizar_timestamp();

alter table contactos disable row level security;


-- ─── TABLA: interacciones ─────────────────────────────────────
create table interacciones (
  id                uuid primary key default uuid_generate_v4(),
  empresa_id        uuid not null references empresas (id) on delete cascade,
  contacto_id       uuid references contactos (id) on delete set null,
  tipo              text not null check (tipo in (
                      'llamada','reunion','email','whatsapp'
                    )),
  fecha             timestamptz not null default now(),
  audio_url         text,                            -- ruta en Supabase Storage
  transcripcion     text,                            -- generada por Whisper
  resumen_ia        text,                            -- generado por Anthropic
  compromisos       jsonb,                           -- array de {descripcion, responsable, fecha}
  sentimiento       text check (sentimiento in ('positivo','neutro','negativo')),
  tecnica_usada     text,                            -- consultiva / SPIN / challenger / relacional
  coaching_ia       text,                            -- feedback post-llamada de Anthropic
  proximo_paso      text,
  proximo_paso_fecha date,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

create index idx_interacciones_empresa  on interacciones (empresa_id, fecha desc);
create index idx_interacciones_contacto on interacciones (contacto_id);
create index idx_interacciones_tipo     on interacciones (tipo);
create index idx_interacciones_fecha    on interacciones (fecha desc);

create trigger trg_interacciones_actualizado
  before update on interacciones
  for each row execute function actualizar_timestamp();

alter table interacciones disable row level security;


-- ─── TABLA: senales ──────────────────────────────────────────
create table senales (
  id           uuid primary key default uuid_generate_v4(),
  empresa_id   uuid not null references empresas (id) on delete cascade,
  tipo         text not null check (tipo in (
                 'lanzamiento_producto','cambio_ejecutivo',
                 'importacion','licitacion','otro'
               )),
  descripcion  text not null,
  fuente_url   text,
  detectada_en timestamptz not null default now(),
  usada        boolean not null default false        -- true cuando se usó para contactar
);

create index idx_senales_empresa  on senales (empresa_id, detectada_en desc);
create index idx_senales_usada    on senales (usada, detectada_en desc);

alter table senales disable row level security;


-- ─── TABLA: aprendizajes ─────────────────────────────────────
-- Memoria permanente del vendedor: patrones que el sistema descubre
-- y acumula con cada análisis de llamada o interacción registrada
create table aprendizajes (
  id                uuid primary key default uuid_generate_v4(),
  tipo              text not null check (tipo in (
                      'tecnica_exitosa','objecion_frecuente',
                      'mensaje_efectivo','perfil_cliente','patron_conversion'
                    )),
  descripcion       text not null,
  evidencia         text,                            -- qué interacciones respaldan esto
  industria_cliente text,
  cargo_contacto    text,
  tecnica_asociada  text,
  veces_confirmado  int not null default 1,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

create index idx_aprendizajes_tipo    on aprendizajes (tipo, activo);
create index idx_aprendizajes_cargo   on aprendizajes (cargo_contacto, activo);
create index idx_aprendizajes_conf    on aprendizajes (veces_confirmado desc) where activo = true;

create trigger trg_aprendizajes_actualizado
  before update on aprendizajes
  for each row execute function actualizar_timestamp();

alter table aprendizajes disable row level security;


-- ─── TABLA: patrones_conversion ──────────────────────────────
-- Se recalcula semanalmente midiendo qué convierte en el pipeline real
create table patrones_conversion (
  id              uuid primary key default uuid_generate_v4(),
  etapa_origen    text not null,                     -- estado de empresas
  etapa_destino   text not null,
  tasa_conversion decimal(5,2),                      -- 0.00 a 100.00
  tecnica_usada   text,
  industria       text,
  cargo_contacto  text,
  n_casos         int not null default 0,
  periodo_inicio  date,
  periodo_fin     date,
  actualizado_en  timestamptz not null default now()
);

create index idx_patrones_etapas on patrones_conversion (etapa_origen, etapa_destino);

alter table patrones_conversion disable row level security;


-- ─── TABLA: metricas_diarias ─────────────────────────────────
create table metricas_diarias (
  fecha                  date primary key,
  contactos_hechos       int not null default 0,
  reuniones_logradas     int not null default 0,
  cotizaciones_enviadas  int not null default 0,
  negocios_ganados       int not null default 0,
  meta_cumplida          boolean not null default false,
  racha_dias             int not null default 0,
  notas_dia              text
);

alter table metricas_diarias disable row level security;


-- ─── TABLA: contexto_exportable ──────────────────────────────
-- Una sola fila (id = 1). Snapshot del estado completo de la app.
-- Sirve para exportar contexto a Claude.ai o a cualquier conversación de IA.
create table contexto_exportable (
  id             int primary key default 1
                 check (id = 1),                     -- fuerza fila única
  generado_en    timestamptz not null default now(),
  resumen_json   jsonb not null default '{}'::jsonb
);

-- Fila única inicializada vacía
insert into contexto_exportable (id, resumen_json)
values (1, '{"empresas":[],"aprendizajes":[],"patrones":[],"metricas":{}}')
on conflict (id) do nothing;

alter table contexto_exportable disable row level security;


-- ─── VERIFICACIÓN FINAL ──────────────────────────────────────
-- Ejecuta esto al final para confirmar que las 8 tablas existen:
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'empresas','contactos','interacciones','senales',
    'aprendizajes','patrones_conversion','metricas_diarias','contexto_exportable'
  )
order by table_name;
