-- =============================================================================
--  MIGRACIÓN 007 — Agregar columnas grupo_nuevo_id y grupo_actual_id a solicitudes
--  Objetivo: Completar la referencia de grupos_curso en solicitudes (HU_DB §4.7)
--  Fecha: 2026-03-14
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1: Agregar columnas de referencia a grupos_curso
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE solicitudes
    ADD COLUMN IF NOT EXISTS grupo_nuevo_id  INT NULL REFERENCES grupos_curso(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS grupo_actual_id INT NULL REFERENCES grupos_curso(id)
        ON UPDATE CASCADE ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2: Crear índices para consultas de validación
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_solicitudes_grupo_nuevo
    ON solicitudes(grupo_nuevo_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_solicitudes_grupo_actual
    ON solicitudes(grupo_actual_id) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3: Actualizar constraint de tipo_novedad para incluir CAMBIO_CURSO
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE solicitudes
    DROP CONSTRAINT IF EXISTS solicitudes_tipo_novedad_check;

ALTER TABLE solicitudes
    ADD CONSTRAINT solicitudes_tipo_novedad_check
    CHECK (tipo_novedad IN ('ADICION_CURSO', 'CAMBIO_JORNADA', 'CURSO_DIRIGIDO', 'CAMBIO_CURSO'));

-- ─────────────────────────────────────────────────────────────────────────────
-- FIN MIGRACIÓN 007
-- ─────────────────────────────────────────────────────────────────────────────
COMMIT;

