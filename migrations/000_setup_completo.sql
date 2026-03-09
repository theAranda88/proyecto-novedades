-- =============================================================================
--  SETUP COMPLETO — Proyecto Novedades v3.0
--  Fecha: 2026-03-07
--
--  DESCRIPCIÓN:
--    Script único para crear la BD desde CERO en un nuevo entorno.
--    Incluye TODO lo aplicado hasta la migración 005 (estado actual del sistema).
--    NO es necesario ejecutar las migraciones 001-005 si se usa este script.
--
--  PREREQUISITO:
--    Crear la BD vacía en PostgreSQL antes de ejecutar:
--      CREATE DATABASE proyecto_novedades;
--
--  EJECUCIÓN (Windows — PowerShell):
--    $env:PGPASSWORD="tu_password"
--    & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5432 -U postgres -d proyecto_novedades -f migrations/000_setup_completo.sql
--
--  EJECUCIÓN (Linux / Mac):
--    PGPASSWORD=tu_password psql -h localhost -p 5432 -U postgres -d proyecto_novedades -f migrations/000_setup_completo.sql
--
--  RESULTADO: BD lista con tablas + seed de datos para pruebas:
--    codigo_estudiantil | password    | rol        | estado
--    2024001            | Password123 | estudiante | matricula activa
--    2024002            | Password123 | estudiante | matricula activa (MAT101 reprobada)
--    2023010            | Password123 | estudiante | matricula INACTIVA
--    SEC001             | Password123 | secretaria | activo
--    ADMIN001           | Password123 | admin      | activo
--
--  MIGRACIONES INCLUIDAS EN ESTE SCRIPT:
--    ✔ 000 — Esquema base + seed
--    ✔ 001 — password_hash en usuarios
--    ✔ 002 — Seed de contraseñas
--    ✔ 003 — Tabla usuarios con roles
--    ✔ 004 — Esquema HU_DB (grupos_curso, historial_v2, inscripciones_activas, etc.)
--    ✔ 005 — Fix constraints solicitudes (tipo_novedad, estado, grupo_nuevo_id)
--
--  PARA ENTORNOS EXISTENTES (colaborador que ya tiene la BD):
--    Solo ejecutar las migraciones faltantes en orden:
--      psql ... -f migrations/005_fix_constraints_solicitudes.sql
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TIPOS ENUM
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE rol_sistema AS ENUM ('ESTUDIANTE', 'SECRETARIA', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLA: programas
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS programas (
    id_programa     SERIAL       PRIMARY KEY,
    nombre_programa VARCHAR(150) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ  NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABLA: estudiantes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS estudiantes (
    cod_alumno               VARCHAR(20)  PRIMARY KEY,
    doc_alumno               VARCHAR(20)  NOT NULL UNIQUE,
    nombre_completo          VARCHAR(200) NOT NULL,
    email_institucional      VARCHAR(150) NOT NULL UNIQUE,
    semestre                 SMALLINT     NOT NULL CHECK (semestre BETWEEN 1 AND 12),
    id_programa              INT          NOT NULL REFERENCES programas(id_programa),
    matricula_activa         BOOLEAN      NOT NULL DEFAULT FALSE,
    usuario_id               BIGINT       NULL,
    jornada                  VARCHAR(10)  NOT NULL DEFAULT 'manana',
    creditos_inscritos       SMALLINT     NOT NULL DEFAULT 0,
    creditos_max_permitidos  SMALLINT     NOT NULL DEFAULT 20,
    promedio_acumulado       DECIMAL(4,2) NOT NULL DEFAULT 0.00,
    estado_academico         VARCHAR(20)  NOT NULL DEFAULT 'normal',
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at               TIMESTAMPTZ  NULL,
    created_by               BIGINT       NULL,
    updated_by               BIGINT       NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABLA: usuarios
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario           SERIAL       PRIMARY KEY,
    nombre_completo      VARCHAR(200) NOT NULL,
    email_institucional  VARCHAR(150) NOT NULL UNIQUE,
    password_hash        VARCHAR(255) NOT NULL,
    rol                  rol_sistema  NOT NULL DEFAULT 'ESTUDIANTE',
    activo               BOOLEAN      NOT NULL DEFAULT TRUE,
    cod_alumno           VARCHAR(20)  NULL REFERENCES estudiantes(cod_alumno)
                             ON UPDATE CASCADE ON DELETE CASCADE,
    fecha_creacion       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    codigo_estudiantil   VARCHAR(20)  NOT NULL UNIQUE,
    primer_login         BOOLEAN      NOT NULL DEFAULT TRUE,
    intentos_fallidos    SMALLINT     NOT NULL DEFAULT 0,
    bloqueado_hasta      TIMESTAMPTZ  NULL,
    ultimo_login         TIMESTAMPTZ  NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ  NULL,
    created_by           BIGINT       NULL,
    updated_by           BIGINT       NULL,

    CONSTRAINT uq_usuario_alumno       UNIQUE (cod_alumno),
    CONSTRAINT chk_alumno_rol CHECK (
        (rol = 'ESTUDIANTE' AND cod_alumno IS NOT NULL)
        OR (rol IN ('SECRETARIA', 'ADMIN') AND cod_alumno IS NULL)
    )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TABLA: cursos
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cursos (
    id          SERIAL       PRIMARY KEY,
    cod_curso   VARCHAR(20)  NOT NULL UNIQUE,
    nombre_curso VARCHAR(200) NOT NULL UNIQUE,
    creditos    SMALLINT     NOT NULL DEFAULT 3,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ  NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TABLA: grupos_curso
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grupos_curso (
    id             SERIAL       PRIMARY KEY,
    curso_id       INT          NOT NULL REFERENCES cursos(id) ON DELETE RESTRICT,
    codigo_grupo   VARCHAR(10)  NOT NULL,
    docente        VARCHAR(200) NOT NULL DEFAULT 'Por asignar',
    jornada        VARCHAR(10)  NOT NULL CHECK (jornada IN ('manana','tarde','noche')),
    dia_semana     VARCHAR(15)  NOT NULL,
    hora_inicio    TIME         NOT NULL,
    hora_fin       TIME         NOT NULL,
    aula           VARCHAR(50)  NULL,
    cupo_maximo    SMALLINT     NOT NULL DEFAULT 35,
    cupos_ocupados SMALLINT     NOT NULL DEFAULT 0,
    periodo        VARCHAR(10)  NOT NULL,
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_grupo_periodo UNIQUE (curso_id, codigo_grupo, periodo),
    CONSTRAINT chk_cupos        CHECK  (cupos_ocupados <= cupo_maximo),
    CONSTRAINT chk_horario      CHECK  (hora_fin > hora_inicio)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. TABLA: historial_v2
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS historial_v2 (
    id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estudiante_id   INT          NOT NULL,
    curso_id        INT          NOT NULL REFERENCES cursos(id),
    periodo         VARCHAR(10)  NOT NULL,
    nota_final      DECIMAL(4,2) NULL,
    estado          VARCHAR(20)  NOT NULL DEFAULT 'en_curso'
                    CHECK (estado IN ('en_curso','aprobada','reprobada')),
    numero_intentos SMALLINT     NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ  NULL,

    CONSTRAINT uq_historial UNIQUE (estudiante_id, curso_id, periodo)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. TABLA: inscripciones_activas
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inscripciones_activas (
    id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estudiante_id  INT         NOT NULL,
    grupo_id       INT         NOT NULL REFERENCES grupos_curso(id) ON DELETE RESTRICT,
    periodo        VARCHAR(10) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_inscripcion UNIQUE (estudiante_id, grupo_id, periodo)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. TABLA: solicitudes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS solicitudes (
    id_solicitud            BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cod_alumno              VARCHAR(20)  NOT NULL REFERENCES estudiantes(cod_alumno)
                                ON UPDATE CASCADE ON DELETE RESTRICT,

    -- tipo_novedad: valores válidos del CHECK constraint
    tipo_novedad            VARCHAR(30)  NOT NULL
                                CHECK (tipo_novedad IN (
                                    'ADICION_CURSO',
                                    'CAMBIO_CURSO',
                                    'CAMBIO_JORNADA',
                                    'CURSO_DIRIGIDO'
                                )),

    -- Referencia al grupo destino y origen (tabla grupos_curso)
    -- Reemplaza las antiguas FK a tabla secciones
    grupo_nuevo_id          INT          NULL REFERENCES grupos_curso(id)
                                ON UPDATE CASCADE ON DELETE SET NULL,
    grupo_actual_id         INT          NULL REFERENCES grupos_curso(id)
                                ON UPDATE CASCADE ON DELETE SET NULL,

    -- Compatibilidad con esquema original (nullable, sin FK)
    id_seccion_destino      INT          NULL,
    id_seccion_origen       INT          NULL,

    motivo_novedad          TEXT         NOT NULL DEFAULT '',
    justificacion_detallada TEXT         NULL,
    adjunto_recibo_pago     TEXT         NULL,

    -- estado: PENDIENTE | EN_REVISION | APROBADA | RECHAZADA
    estado_solicitud        VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE'
                                CHECK (estado_solicitud IN (
                                    'PENDIENTE',
                                    'EN_REVISION',
                                    'APROBADA',
                                    'RECHAZADA'
                                )),

    periodo_academico       VARCHAR(10)  NOT NULL,
    fecha_creacion          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- codigo_solicitud: formato REQ-AAAA-NNN generado por el backend
    codigo_solicitud        VARCHAR(30)  NOT NULL UNIQUE,

    -- validacion_json: snapshot del motor de validaciones HU_DB §5
    validacion_json         JSONB        NULL,

    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ  NULL,
    created_by              BIGINT       NULL,
    updated_by              BIGINT       NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. TABLA: notificaciones
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notificaciones (
    id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id   BIGINT      NOT NULL,
    solicitud_id BIGINT      NOT NULL,
    titulo       VARCHAR(200) NOT NULL,
    mensaje      TEXT         NOT NULL,
    leido        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. TABLA: documentos_adjuntos
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documentos_adjuntos (
    id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    solicitud_id   BIGINT      NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    tipo_mime      VARCHAR(100) NOT NULL,
    tamanio_bytes  INT          NOT NULL CHECK (tamanio_bytes > 0 AND tamanio_bytes <= 5242880),
    url_storage    TEXT         NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by     BIGINT       NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. INDICES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_usuarios_codigo_estudiantil ON usuarios(codigo_estudiantil);
CREATE INDEX IF NOT EXISTS idx_usuarios_deleted            ON usuarios(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_estudiantes_usuario_id      ON estudiantes(usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grupos_curso_busqueda       ON grupos_curso(curso_id, jornada, periodo) WHERE activo = TRUE;
CREATE INDEX IF NOT EXISTS idx_historial_v2_elegibilidad   ON historial_v2(estudiante_id, curso_id);
CREATE INDEX IF NOT EXISTS idx_inscripciones_activas       ON inscripciones_activas(estudiante_id, periodo);
CREATE INDEX IF NOT EXISTS idx_solicitudes_filtros         ON solicitudes(periodo_academico) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. TRIGGER updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_actualizar_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['usuarios','estudiantes','programas','cursos','grupos_curso','historial_v2','inscripciones_activas','solicitudes'] LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_updated_at_%s ON %s;
             CREATE TRIGGER trg_updated_at_%s BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();',
            t, t, t, t
        );
    END LOOP;
END;
$$;

-- =============================================================================
--  DATOS SEED — Datos mínimos para que el sistema funcione
--  Contraseña de todos los usuarios: Password123
--  Hash: $2b$10$O0n6t62MOUyaR9kwCje46ukcojI4JUQgpAYYCzy6aVo0JJ8/KIoCC
--  Verificado: bcrypt.compareSync('Password123', hash) = true ✅
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED 1: Programas
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO programas (nombre_programa) VALUES
    ('Ingenieria de Sistemas'),
    ('Ingenieria Industrial'),
    ('Administracion de Empresas')
ON CONFLICT (nombre_programa) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED 2: Cursos
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO cursos (cod_curso, nombre_curso, creditos) VALUES
    ('MAT101', 'Calculo Diferencial',       4),
    ('PRG201', 'Programacion Orientada a Objetos', 3),
    ('EST301', 'Estadistica Descriptiva',   3),
    ('FIS101', 'Fisica Mecanica',           4),
    ('ING101', 'Ingles I',                  2)
ON CONFLICT (cod_curso) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED 3: Estudiantes
--   2024001 → matricula ACTIVA  (estudiante normal)
--   2024002 → matricula ACTIVA  (estudiante con historial reprobada)
--   2023010 → matricula INACTIVA (para probar el rechazo de login)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO estudiantes (cod_alumno, doc_alumno, nombre_completo, email_institucional,
                         semestre, id_programa, matricula_activa,
                         jornada, creditos_inscritos, creditos_max_permitidos, estado_academico)
SELECT
    e.cod_alumno, e.doc_alumno, e.nombre_completo, e.email,
    e.semestre, p.id_programa, e.activa,
    e.jornada, e.cred_ins, e.cred_max, e.estado
FROM (VALUES
    ('2024001','CC-1001','Carlos Andres Perez Lopez',   'cperez@proyectonovedades.edu.co',   3, 'Ingenieria de Sistemas',  TRUE,  'manana', 9,  20, 'normal'),
    ('2024002','CC-1002','Maria Fernanda Lopez Torres', 'mlopez@proyectonovedades.edu.co',   2, 'Ingenieria Industrial',   TRUE,  'tarde',  6,  20, 'normal'),
    ('2023010','CC-1010','Luis Eduardo Gomez Rios',     'lgomez@proyectonovedades.edu.co',   4, 'Administracion de Empresas', FALSE, 'manana', 0, 20, 'normal')
) AS e(cod_alumno, doc_alumno, nombre_completo, email, semestre, prog, activa, jornada, cred_ins, cred_max, estado)
JOIN programas p ON p.nombre_programa = e.prog
ON CONFLICT (cod_alumno) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
--  SEED 4: Usuarios
--   TODOS usan Password123
--   Hash bcrypt cost 10, verificado: bcrypt.compareSync('Password123', hash) = true
--   Hash: $2b$10$O0n6t62MOUyaR9kwCje46ukcojI4JUQgpAYYCzy6aVo0JJ8/KIoCC
--
--   primer_login = FALSE → todos pueden entrar directo (datos de prueba)
-- ─────────────────────────────────────────────────────────────────────────────

-- Hash unico para todos los usuarios seed: Password123
-- Verificado: bcrypt.compareSync('Password123', hash) = true  ✅
-- Hash tomado directamente de la BD activa (cost 10)
DO $$
DECLARE
    v_hash TEXT := '$2b$10$O0n6t62MOUyaR9kwCje46ukcojI4JUQgpAYYCzy6aVo0JJ8/KIoCC';
BEGIN

INSERT INTO usuarios (nombre_completo, email_institucional, password_hash,
                      rol, activo, cod_alumno, codigo_estudiantil, primer_login)
VALUES
    ('Carlos Andres Perez Lopez',
     'cperez@proyectonovedades.edu.co',
     v_hash, 'ESTUDIANTE', TRUE, '2024001', '2024001', FALSE),

    ('Maria Fernanda Lopez Torres',
     'mlopez@proyectonovedades.edu.co',
     v_hash, 'ESTUDIANTE', TRUE, '2024002', '2024002', FALSE),

    ('Luis Eduardo Gomez Rios',
     'lgomez@proyectonovedades.edu.co',
     v_hash, 'ESTUDIANTE', TRUE, '2023010', '2023010', FALSE),

    ('Ana Maria Rodriguez Soto',
     'secretaria@proyectonovedades.edu.co',
     v_hash, 'SECRETARIA', TRUE, NULL, 'SEC001', FALSE),

    ('Administrador del Sistema',
     'admin@proyectonovedades.edu.co',
     v_hash, 'ADMIN', TRUE, NULL, 'ADMIN001', FALSE)

ON CONFLICT (email_institucional) DO NOTHING;

END $$;

-- Vincular usuarios con estudiantes
UPDATE estudiantes e
   SET usuario_id = u.id_usuario
  FROM usuarios u
 WHERE u.cod_alumno = e.cod_alumno
   AND e.usuario_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED 5: Grupos de cursos — periodo 2026-1
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO grupos_curso
    (curso_id, codigo_grupo, docente, jornada, dia_semana, hora_inicio, hora_fin,
     aula, cupo_maximo, cupos_ocupados, periodo)
SELECT c.id, g.codigo_grupo, g.docente, g.jornada,
       g.dia_semana, g.hora_inicio::TIME, g.hora_fin::TIME,
       g.aula, g.cupo_maximo, g.cupos_ocupados, '2026-1'
FROM (VALUES
    ('MAT101','G-01','Dr. Ramon Suarez',  'manana','lunes',     '07:00','09:00','Aula-201',35, 9),
    ('MAT101','G-02','Dr. Ramon Suarez',  'tarde', 'miercoles', '14:00','16:00','Aula-201',35, 5),
    ('MAT101','G-03','Dra. Elena Mora',   'noche', 'lunes',     '18:00','20:00','Aula-301',30, 0),
    ('PRG201','G-01','Ing. Jorge Baena',  'manana','lunes',     '08:00','10:00','Lab-101', 40,15),
    ('PRG201','G-02','Ing. Jorge Baena',  'tarde', 'viernes',   '14:00','16:00','Lab-101', 40,10),
    ('PRG201','G-03','Ing. Pedro Nieto',  'noche', 'martes',    '18:00','20:00','Lab-102', 35, 5),
    ('EST301','G-01','Dra. Clara Reyes',  'manana','martes',    '09:00','11:00','Aula-202',30, 8),
    ('EST301','G-02','Dra. Clara Reyes',  'tarde', 'jueves',    '14:00','16:00','Aula-202',30, 8)
) AS g(cod, codigo_grupo, docente, jornada, dia_semana, hora_inicio, hora_fin,
       aula, cupo_maximo, cupos_ocupados)
JOIN cursos c ON c.cod_curso = g.cod
ON CONFLICT (curso_id, codigo_grupo, periodo) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED 6: Inscripciones activas — estudiante 2024001 inscrito en PRG201-G01
-- estudiante_id = posición ROW_NUMBER por cod_alumno (mismo criterio que el backend)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO inscripciones_activas (estudiante_id, grupo_id, periodo)
SELECT
    nums.rn,
    g.id,
    '2026-1'
FROM grupos_curso g
JOIN cursos c ON c.id = g.curso_id
JOIN (
    SELECT cod_alumno,
           ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT AS rn
    FROM estudiantes
    WHERE deleted_at IS NULL
) nums ON nums.cod_alumno = '2024001'
WHERE c.cod_curso = 'PRG201'
  AND g.codigo_grupo = 'G-01'
  AND g.periodo = '2026-1'
ON CONFLICT (estudiante_id, grupo_id, periodo) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED 7: Historial academico — 2024002 tiene MAT101 reprobada (para curso dirigido)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO historial_v2 (estudiante_id, curso_id, periodo, nota_final, estado, numero_intentos)
SELECT
    nums.rn,
    c.id,
    '2025-2',
    2.8,
    'reprobada',
    1
FROM cursos c
JOIN (
    SELECT cod_alumno,
           ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT AS rn
    FROM estudiantes
    WHERE deleted_at IS NULL
) nums ON nums.cod_alumno = '2024002'
WHERE c.cod_curso = 'MAT101'
ON CONFLICT (estudiante_id, curso_id, periodo) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACION FINAL
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
    '>>> USUARIOS CREADOS <<<'                                AS info;
SELECT
    id_usuario,
    codigo_estudiantil,
    nombre_completo,
    LOWER(rol::TEXT)  AS rol,
    activo,
    primer_login,
    'Password123'     AS password_prueba
FROM usuarios
ORDER BY id_usuario;

COMMIT;

