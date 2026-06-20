-- Agrega campo remitente para distinguir mensajes del vendedor vs respuestas del prospecto.
-- Filas con parent_id existentes son respuestas del prospecto (flujo anterior a este campo).
ALTER TABLE interacciones ADD COLUMN IF NOT EXISTS remitente text DEFAULT 'vendedor';
UPDATE interacciones SET remitente = 'prospecto' WHERE parent_id IS NOT NULL;
