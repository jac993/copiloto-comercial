-- Congelamiento de prospectos ligeros ("Por calificar").
-- El vendedor decide que una empresa no vale la pena ahora y fija una fecha
-- de recontacto. Aditivo: la columna es nullable y NULL = prospecto activo,
-- así que los 18 ligeros existentes quedan en "Activos" sin tocar datos.
--
-- Semántica de las vistas (ambas en lib/queries.ts):
--   Activos    → prospecto_congelado_hasta IS NULL OR <= hoy (Chile)
--   Congelados → prospecto_congelado_hasta > hoy (Chile)
-- Al llegar la fecha de recontacto el prospecto reaparece solo en Activos:
-- no hay job ni cron, el filtro por fecha lo resuelve en cada lectura.
alter table empresas
  add column if not exists prospecto_congelado_hasta date;

-- Índice parcial: solo indexa los congelados (los activos son NULL y son
-- la mayoría). Sirve al filtro > hoy de getProspectosCongelados.
create index if not exists idx_empresas_congelado
  on empresas(prospecto_congelado_hasta)
  where prospecto_congelado_hasta is not null;
