-- Agrega no_realizada a interacciones y prioridades_diarias.
-- Permite distinguir "Hecho" (resuelta=true, no_realizada=false)
-- de "No realizado" (resuelta=true, no_realizada=true).
-- El query de tareas_pendientes filtra por resuelta=false,
-- así que ambos estados desaparecen de la lista correctamente.
ALTER TABLE interacciones
  ADD COLUMN IF NOT EXISTS no_realizada boolean NOT NULL DEFAULT false;

ALTER TABLE prioridades_diarias
  ADD COLUMN IF NOT EXISTS no_realizada boolean NOT NULL DEFAULT false;
