-- =============================================================
-- empresas.estado_desde — fecha en que la empresa entró a su
-- estado actual del pipeline. Base del cálculo "días en etapa"
-- y de las alertas de enfriamiento (lib/enfriamiento.ts).
--
-- Mantenimiento: PATCH /api/empresas/[id]/estado la actualiza
-- solo cuando el estado realmente cambia. La creación de empresas
-- la setea explícitamente con hoyCL().
--
-- Backfill (aproximación acordada): fecha de la última interacción;
-- si la empresa no tiene interacciones, su fecha de creación.
-- Preview validado el 2026-07-19 contra las 14 empresas existentes.
-- =============================================================

alter table empresas
  add column if not exists estado_desde date;

update empresas e
set estado_desde = coalesce(
  (select max(i.fecha)::date from interacciones i where i.empresa_id = e.id),
  e.creado_en::date
)
where e.estado_desde is null;
