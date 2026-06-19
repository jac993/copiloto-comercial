-- =============================================================
-- Migración: agregar columnas faltantes en tabla "empresas"
-- Ejecutar en Supabase → SQL Editor
-- Todas las sentencias usan IF NOT EXISTS para ser idempotentes.
-- =============================================================

-- ── Columnas de identidad / datos básicos ─────────────────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS razon_social       TEXT,
  ADD COLUMN IF NOT EXISTS rut                TEXT,
  ADD COLUMN IF NOT EXISTS url                TEXT,
  ADD COLUMN IF NOT EXISTS industria          TEXT,
  ADD COLUMN IF NOT EXISTS descripcion_ia     TEXT,
  ADD COLUMN IF NOT EXISTS productos_que_compraria TEXT,
  ADD COLUMN IF NOT EXISTS tamano_estimado    TEXT,
  ADD COLUMN IF NOT EXISTS region             TEXT;

-- ── Estado del pipeline comercial ────────────────────────────
-- Enum de estados posibles (ignorar si ya existe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_empresa') THEN
    CREATE TYPE estado_empresa AS ENUM (
      'prospecto',
      'contactado',
      'en_conversacion',
      'reunion_agendada',
      'cotizado',
      'ganado',
      'perdido'
    );
  END IF;
END$$;

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS estado             estado_empresa NOT NULL DEFAULT 'prospecto';

-- ── Campos de priorización y seguimiento ─────────────────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS razon_de_contacto_actual TEXT,
  ADD COLUMN IF NOT EXISTS score_prioridad          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notas_vendedor           TEXT,
  ADD COLUMN IF NOT EXISTS razon_perdido            TEXT,
  ADD COLUMN IF NOT EXISTS fecha_reactivacion       DATE;

-- ── Ficha IA (JSON completo generado por Claude) ──────────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS ficha_ia           JSONB;

-- ── Datos crudos de Perplexity (búsqueda web) ─────────────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS busqueda_web_raw   JSONB,
  ADD COLUMN IF NOT EXISTS busqueda_web_analisis JSONB;

-- ── Timestamps (generados automáticamente) ───────────────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now();

-- Trigger para mantener actualizado_en sincronizado
CREATE OR REPLACE FUNCTION set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_empresas_actualizado_en ON empresas;
CREATE TRIGGER trg_empresas_actualizado_en
  BEFORE UPDATE ON empresas
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

-- ── Índices útiles ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_empresas_url             ON empresas (url);
CREATE INDEX IF NOT EXISTS idx_empresas_estado          ON empresas (estado);
CREATE INDEX IF NOT EXISTS idx_empresas_score_prioridad ON empresas (score_prioridad DESC);
