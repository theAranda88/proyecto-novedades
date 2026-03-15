-- =============================================================================
--  SETUP COMPLETO — Proyecto Novedades v3.2 (HU_DB v1.0 — Corregida)
--  Fecha: 2026-03-14
--
--  DESCRIPCIÓN:
--    Script MAESTRO para crear la BD desde CERO en un nuevo entorno.
--    Incluye TODO lo aplicado hasta la migración 009.
--    ✔ Migración 004: Esquema HU_DB (grupos_curso, historial_v2, etc.)
--    ✔ Migración 006: Fix password_hash
--    ✔ Migración 007: Agregar grupo_nuevo_id y grupo_actual_id a solicitudes
--    ✔ Migración 009: Agregar valor_curso_dirigido a grupos_curso (NUEVO)
--    NO es necesario ejecutar las migraciones individuales si se usa este script.
--
--  CAMBIOS EN VERSIÓN 3.2 (CORRECCIÓN CRÍTICA):
--    ✔ CORRECCIÓN: Validación de CURSO_DIRIGIDO ahora CORRECTA (HU_DB §5.4)
--       - REMOVIDA: Validación de "materia reprobada previa"
--       - Nuevo enfoque: Curso que NO se oferta en el semestre actual
--       - 4 chequeos: curso_no_ofertado_regular, cupos, sin_cruce, estado_académico
--    ✔ Agregado: Campo valor_curso_dirigido en tabla grupos_curso
--    ✔ Actualizado: Swagger documentation con nuevos detalles
--    ✔ Actualizado: Postman collection con ejemplos correctos
--
--  PREREQUISITO:
--    Crear la BD vacía en PostgreSQL antes de ejecutar:
--      CREATE DATABASE proyecto_novedades;
--
--  EJECUCIÓN (Windows — PowerShell):
--    $env:PGPASSWORD="admin123"
--    & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d proyecto_novedades -f migrations/000_setup_completo.sql
--
--  EJECUCIÓN (Linux / Mac):
--    PGPASSWORD=admin123 psql -U postgres -d proyecto_novedades -f migrations/000_setup_completo.sql
--
--  RESULTADO: BD lista con tablas + seed de datos para pruebas:
--    codigo_estudiantil | nombre_completo        | rol        | estado
--    2024001            | Carlos Andres Perez    | estudiante | ✅ Activo
--    2024002            | Maria Fernanda Lopez   | estudiante | ✅ Activo
--    2024003-2024008    | Varios estudiantes     | estudiante | ✅ Activos
--    2023010            | Luis Eduardo Gomez     | estudiante | ❌ Inactivo
--    SEC001             | Ana Maria Rodriguez    | secretaria | ✅ Activo
--    ADMIN001           | Administrador Sistema  | admin      | ✅ Activo
--    Password: Password123 para todos
--
--  MIGRACIONES INCLUIDAS EN ESTE SCRIPT:
--    ✔ 000 — Esquema base + seed
--    ✔ 001 — password_hash en usuarios
--    ✔ 002 — Seed de contraseñas
--    ✔ 003 — Tabla usuarios con roles
--    ✔ 004 — Esquema HU_DB (grupos_curso, historial_v2, inscripciones_activas, etc.)
--    ✔ 005 — Fix constraints solicitudes (tipo_novedad, estado, grupo_nuevo_id)
--    ✔ 006 — Fix password_hash
--    ✔ 007 — Agregar grupo_nuevo_id y grupo_actual_id con constraints correctos
--    ✔ 009 — Agregar valor_curso_dirigido a grupos_curso (HU_DB §5.4)
--
--  PARA COLABORADORES CON BD EXISTENTE:
--    Si ya tienes la BD y necesitas actualizarla a esta versión:
--    1. Ejecuta solo las migraciones faltantes en orden:
--       psql ... -f migrations/006_fix_password_hash.sql
--       psql ... -f migrations/007_agregar_grupos_solicitudes.sql
--    2. Verifica que el proyecto se compila: npm run build
--    3. Inicia: npm run dev
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
-- 3. TABLA: usuarios (DEBE IR ANTES DE estudiantes por FK)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario           SERIAL       PRIMARY KEY,
    nombre_completo      VARCHAR(200) NOT NULL,
    email_institucional  VARCHAR(150) NOT NULL UNIQUE,
    password_hash        VARCHAR(255) NOT NULL,
    rol                  rol_sistema  NOT NULL DEFAULT 'ESTUDIANTE',
    activo               BOOLEAN      NOT NULL DEFAULT TRUE,
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
    updated_by           BIGINT       NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABLA: estudiantes (AHORA puede tener FK a usuarios)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS estudiantes (
    id                     BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id             BIGINT        NULL UNIQUE REFERENCES usuarios(id_usuario),
    cod_alumno             VARCHAR(20)   UNIQUE,
    codigo_estudiantil     VARCHAR(20)   NOT NULL UNIQUE,
    nombre_completo        VARCHAR(150)  NOT NULL,
    doc_alumno             VARCHAR(20)   NOT NULL UNIQUE,
    email_institucional    VARCHAR(150)  UNIQUE,
    correo_institucional   VARCHAR(150)  UNIQUE,
    semestre_actual        SMALLINT      NOT NULL CHECK (semestre_actual BETWEEN 1 AND 12),
    programa_id            INT           NOT NULL REFERENCES programas(id_programa),
    matricula_activa       BOOLEAN       NOT NULL DEFAULT FALSE,
    jornada                VARCHAR(10)   NOT NULL DEFAULT 'manana',
    creditos_inscritos     SMALLINT      NOT NULL DEFAULT 0,
    creditos_max_permitidos SMALLINT     NOT NULL DEFAULT 20,
    promedio_acumulado     DECIMAL(4,2)  NOT NULL DEFAULT 0.00,
    estado_academico       VARCHAR(20)   NOT NULL DEFAULT 'normal'
                           CHECK (estado_academico IN ('normal','bajo_rendimiento','suspendido')),
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at             TIMESTAMPTZ   NULL,
    created_by             BIGINT        NULL,
    updated_by             BIGINT        NULL
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
    valor_curso_dirigido DECIMAL(10,2) NULL CHECK (valor_curso_dirigido IS NULL OR valor_curso_dirigido > 0),
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
CREATE INDEX IF NOT EXISTS idx_grupos_curso_valor_dirigido ON grupos_curso(valor_curso_dirigido) WHERE valor_curso_dirigido IS NOT NULL;
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
    ('2024001', '2024001', 'CC-1001', 'Carlos Andres Perez Lopez',   'cperez@proyectonovedades.edu.co',   3, 'Ingenieria de Sistemas',  TRUE,  'manana', 9,  20, 'normal'),
    ('2024002', '2024002', 'CC-1002', 'Maria Fernanda Lopez Torres', 'mlopez@proyectonovedades.edu.co',   2, 'Ingenieria Industrial',   TRUE,  'tarde',  6,  20, 'normal'),
    ('2023010', '2023010', 'CC-1010', 'Luis Eduardo Gomez Rios',     'lgomez@proyectonovedades.edu.co',   4, 'Administracion de Empresas', FALSE, 'manana', 0, 20, 'normal'),
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
                      rol, activo, codigo_estudiantil, primer_login)
