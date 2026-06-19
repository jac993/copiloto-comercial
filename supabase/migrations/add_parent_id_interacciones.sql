-- Agrega parent_id a interacciones para vincular respuestas del prospecto con su mensaje original.
-- Las interacciones de resolución (ej: "Respondió al contacto") se almacenan como hijas
-- del mensaje enviado, permitiendo mostrarlas como burbujas dentro del mismo hilo.
ALTER TABLE interacciones ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES interacciones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_interacciones_parent_id ON interacciones(parent_id);
