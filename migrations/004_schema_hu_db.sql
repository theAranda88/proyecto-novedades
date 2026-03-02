-- =============================================================================
--  MIGRACIÓN 004 — Esquema HU_DB_Novedades v1.0 (2026)
--  Estrategia: ALTER sobre tablas existentes + CREATE de tablas nuevas.
--  Compatible con el esquema anterior (proyecto-novedades.sql + mig003).
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1: Ampliar tabla usuarios con campos HU_DB §4.1
-- ─────────────────────────────────────────────────────────────────────────────

-- Agregar codigo_estudiantil si no existe (alias de cod_alumno para nuevos roles)
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS codigo_estudiantil VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS primer_login        BOOLEAN     NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS intentos_fallidos   SMALLINT    NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bloqueado_hasta     TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS ultimo_login        TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS deleted_at          TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS created_by          BIGINT      NULL,
    ADD COLUMN IF NOT EXISTS updated_by          BIGINT      NULL;

-- Poblar codigo_estudiantil desde cod_alumno donde sea NULL
UPDATE usuarios
   SET codigo_estudiantil = cod_alumno
 WHERE codigo_estudiantil IS NULL;

-- Para secretaria/admin que no tienen cod_alumno, generar código único
UPDATE usuarios
   SET codigo_estudiantil = UPPER(REPLACE(REPLACE(email_institucional, '@proyectonovedades.edu.co',''), '.', '_'))
 WHERE codigo_estudiantil IS NULL;

-- Hacer no nulo después de poblar
ALTER TABLE usuarios
    ALTER COLUMN codigo_estudiantil SET NOT NULL;

-- Actualizar primer_login = FALSE para usuarios existentes (ya tenían acceso)
UPDATE usuarios SET primer_login = FALSE WHERE primer_login = TRUE;

