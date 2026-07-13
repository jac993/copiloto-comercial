-- =============================================================
-- Columna motivo_fecha_sugerida en interacciones.
-- Guarda el texto corto con el que la IA justifica la fecha de
-- seguimiento (proximo_paso_fecha): sea una fecha explícita que
-- mencionó el prospecto ("pidió retomar el jueves 17") o una fecha
-- inferida por tono ("va a consultarlo internamente, dar margen de
-- una semana"). Permite mostrar el 'por qué' junto a la tarea en Hoy.
-- Nace NULL en las filas existentes; no afecta ninguna fecha previa.
-- Ejecutada por el usuario en Supabase el 2026-07-13.
-- =============================================================

alter table interacciones
  add column if not exists motivo_fecha_sugerida text;
