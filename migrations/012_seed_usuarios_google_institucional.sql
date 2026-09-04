-- =============================================================================
--  MIGRACIÓN 012: Usuarios de prueba con correo institucional real
--
--  Permite probar POST /api/auth/google y POST /api/auth/login
--  mientras el sync de Campus API aún no puebla estudiantes.
--
--  Correos Workspace @uniautonoma.edu.co (ya deben existir en Google).
--  Contraseña local (vía correo): Password123
--  primer_login = FALSE, matricula_activa = TRUE
--
--  No modifica usuarios/estudiantes existentes. Idempotente (ON CONFLICT).
--  Requiere que 011 ya esté aplicada (columnas de periodo en estudiantes).
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_hash TEXT := '$2b$10$O0n6t62MOUyaR9kwCje46ukcojI4JUQgpAYYCzy6aVo0JJ8/KIoCC';
BEGIN
    INSERT INTO usuarios (
        nombre_completo, email_institucional, password_hash,
        rol, activo, codigo_estudiantil, primer_login
    )
    VALUES
        ('Cristian Aranda',
         'cristian.aranda.h@uniautonoma.edu.co',
         v_hash, 'ESTUDIANTE', TRUE, '2026901', FALSE),
        ('Zulema Leon',
         'zulema.leon.e@uniautonoma.edu.co',
         v_hash, 'ESTUDIANTE', TRUE, '2026902', FALSE),
        ('Yudith Agredo',
         'yudith.agredo.r@uniautonoma.edu.co',
         v_hash, 'ESTUDIANTE', TRUE, '2026903', FALSE),
        ('Luis Ramos Sanjuan',
         'luis.ramos.sanjuan@uniautonoma.edu.co',
         v_hash, 'ESTUDIANTE', TRUE, '2026904', FALSE)
    ON CONFLICT (email_institucional) DO NOTHING;
END $$;

INSERT INTO estudiantes (
    usuario_id, codigo_estudiantil, cod_alumno, doc_alumno, nombre_completo,
    email_institucional, correo_institucional,
    semestre_actual, programa_id, matricula_activa,
    jornada, creditos_inscritos, creditos_max_permitidos, estado_academico,
    anio_academico, periodo_academico, sesion_academica
)
SELECT
    u.id_usuario,
    e.codigo,
    e.codigo,
    e.doc,
    e.nombre,
    e.email,
    e.email,
    e.semestre,
    p.id_programa,
    TRUE,
    e.jornada,
    0,
    20,
    'normal',
    '2026',
    '1',
    'PREG'
FROM (VALUES
    ('2026901', 'CC-6901', 'Cristian Aranda',      'cristian.aranda.h@uniautonoma.edu.co',    6, 'Ingenieria de Sistemas', 'manana'),
    ('2026902', 'CC-6902', 'Zulema Leon',          'zulema.leon.e@uniautonoma.edu.co',        4, 'Ingenieria Industrial',  'tarde'),
    ('2026903', 'CC-6903', 'Yudith Agredo',        'yudith.agredo.r@uniautonoma.edu.co',      5, 'Ingenieria de Sistemas', 'manana'),
    ('2026904', 'CC-6904', 'Luis Ramos Sanjuan',   'luis.ramos.sanjuan@uniautonoma.edu.co',   3, 'Administracion de Empresas', 'noche')
) AS e(codigo, doc, nombre, email, semestre, prog, jornada)
JOIN programas p ON p.nombre_programa = e.prog
JOIN usuarios  u ON u.codigo_estudiantil = e.codigo
                AND u.deleted_at IS NULL
ON CONFLICT (codigo_estudiantil) DO NOTHING;

COMMIT;
