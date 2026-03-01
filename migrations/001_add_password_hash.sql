-- =============================================================================
--  MIGRACIÓN: Agregar campo password_hash a la tabla estudiantes
--  Requerido para el módulo de autenticación con bcrypt
-- =============================================================================

BEGIN;

-- Agregar columna password_hash si no existe
ALTER TABLE estudiantes
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL DEFAULT '';

-- Actualizar contraseña de prueba para los estudiantes seed
-- Contraseña de prueba: Password123
-- Hash generado con bcrypt 10 rounds
UPDATE estudiantes
   SET password_hash = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
 WHERE password_hash = '';

-- IMPORTANTE: Este hash corresponde a la contraseña 'Password123'
-- Solo para ambiente de desarrollo/pruebas.
-- En producción cada estudiante debe tener su propia contraseña hasheada.

COMMIT;

