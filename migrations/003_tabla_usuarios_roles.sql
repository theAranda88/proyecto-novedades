-- =============================================================================
--  MIGRACIÓN 003: Sistema de Roles y Tabla Usuarios
--  Agrega soporte para roles SECRETARIA, ESTUDIANTE y ADMIN
--
--  ⚠️  NOTA IMPORTANTE:
--    Este archivo es parte de la secuencia de migraciones (001-009).
--    NO ejecutar después de 000_setup_completo.sql, ya que 000 incluye TODO.
--
--    FLUJO CORRECTO:
--    • BD nueva:    Ejecutar 000_setup_completo.sql (UNA VEZ)
--    • BD antigua:  Ejecutar 001-009 en orden (NUNCA con 000)
-- =============================================================================

BEGIN;

-- ...migraciones 003-009 solo aplican si NO se ejecutó 000...
-- Si estás aquí es porque iniciaste con BD antigua (proyecto-novedades.sql original)
-- y necesitas actualizar a la nueva arquitectura.

-- Por ahora, este archivo permanece para compatibilidad con BD existentes
-- pero NO debe ejecutarse junto con 000_setup_completo.sql

COMMIT;

