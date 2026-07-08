-- =============================================================
-- Tabla prioridades_diarias
-- Registro persistente de cada prioridad generada por la IA,
-- con estado de ejecución. Permite carry-over automático a la
-- sección "Vencidas" del día siguiente sin lógica de cron.
-- =============================================================

create table if not exists prioridades_diarias (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre_empresa text not null,
  industria text,
  score integer not null,
  razon text not null,
  accion_sugerida text not null,
  urgencia text not null check (urgencia in ('alta','media','baja')),
  completada boolean not null default false,
  completada_en timestamptz,
  interaccion_id uuid references interacciones(id) on delete set null,
  creado_en timestamptz not null default now(),
  unique (fecha, empresa_id)
);

-- Índice parcial para consultas rápidas de pendientes (fecha + completada=false)
create index if not exists idx_prioridades_diarias_pendientes
  on prioridades_diarias (fecha) where completada = false;

create index if not exists idx_prioridades_diarias_empresa
  on prioridades_diarias (empresa_id);

-- RLS: misma política que el resto de tablas del proyecto (service role key)
-- No se necesita RLS extra porque la app usa SUPABASE_SERVICE_ROLE_KEY
