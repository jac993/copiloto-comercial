-- Discriminador de prospectos ligeros ("Por calificar") vs empresas
-- completas (con ficha IA, en el pipeline). Aditivo: DEFAULT 'completo'
-- marca todas las empresas existentes como completas sin tocar datos.
alter table empresas
  add column if not exists tipo_registro text not null default 'completo'
  check (tipo_registro in ('ligero','completo'));

-- Índice para filtrar rápido las vistas de pipeline (excluir 'ligero')
create index if not exists idx_empresas_tipo_registro on empresas(tipo_registro);
