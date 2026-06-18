-- Agrega columna nombre_comercial a la tabla empresas.
-- Nullable: solo se guarda cuando el usuario lo ingresa explícitamente.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS nombre_comercial text;
