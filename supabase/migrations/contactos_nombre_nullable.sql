-- Permite nombre = NULL en contactos sugeridos sin persona real todavía.
-- Antes se duplicaba el cargo en nombre como placeholder (bug de datos:
-- confundía al vendedor al editar y terminaba invirtiendo cargo/nombre).
ALTER TABLE contactos ALTER COLUMN nombre DROP NOT NULL;
