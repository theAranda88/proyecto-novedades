-- =============================================================================
--  MIGRACIÓN 005 — Corrección de constraints en tabla solicitudes
--  Problema: Los CHECK constraints originales son incompatibles con el
--             motor de validaciones HU_DB §5 implementado.
--  Fecha: 2026-03-07
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1: Ampliar tipo_novedad para incluir CAMBIO_CURSO y ADICION_CURSO
--         El constraint original solo tenía: ADICION, CAMBIO_JORNADA, CURSO_DIRIGIDO
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE solicitudes
    DROP CONSTRAINT IF EXISTS solicitudes_tipo_novedad_check;

ALTER TABLE solicitudes
    ADD CONSTRAINT solicitudes_tipo_novedad_check
    CHECK (tipo_novedad IN (
        'ADICION',
        'ADICION_CURSO',
        'CAMBIO_JORNADA',
        'CAMBIO_CURSO',
        'CURSO_DIRIGIDO'
    ));

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 2: Ampliar estado_solicitud para incluir EN_REVISION
--         El constraint original solo tenía: PENDIENTE, APROBADA, RECHAZADA
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE solicitudes
    DROP CONSTRAINT IF EXISTS solicitudes_estado_solicitud_check;

ALTER TABLE solicitudes
    ADD CONSTRAINT solicitudes_estado_solicitud_check
    CHECK (estado_solicitud IN (
        'PENDIENTE',
        'EN_REVISION',
        'APROBADA',
        'RECHAZADA'
    ));

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 3: Quitar la FK de id_seccion_destino → secciones
--         El sistema nuevo usa grupos_curso en lugar de secciones.
--         La FK impedía insertar con IDs de grupos_curso.
--         Se convierte en columna nullable sin FK para compatibilidad.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE solicitudes
    DROP CONSTRAINT IF EXISTS fk_solicitud_seccion_destino;

ALTER TABLE solicitudes
    DROP CONSTRAINT IF EXISTS fk_solicitud_seccion_origen;

-- Hacer la columna nullable (el grupo puede no existir en la tabla secciones antigua)
ALTER TABLE solicitudes
    ALTER COLUMN id_seccion_destino DROP NOT NULL;

-- Agregar columnas nuevas que referencian grupos_curso correctamente
ALTER TABLE solicitudes
    ADD COLUMN IF NOT EXISTS grupo_nuevo_id  INT NULL REFERENCES grupos_curso(id) ON UPDATE CASCADE ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS grupo_actual_id INT NULL REFERENCES grupos_curso(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIN MIGRACIÓN 005
-- ─────────────────────────────────────────────────────────────────────────────
COMMIT;

