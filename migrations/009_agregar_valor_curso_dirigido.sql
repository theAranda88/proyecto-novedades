-- =============================================================================
--  MIGRACIÓN 009 — Agregar campo valor_curso_dirigido a grupos_curso
--  Propósito: Permitir establecer un precio diferente para cursos dirigidos
--  Versión: 1.0 (2026-03-14)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1: Agregar columna valor_curso_dirigido a tabla grupos_curso
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE grupos_curso
    ADD COLUMN IF NOT EXISTS valor_curso_dirigido DECIMAL(10,2) NULL
    CHECK (valor_curso_dirigido IS NULL OR valor_curso_dirigido > 0);

-- Comentario para documentación:
-- NULL = Usar arancel regular (no es modalidad dirigida o no tiene precio especial)
-- Valor > 0 = Precio especial para esta modalidad dirigida

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2: Crear índice para búsquedas rápidas de grupos con valor diferente
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_grupos_curso_valor_dirigido
    ON grupos_curso(valor_curso_dirigido)
    WHERE valor_curso_dirigido IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3: Actualizar auditoría de la tabla
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE grupos_curso
    SET updated_at = NOW()
    WHERE valor_curso_dirigido IS NOT NULL;

COMMIT;

-- =============================================================================
-- INFORMACIÓN PARA DESARROLLADORES
-- =============================================================================
--
-- Uso del campo valor_curso_dirigido:
--
-- 1. GRUPO REGULAR (sin precio especial):
--    INSERT INTO grupos_curso (..., valor_curso_dirigido)
--    VALUES (..., NULL);  -- NULL = usa arancel normal
--
-- 2. GRUPO DIRIGIDO (con precio especial):
--    INSERT INTO grupos_curso (..., valor_curso_dirigido)
--    VALUES (..., 250000);  -- COP 250,000 para este grupo
--
-- 3. CONSULTAS:
--    -- Grupos dirigidos con precio especial:
--    SELECT * FROM grupos_curso WHERE valor_curso_dirigido IS NOT NULL;
--
--    -- Grupos sin precio especial:
--    SELECT * FROM grupos_curso WHERE valor_curso_dirigido IS NULL;
--
-- 4. VALIDACIÓN EN SERVICIO:
--    En SolicitudService.validarCursoDirigido(), después del chequeo 5,
--    agregar chequeo 6 para verificar que el grupo tiene precio asignado.
--
-- =============================================================================