VALUES
    ('Carlos Andres Perez Lopez',
     'cperez@proyectonovedades.edu.co',
     v_hash, 'ESTUDIANTE', TRUE, '2024001', FALSE),

    ('Maria Fernanda Lopez Torres',
     'mlopez@proyectonovedades.edu.co',
     v_hash, 'ESTUDIANTE', TRUE, '2024002', FALSE),

    ('Luis Eduardo Gomez Rios',
     'lgomez@proyectonovedades.edu.co',
     v_hash, 'ESTUDIANTE', TRUE, '2023010', FALSE),

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
     v_hash, 'ESTUDIANTE', TRUE, '2024008', FALSE),

    ('Ana Maria Rodriguez Soto',
     'secretaria@proyectonovedades.edu.co',
     v_hash, 'SECRETARIA', TRUE, 'SEC001', FALSE),

    ('Administrador del Sistema',
     'admin@proyectonovedades.edu.co',
     v_hash, 'ADMIN', TRUE, 'ADMIN001', FALSE)

ON CONFLICT (email_institucional) DO NOTHING;

END $$;

-- Vincular usuarios con estudiantes
UPDATE estudiantes e
   SET usuario_id = u.id_usuario
  FROM usuarios u
 WHERE u.codigo_estudiantil = e.codigo_estudiantil
   AND e.usuario_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED 4b: Cursos adicionales para modalidad dirigida (no aparecen en oferta regular)
