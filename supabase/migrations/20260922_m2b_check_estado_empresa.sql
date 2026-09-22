-- =============================================================
-- M2b: Agregar CHECK real sobre empresas.estado
-- Detectado en auditoría: schema.sql tenía el CHECK documentado
-- pero nunca fue aplicado a la BD real.
-- Verificado: 0 filas con valores fuera del set permitido.
-- Es seguro aplicar.
--
-- Contexto (ver supabase/schema_baseline_20260922.sql, Sección A):
--   pg_constraint sobre empresas devolvió SOLO dos CHECK
--   (empresas_score_prioridad_check y empresas_tipo_registro_check).
--   No había ninguno sobre estado, así que hoy la columna acepta
--   cualquier texto. El CHECK inline de schema.sql:34-47 documenta
--   la intención; esta migración la hace cumplir de verdad.
--
-- Los 7 valores espejan exactamente el tipo EstadoEmpresa
-- (lib/types.ts:160). Verificado antes de escribir esta migración:
--   - Las 6 columnas del Kanban (vista-kanban.tsx:38-45) están
--     dentro del set; 'perdido' tiene su propia sección.
--   - El resto de writers usa literales del set: 'perdido'
--     (marcar-perdido-ligero:49) y 'prospecto' (promover:30,
--     reactivar-ligero:46).
--   - PATCH /api/empresas/[id]/estado no valida en runtime, así que
--     este CHECK pasa a ser la única defensa real contra un valor
--     inválido.
-- =============================================================

ALTER TABLE empresas
  ADD CONSTRAINT empresas_estado_check_real
  CHECK (estado IN (
    'prospecto',
    'contactado',
    'en_conversacion',
    'reunion_agendada',
    'cotizado',
    'ganado',
    'perdido'
  ));

-- Para aplicar: pegar en SQL Editor de Supabase y ejecutar.
-- Este proyecto no tiene CLI ni runner de migraciones: cada archivo
-- de supabase/migrations/ se ejecuta a mano (misma convención que
-- 20260713_cadencias.sql).
--
-- OJO al re-ejecutar: Postgres no soporta ADD CONSTRAINT IF NOT
-- EXISTS. Si esta migración ya corrió, pegarla de nuevo falla con
-- 42710 (constraint duplicado). Es un error inofensivo — no modifica
-- nada — pero conviene saberlo antes de asustarse.
--
-- Para revertir:
--   ALTER TABLE empresas DROP CONSTRAINT empresas_estado_check_real;
