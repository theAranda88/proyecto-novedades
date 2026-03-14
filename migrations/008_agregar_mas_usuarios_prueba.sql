-- =============================================================================
--  MIGRACIÓN 008 — Agregar más usuarios de prueba con inscripciones activas
--  Objetivo: Tener suficientes datos para probar solicitudes sin errores 422
--  Fecha: 2026-03-14
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. AGREGAR MÁS ESTUDIANTES
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO estudiantes (codigo_estudiantil, cod_alumno, doc_alumno, nombre_completo,
                         email_institucional, correo_institucional,
                         semestre_actual, programa_id, matricula_activa,
                         jornada, creditos_inscritos, creditos_max_permitidos, estado_academico)
SELECT
    e.codigo_estud, e.cod_alumno, e.doc_alumno, e.nombre_completo,
    e.email, e.email,
    e.semestre, p.id_programa, e.activa,
    e.jornada, e.cred_ins, e.cred_max, e.estado
FROM (VALUES
    ('2024003', '2024003', 'CC-1003', 'Juan Carlos Martínez García',    'jmartinez@proyectonovedades.edu.co',  4, 'Ingenieria de Sistemas',    TRUE,  'manana', 12, 20, 'normal'),
    ('2024004', '2024004', 'CC-1004', 'Sofia Alejandra Ruiz Mendez',    'sruiz@proyectonovedades.edu.co',      3, 'Ingenieria Industrial',     TRUE,  'tarde',  9,  20, 'normal'),
    ('2024005', '2024005', 'CC-1005', 'Miguel Angel Peña Rodríguez',    'mpena@proyectonovedades.edu.co',      2, 'Administracion de Empresas', TRUE,  'manana', 6,  20, 'normal'),
    ('2024006', '2024006', 'CC-1006', 'Laura Patricia Sánchez López',   'lsanchez@proyectonovedades.edu.co',   5, 'Ingenieria de Sistemas',    TRUE,  'noche',  15, 20, 'normal'),
    ('2024007', '2024007', 'CC-1007', 'David Fernando Torres Castillo',  'dtorres@proyectonovedades.edu.co',    3, 'Ingenieria Industrial',     TRUE,  'tarde',  9,  20, 'bajo_rendimiento'),
    ('2024008', '2024008', 'CC-1008', 'Ana Beatriz Flores Gutierrez',   'aflores@proyectonovedades.edu.co',    6, 'Administracion de Empresas', TRUE,  'manana', 18, 20, 'normal')
) AS e(codigo_estud, cod_alumno, doc_alumno, nombre_completo, email, semestre, prog, activa, jornada, cred_ins, cred_max, estado)
JOIN programas p ON p.nombre_programa = e.prog
ON CONFLICT (codigo_estudiantil) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AGREGAR USUARIOS CORRESPONDIENTES
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_hash TEXT := '$2b$10$O0n6t62MOUyaR9kwCje46ukcojI4JUQgpAYYCzy6aVo0JJ8/KIoCC';
BEGIN

INSERT INTO usuarios (nombre_completo, email_institucional, password_hash,
                      rol, activo, codigo_estudiantil, primer_login)
VALUES
    ('Juan Carlos Martínez García',
     'jmartinez@proyectonovedades.edu.co',
     v_hash, 'ESTUDIANTE', TRUE, '2024003', FALSE),

    ('Sofia Alejandra Ruiz Mendez',
     'sruiz@proyectonovedades.edu.co',
     v_hash, 'ESTUDIANTE', TRUE, '2024004', FALSE),

    ('Miguel Angel Peña Rodríguez',
     'mpena@proyectonovedades.edu.co',
     v_hash, 'ESTUDIANTE', TRUE, '2024005', FALSE),

    ('Laura Patricia Sánchez López',
     'lsanchez@proyectonovedades.edu.co',
     v_hash, 'ESTUDIANTE', TRUE, '2024006', FALSE),

    ('David Fernando Torres Castillo',
     'dtorres@proyectonovedades.edu.co',
     v_hash, 'ESTUDIANTE', TRUE, '2024007', FALSE),

    ('Ana Beatriz Flores Gutierrez',
     'aflores@proyectonovedades.edu.co',
     v_hash, 'ESTUDIANTE', TRUE, '2024008', FALSE)

ON CONFLICT (email_institucional) DO NOTHING;

END $$;

-- Vincular nuevos usuarios con estudiantes
UPDATE estudiantes e
   SET usuario_id = u.id_usuario
  FROM usuarios u
 WHERE u.codigo_estudiantil = e.codigo_estudiantil
   AND e.usuario_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AGREGAR INSCRIPCIONES ACTIVAS PARA CADA ESTUDIANTE
--    Para que puedan hacer solicitudes sin errores
-- ─────────────────────────────────────────────────────────────────────────────