-- ─────────────────────────────────────────────────────────────────────────────

-- Primero, verifica que existan cursos para modalidad dirigida
-- Si no existen, crea dos cursos nuevos
INSERT INTO cursos (cod_curso, nombre_curso, creditos)
VALUES
    ('FIS401', 'Física Avanzada IV', 4),
    ('QUI301', 'Química Orgánica III', 3)
ON CONFLICT (cod_curso) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED 5: Grupos de cursos — periodo 2026-1
-- ─────────────────────────────────────────────────────────────────────────────

-- Grupos de OFERTA REGULAR (disponibles en múltiples jornadas)
INSERT INTO grupos_curso
    (curso_id, codigo_grupo, docente, jornada, dia_semana, hora_inicio, hora_fin,
     aula, cupo_maximo, cupos_ocupados, periodo, valor_curso_dirigido)
SELECT c.id, g.codigo_grupo, g.docente, g.jornada,
       g.dia_semana, g.hora_inicio::TIME, g.hora_fin::TIME,
       g.aula, g.cupo_maximo, g.cupos_ocupados, '2026-1', g.valor_dirigido
FROM (VALUES
    -- OFERTA REGULAR: Cursos ofertados en múltiples jornadas
    ('MAT101','G-01','Dr. Ramon Suarez',  'manana','lunes',     '07:00','09:00','Aula-201',35, 9, NULL::DECIMAL),
    ('MAT101','G-02','Dr. Ramon Suarez',  'tarde', 'miercoles', '14:00','16:00','Aula-201',35, 5, NULL::DECIMAL),
    ('MAT101','G-03','Dra. Elena Mora',   'noche', 'lunes',     '18:00','20:00','Aula-301',30, 0, NULL::DECIMAL),
    ('PRG201','G-01','Ing. Jorge Baena',  'manana','lunes',     '08:00','10:00','Lab-101', 40,15, NULL::DECIMAL),
    ('PRG201','G-02','Ing. Jorge Baena',  'tarde', 'viernes',   '14:00','16:00','Lab-101', 40,10, NULL::DECIMAL),
    ('PRG201','G-03','Ing. Pedro Nieto',  'noche', 'martes',    '18:00','20:00','Lab-102', 35, 5, NULL::DECIMAL),
    ('EST301','G-01','Dra. Clara Reyes',  'manana','martes',    '09:00','11:00','Aula-202',30, 8, NULL::DECIMAL),
    ('EST301','G-02','Dra. Clara Reyes',  'tarde', 'jueves',    '14:00','16:00','Aula-202',30, 8, NULL::DECIMAL),

    -- MODALIDAD DIRIGIDA: Cursos que NO se ofertam en oferta regular (solo grupo dirigido)
    -- Máximo 3 estudiantes + valor diferenciado
    ('FIS401','G-DIR','Dr. Carlos Molina', 'manana','miercoles', '09:00','11:00','Aula-401', 3, 0, 280000::DECIMAL),
    ('QUI301','G-DIR','Dra. Patricia Ruiz', 'tarde', 'jueves',   '15:00','17:00','Lab-201',  3, 0, 250000::DECIMAL)
) AS g(cod, codigo_grupo, docente, jornada, dia_semana, hora_inicio, hora_fin,
       aula, cupo_maximo, cupos_ocupados, valor_dirigido)