-- Agregar email_institucional si no existe (ya existe en la tabla actual)
-- (se omite — la columna ya existe)

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2: Ampliar tabla estudiantes con campos HU_DB §4.2
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE estudiantes
    ADD COLUMN IF NOT EXISTS usuario_id              BIGINT       NULL,
    ADD COLUMN IF NOT EXISTS correo_institucional    VARCHAR(150) NULL,
    ADD COLUMN IF NOT EXISTS jornada                 VARCHAR(10)  NOT NULL DEFAULT 'manana',
    ADD COLUMN IF NOT EXISTS creditos_inscritos      SMALLINT     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS creditos_max_permitidos SMALLINT     NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS promedio_acumulado      DECIMAL(4,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS estado_academico        VARCHAR(20)  NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS deleted_at              TIMESTAMPTZ  NULL,
    ADD COLUMN IF NOT EXISTS created_by              BIGINT       NULL,
    ADD COLUMN IF NOT EXISTS updated_by              BIGINT       NULL;

-- Poblar correo_institucional desde email_institucional
UPDATE estudiantes
   SET correo_institucional = email_institucional
 WHERE correo_institucional IS NULL;

-- Vincular usuario_id desde la tabla usuarios (donde cod_alumno coincide)
UPDATE estudiantes e
   SET usuario_id = u.id_usuario
  FROM usuarios u
 WHERE u.cod_alumno = e.cod_alumno
   AND e.usuario_id IS NULL;

-- Constraint de estado_academico
ALTER TABLE estudiantes
    DROP CONSTRAINT IF EXISTS chk_estado_academico;
ALTER TABLE estudiantes
    ADD CONSTRAINT chk_estado_academico
    CHECK (estado_academico IN ('normal', 'bajo_rendimiento', 'suspendido'));

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3: Ampliar tabla programas con campos HU_DB §4.3
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE programas
    ADD COLUMN IF NOT EXISTS codigo    VARCHAR(20)  NULL,
    ADD COLUMN IF NOT EXISTS facultad  VARCHAR(100) NOT NULL DEFAULT 'Sin asignar',
    ADD COLUMN IF NOT EXISTS activo    BOOLEAN      NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Poblar códigos de programas existentes
UPDATE programas SET codigo = CONCAT('PROG-', id_programa) WHERE codigo IS NULL;
ALTER TABLE programas ALTER COLUMN codigo SET NOT NULL;
ALTER TABLE programas DROP CONSTRAINT IF EXISTS uq_programas_codigo;
ALTER TABLE programas ADD CONSTRAINT uq_programas_codigo UNIQUE (codigo);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 4: Ampliar tabla cursos con campos HU_DB §4.4
-- ─────────────────────────────────────────────────────────────────────────────

-- La tabla cursos tiene PK cod_curso (VARCHAR). Agregamos columna id BIGINT
-- para compatibilidad con las nuevas tablas que referencian por entero.
ALTER TABLE cursos
    ADD COLUMN IF NOT EXISTS id           SERIAL  UNIQUE,
    ADD COLUMN IF NOT EXISTS creditos     SMALLINT NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS programa_id  INT      NULL REFERENCES programas(id_programa),
    ADD COLUMN IF NOT EXISTS semestre_base SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS activo       BOOLEAN  NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 5: Ampliar tabla solicitudes con campos HU_DB §4.7
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE solicitudes
    ADD COLUMN IF NOT EXISTS codigo_solicitud  VARCHAR(20)  NULL,
    ADD COLUMN IF NOT EXISTS validacion_json   JSONB        NULL,
    ADD COLUMN IF NOT EXISTS fecha_resolucion  TIMESTAMPTZ  NULL,
    ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS deleted_at        TIMESTAMPTZ  NULL,
    ADD COLUMN IF NOT EXISTS created_by        BIGINT       NULL,
    ADD COLUMN IF NOT EXISTS updated_by        BIGINT       NULL;

-- Generar codigo_solicitud para registros existentes
UPDATE solicitudes
   SET codigo_solicitud = CONCAT('REQ-', EXTRACT(YEAR FROM fecha_creacion)::TEXT, '-', LPAD(id_solicitud::TEXT, 3, '0'))
 WHERE codigo_solicitud IS NULL;

ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS uq_solicitudes_codigo;
ALTER TABLE solicitudes ADD CONSTRAINT uq_solicitudes_codigo UNIQUE (codigo_solicitud);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 6: TABLA NUEVA — grupos_curso (HU_DB §4.5)
-- Reemplaza la lógica de secciones + horarios en una sola tabla.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grupos_curso (
    id              SERIAL          PRIMARY KEY,
    curso_id        INT             NOT NULL,
    codigo_grupo    VARCHAR(10)     NOT NULL,
    docente         VARCHAR(150)    NOT NULL DEFAULT 'Por asignar',
    jornada         VARCHAR(10)     NOT NULL
                    CHECK (jornada IN ('manana', 'tarde', 'noche')),
    dia_semana      VARCHAR(12)     NOT NULL
                    CHECK (dia_semana IN ('lunes','martes','miercoles','jueves','viernes','sabado')),
    hora_inicio     TIME            NOT NULL,
    hora_fin        TIME            NOT NULL,
    aula            VARCHAR(30)     NULL,
    cupo_maximo     SMALLINT        NOT NULL CHECK (cupo_maximo > 0),
    cupos_ocupados  SMALLINT        NOT NULL DEFAULT 0 CHECK (cupos_ocupados >= 0),
    periodo         VARCHAR(10)     NOT NULL,
    activo          BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_cupos_grupo         CHECK (cupos_ocupados <= cupo_maximo),
    CONSTRAINT chk_horario_coherente   CHECK (hora_fin > hora_inicio),
    CONSTRAINT uq_grupo_curso_periodo  UNIQUE (curso_id, codigo_grupo, periodo),
    CONSTRAINT fk_grupo_curso
        FOREIGN KEY (curso_id) REFERENCES cursos(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 7: TABLA NUEVA — historial_academico (nueva versión HU_DB §4.6)
-- La tabla original usa cod_alumno + cod_curso. La nueva usa IDs enteros.
-- Se crea como tabla adicional para no romper la existente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS historial_v2 (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estudiante_id   BIGINT          NOT NULL,
    curso_id        INT             NOT NULL,
    grupo_id        INT             NULL REFERENCES grupos_curso(id) ON UPDATE CASCADE ON DELETE SET NULL,
    periodo         VARCHAR(10)     NOT NULL,
    nota_final      DECIMAL(4,2)    NULL CHECK (nota_final IS NULL OR nota_final BETWEEN 0.00 AND 5.00),
    estado          VARCHAR(12)     NOT NULL DEFAULT 'en_curso'
                    CHECK (estado IN ('en_curso', 'aprobada', 'reprobada', 'cancelada')),
    numero_intentos SMALLINT        NOT NULL DEFAULT 1 CHECK (numero_intentos >= 1),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_historial_v2 UNIQUE (estudiante_id, curso_id, periodo),
    CONSTRAINT fk_historial_v2_curso
        FOREIGN KEY (curso_id) REFERENCES cursos(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 8: TABLA NUEVA — inscripciones_activas (HU_DB §4.10)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inscripciones_activas (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estudiante_id   BIGINT          NOT NULL,
    grupo_id        INT             NOT NULL REFERENCES grupos_curso(id)
                    ON UPDATE CASCADE ON DELETE RESTRICT,
    periodo         VARCHAR(10)     NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_inscripcion UNIQUE (estudiante_id, grupo_id, periodo)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 9: TABLA NUEVA — documentos_adjuntos (HU_DB §4.8)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documentos_adjuntos (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    solicitud_id    BIGINT          NOT NULL,
    nombre_archivo  VARCHAR(255)    NOT NULL,
    tipo_mime       VARCHAR(100)    NOT NULL,
    tamanio_bytes   INT             NOT NULL CHECK (tamanio_bytes > 0 AND tamanio_bytes <= 5242880),
    url_storage     TEXT            NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by      BIGINT          NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 10: TABLA NUEVA — notificaciones (HU_DB §4.9)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notificaciones (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id      BIGINT          NOT NULL,
    solicitud_id    BIGINT          NOT NULL,
    titulo          VARCHAR(200)    NOT NULL,
    mensaje         TEXT            NOT NULL,
    leido           BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 11: ÍNDICES de rendimiento (HU_DB §7 / CA-03)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_usuarios_codigo_estudiantil
    ON usuarios(codigo_estudiantil);

CREATE INDEX IF NOT EXISTS idx_usuarios_deleted
    ON usuarios(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_estudiantes_usuario_id
    ON estudiantes(usuario_id) WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_grupos_curso_busqueda
    ON grupos_curso(curso_id, jornada, periodo) WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_historial_v2_elegibilidad
    ON historial_v2(estudiante_id, curso_id);

CREATE INDEX IF NOT EXISTS idx_inscripciones_activas
    ON inscripciones_activas(estudiante_id, periodo);

CREATE INDEX IF NOT EXISTS idx_solicitudes_filtros
    ON solicitudes(periodo_academico) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 12: FUNCIÓN trigger updated_at genérica
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

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 13: TRIGGER gestión de cupos en grupos_curso
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_gestionar_cupos_grupo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (TG_OP = 'UPDATE')
      AND OLD.estado_solicitud NOT IN ('APROBADA')
      AND NEW.estado_solicitud = 'APROBADA'
      AND NEW.id_seccion_destino IS NOT NULL THEN
        UPDATE secciones
           SET cupos_disponibles = GREATEST(cupos_disponibles - 1, 0)
         WHERE id_seccion = NEW.id_seccion_destino;
    ELSIF (TG_OP = 'UPDATE')
      AND OLD.estado_solicitud = 'APROBADA'
      AND NEW.estado_solicitud = 'RECHAZADA'
      AND NEW.id_seccion_destino IS NOT NULL THEN
        UPDATE secciones
           SET cupos_disponibles = LEAST(cupos_disponibles + 1, cupos_totales)
         WHERE id_seccion = NEW.id_seccion_destino;
    END IF;
    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 14: SEED DATA — grupos_curso para periodo 2026-1
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO grupos_curso
    (curso_id, codigo_grupo, docente, jornada, dia_semana, hora_inicio, hora_fin,
     aula, cupo_maximo, cupos_ocupados, periodo)
SELECT c.id, g.codigo_grupo, g.docente, g.jornada,
       g.dia_semana, g.hora_inicio::TIME, g.hora_fin::TIME,
       g.aula, g.cupo_maximo, g.cupos_ocupados, '2026-1'
FROM (VALUES
    ('MAT101','G-01','Dr. Ramon Suarez',  'manana','lunes',     '07:00','09:00','Aula-201',35, 9),
    ('MAT101','G-02','Dr. Ramon Suarez',  'manana','miercoles', '07:00','09:00','Aula-201',35, 9),
    ('MAT101','G-03','Dra. Elena Mora',   'noche', 'lunes',     '18:00','20:00','Aula-301',30, 0),
    ('PRG201','G-01','Ing. Jorge Baena',  'manana','lunes',     '08:00','10:00','Lab-101', 40,15),
    ('PRG201','G-02','Ing. Jorge Baena',  'manana','viernes',   '07:00','09:00','Lab-101', 40,15),
    ('PRG201','G-03','Ing. Pedro Nieto',  'tarde', 'martes',    '14:00','16:00','Lab-102', 35, 5),
    ('EST301','G-01','Dra. Clara Reyes',  'manana','martes',    '07:00','09:00','Aula-202',30, 8),
    ('EST301','G-02','Dra. Clara Reyes',  'manana','jueves',    '07:00','09:00','Aula-202',30, 8)
) AS g(cod, codigo_grupo, docente, jornada, dia_semana, hora_inicio, hora_fin,
       aula, cupo_maximo, cupos_ocupados)
JOIN cursos c ON c.cod_curso = g.cod
ON CONFLICT (curso_id, codigo_grupo, periodo) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 15: Agregar campos para código estudiantil en usuarios existentes
--          y actualizar seed con nuevos campos HU_DB
-- ─────────────────────────────────────────────────────────────────────────────

-- Actualizar usuarios existentes con email de estudiantes para que primer_login = FALSE
UPDATE usuarios u
   SET primer_login      = FALSE,
       codigo_estudiantil = u.cod_alumno
 WHERE u.rol IN ('ESTUDIANTE', 'SECRETARIA', 'ADMIN')
   AND u.primer_login = TRUE;

-- Poblar historial_v2 desde historial_academico existente
INSERT INTO historial_v2 (estudiante_id, curso_id, periodo, nota_final, estado, numero_intentos)
SELECT
    e.id_estudiante_seq,
    c.id,
    p.periodo_string,
    NULL,
    CASE ha.estado_materia
        WHEN 'CURSANDO'  THEN 'en_curso'
        WHEN 'REPROBADA' THEN 'reprobada'
        WHEN 'APROBADA'  THEN 'aprobada'
        ELSE 'en_curso'
    END,
    GREATEST(ha.nro_repitencias, 1)
FROM historial_academico ha
JOIN cursos c ON c.cod_curso = ha.cod_curso
JOIN (
    SELECT cod_alumno,
           ROW_NUMBER() OVER (ORDER BY cod_alumno) AS id_estudiante_seq
    FROM estudiantes
) e ON e.cod_alumno = ha.cod_alumno
CROSS JOIN (SELECT '2025-2' AS periodo_string) p
WHERE c.id IS NOT NULL
ON CONFLICT (estudiante_id, curso_id, periodo) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIN MIGRACIÓN 004
-- ─────────────────────────────────────────────────────────────────────────────
COMMIT;