-- 2024003: Inscrito en MAT101-G01 (manana) y EST301-G01 (manana)
INSERT INTO inscripciones_activas (estudiante_id, grupo_id, periodo)
SELECT
    (SELECT ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT FROM estudiantes WHERE codigo_estudiantil = '2024003' LIMIT 1),
    g.id,
    '2026-1'
FROM grupos_curso g
JOIN cursos c ON c.id = g.curso_id
WHERE c.cod_curso IN ('MAT101', 'EST301')
  AND g.codigo_grupo = 'G-01'
  AND g.periodo = '2026-1'
ON CONFLICT (estudiante_id, grupo_id, periodo) DO NOTHING;

-- 2024004: Inscrito en PRG201-G02 (tarde) y EST301-G02 (tarde)
INSERT INTO inscripciones_activas (estudiante_id, grupo_id, periodo)
SELECT
    (SELECT ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT FROM estudiantes WHERE codigo_estudiantil = '2024004' LIMIT 1),
    g.id,
    '2026-1'
FROM grupos_curso g
JOIN cursos c ON c.id = g.curso_id
WHERE c.cod_curso IN ('PRG201', 'EST301')
  AND g.codigo_grupo = 'G-02'
  AND g.jornada = 'tarde'
  AND g.periodo = '2026-1'
ON CONFLICT (estudiante_id, grupo_id, periodo) DO NOTHING;

-- 2024005: Inscrito en MAT101-G02 (tarde) y PRG201-G02 (tarde)
INSERT INTO inscripciones_activas (estudiante_id, grupo_id, periodo)
SELECT
    (SELECT ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT FROM estudiantes WHERE codigo_estudiantil = '2024005' LIMIT 1),
    g.id,
    '2026-1'
FROM grupos_curso g
JOIN cursos c ON c.id = g.curso_id
WHERE (c.cod_curso = 'MAT101' AND g.codigo_grupo = 'G-02')
   OR (c.cod_curso = 'PRG201' AND g.codigo_grupo = 'G-02')
  AND g.periodo = '2026-1'
ON CONFLICT (estudiante_id, grupo_id, periodo) DO NOTHING;

-- 2024006: Inscrito en PRG201-G03 (noche) y MAT101-G03 (noche)
INSERT INTO inscripciones_activas (estudiante_id, grupo_id, periodo)
SELECT
    (SELECT ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT FROM estudiantes WHERE codigo_estudiantil = '2024006' LIMIT 1),
    g.id,
    '2026-1'
FROM grupos_curso g
JOIN cursos c ON c.id = g.curso_id
WHERE c.cod_curso IN ('PRG201', 'MAT101')
  AND g.jornada = 'noche'
  AND g.periodo = '2026-1'
ON CONFLICT (estudiante_id, grupo_id, periodo) DO NOTHING;

-- 2024007: Inscrito en EST301-G01 (manana)
INSERT INTO inscripciones_activas (estudiante_id, grupo_id, periodo)
SELECT
    (SELECT ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT FROM estudiantes WHERE codigo_estudiantil = '2024007' LIMIT 1),
    g.id,
    '2026-1'
FROM grupos_curso g
JOIN cursos c ON c.id = g.curso_id
WHERE c.cod_curso = 'EST301'
  AND g.codigo_grupo = 'G-01'
  AND g.periodo = '2026-1'
ON CONFLICT (estudiante_id, grupo_id, periodo) DO NOTHING;

-- 2024008: Inscrito en MAT101-G01, PRG201-G01, EST301-G01, FIS101 (manana)
INSERT INTO inscripciones_activas (estudiante_id, grupo_id, periodo)
SELECT
    (SELECT ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT FROM estudiantes WHERE codigo_estudiantil = '2024008' LIMIT 1),
    g.id,
    '2026-1'
FROM grupos_curso g
JOIN cursos c ON c.id = g.curso_id
WHERE (c.cod_curso IN ('MAT101', 'PRG201', 'EST301')
   AND g.codigo_grupo = 'G-01'
   AND g.periodo = '2026-1')
ON CONFLICT (estudiante_id, grupo_id, periodo) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACION
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
    '>>> NUEVOS USUARIOS AGREGADOS <<<' AS info;
SELECT
    u.codigo_estudiantil,
    u.nombre_completo,
    e.semestre_actual,
    p.nombre_programa,
    e.jornada,
    COUNT(ia.id) AS cursos_inscritos
FROM usuarios u
LEFT JOIN estudiantes e ON e.usuario_id = u.id_usuario
LEFT JOIN programas p ON p.id_programa = e.programa_id
LEFT JOIN inscripciones_activas ia ON ia.estudiante_id = (
    SELECT ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT
    FROM estudiantes
    WHERE codigo_estudiantil = u.codigo_estudiantil
    LIMIT 1
)
WHERE u.codigo_estudiantil IN ('2024003', '2024004', '2024005', '2024006', '2024007', '2024008')
GROUP BY u.id_usuario, u.codigo_estudiantil, u.nombre_completo, e.semestre_actual, p.nombre_programa, e.jornada
ORDER BY u.codigo_estudiantil;

COMMIT;