JOIN cursos c ON c.cod_curso = g.cod
ON CONFLICT (curso_id, codigo_grupo, periodo) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED 6: Inscripciones activas — Todos los estudiantes con sus cursos
-- ─────────────────────────────────────────────────────────────────────────────

-- 2024001: Inscrito en PRG201-G01 (manana)
INSERT INTO inscripciones_activas (estudiante_id, grupo_id, periodo)
SELECT
    (SELECT ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT FROM estudiantes WHERE codigo_estudiantil = '2024001' LIMIT 1),
    g.id,
    '2026-1'
FROM grupos_curso g
JOIN cursos c ON c.id = g.curso_id
WHERE c.cod_curso = 'PRG201'
  AND g.codigo_grupo = 'G-01'
  AND g.periodo = '2026-1'
ON CONFLICT (estudiante_id, grupo_id, periodo) DO NOTHING;

-- 2024003: Inscrito en MAT101-G01 y EST301-G01 (manana)
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

-- 2024004: Inscrito en PRG201-G02 y EST301-G02 (tarde)
INSERT INTO inscripciones_activas (estudiante_id, grupo_id, periodo)
SELECT
    (SELECT ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT FROM estudiantes WHERE codigo_estudiantil = '2024004' LIMIT 1),
    g.id,
    '2026-1'
FROM grupos_curso g
JOIN cursos c ON c.id = g.curso_id
WHERE ((c.cod_curso = 'PRG201' AND g.codigo_grupo = 'G-02')
   OR (c.cod_curso = 'EST301' AND g.codigo_grupo = 'G-02'))
  AND g.periodo = '2026-1'
ON CONFLICT (estudiante_id, grupo_id, periodo) DO NOTHING;

-- 2024005: Inscrito en MAT101-G02 y PRG201-G02 (tarde)
INSERT INTO inscripciones_activas (estudiante_id, grupo_id, periodo)
SELECT
    (SELECT ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT FROM estudiantes WHERE codigo_estudiantil = '2024005' LIMIT 1),
    g.id,
    '2026-1'
FROM grupos_curso g
JOIN cursos c ON c.id = g.curso_id
WHERE ((c.cod_curso = 'MAT101' AND g.codigo_grupo = 'G-02')
   OR (c.cod_curso = 'PRG201' AND g.codigo_grupo = 'G-02'))
  AND g.periodo = '2026-1'
ON CONFLICT (estudiante_id, grupo_id, periodo) DO NOTHING;

-- 2024006: Inscrito en PRG201-G03 y MAT101-G03 (noche)
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

-- 2024008: Inscrito en MAT101-G01, PRG201-G01, EST301-G01 (manana)
INSERT INTO inscripciones_activas (estudiante_id, grupo_id, periodo)
SELECT
    (SELECT ROW_NUMBER() OVER (ORDER BY cod_alumno)::INT FROM estudiantes WHERE codigo_estudiantil = '2024008' LIMIT 1),
    g.id,
    '2026-1'
FROM grupos_curso g
JOIN cursos c ON c.id = g.curso_id
WHERE c.cod_curso IN ('MAT101', 'PRG201', 'EST301')
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
    '>>> VERIFICACIÓN: ESTRUCTURA DE GRUPOS_CURSO (HU_DB §5.4) <<<'                                AS info;
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'grupos_curso'
      AND column_name IN ('id', 'curso_id', 'cupo_maximo', 'valor_curso_dirigido')
ORDER BY ordinal_position;

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

