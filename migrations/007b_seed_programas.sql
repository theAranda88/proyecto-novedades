-- =============================================================================
--  SEED DATA — Programas Académicos
--  Ejecutar SOLO si tabla programas está vacía
--  Fecha: 2026-03-14
-- =============================================================================

BEGIN;

-- Verificar si la tabla está vacía
DO $$
DECLARE
    total_programas INT;
BEGIN
    SELECT COUNT(*) INTO total_programas FROM programas;

    IF total_programas = 0 THEN
        RAISE NOTICE 'Tabla programas vacía. Insertando seed data...';

        INSERT INTO programas (nombre_programa, codigo, facultad, activo)
        VALUES
            ('Ingeniería de Sistemas', 'PROG-001', 'Facultad de Ingeniería', TRUE),
            ('Ingeniería Civil', 'PROG-002', 'Facultad de Ingeniería', TRUE),
            ('Administración de Empresas', 'PROG-003', 'Facultad de Administración', TRUE),
            ('Contabilidad', 'PROG-004', 'Facultad de Contabilidad', TRUE),
            ('Psicología', 'PROG-005', 'Facultad de Ciencias Sociales', TRUE),
            ('Derecho', 'PROG-006', 'Facultad de Derecho', TRUE),
            ('Enfermería', 'PROG-007', 'Facultad de Salud', TRUE),
            ('Educación Física', 'PROG-008', 'Facultad de Educación', TRUE);

        RAISE NOTICE 'Se insertaron 8 programas académicos correctamente.';
    ELSE
        RAISE NOTICE 'Tabla programas ya tiene % registros. No se insertará seed data.', total_programas;
    END IF;
END;
$$;

COMMIT;

