-- =============================================================================
--  SISTEMA: Proyecto Novedades
--  BASE DE DATOS: PostgreSQL
--  DESCRIPCION: Script de creacion de base de datos relacional para la gestion
--               de novedades academicas (adiciones, cambios de jornada y
--               cursos dirigidos).
--  VALIDACIONES AUTOMATIZADAS:
--    1. Matricula activa del estudiante
--    2. Limite de 3 solicitudes por semestre
--    3. Maximo de repitencias (2 reprobadas)
--    4. Cupos disponibles en la seccion
--    5. Cruces de horario entre secciones
--  FECHA: 2026-02-28
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- TABLA: Programas
-- Almacena los programas academicos de la institucion.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Programas (
    id_programa     SERIAL          PRIMARY KEY,
    nombre_programa VARCHAR(150)    NOT NULL UNIQUE
);

-- -----------------------------------------------------------------------------
-- TABLA: Estudiantes
-- Almacena la informacion basica de cada estudiante matriculado.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Estudiantes (
    cod_alumno              VARCHAR(20)     PRIMARY KEY,
    doc_alumno              VARCHAR(20)     NOT NULL UNIQUE,
    nombre_completo         VARCHAR(200)    NOT NULL,
    email_institucional     VARCHAR(150)    NOT NULL UNIQUE,
    password_hash           VARCHAR(255)    NOT NULL DEFAULT '',
    semestre                SMALLINT        NOT NULL CHECK (semestre BETWEEN 1 AND 12),
    id_programa             INT             NOT NULL,
    matricula_activa        BOOLEAN         NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_estudiante_programa
        FOREIGN KEY (id_programa)
        REFERENCES Programas (id_programa)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- -----------------------------------------------------------------------------
-- TABLA: Cursos
-- Catalogo de cursos/materias ofertados por la institucion.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Cursos (
    cod_curso       VARCHAR(20)     PRIMARY KEY,
    nombre_curso    VARCHAR(200)    NOT NULL UNIQUE
);

-- -----------------------------------------------------------------------------
-- TABLA: Secciones
-- Cada fila representa un grupo especifico de un curso con su jornada y cupos.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Secciones (
    id_seccion          SERIAL          PRIMARY KEY,
    cod_curso           VARCHAR(20)     NOT NULL,
    jornada             VARCHAR(10)     NOT NULL CHECK (jornada IN ('Diurna', 'Nocturna')),
    grupo               CHAR(1)         NOT NULL CHECK (grupo IN ('A', 'B', 'C', 'D')),
    cupos_totales       SMALLINT        NOT NULL CHECK (cupos_totales > 0),
    cupos_disponibles   SMALLINT        NOT NULL CHECK (cupos_disponibles >= 0),

    CONSTRAINT fk_seccion_curso
        FOREIGN KEY (cod_curso)
        REFERENCES Cursos (cod_curso)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_cupos_coherentes
        CHECK (cupos_disponibles <= cupos_totales),

    CONSTRAINT uq_seccion_unica
        UNIQUE (cod_curso, jornada, grupo)
);

-- -----------------------------------------------------------------------------
-- TABLA: Horarios_Seccion
-- Define los bloques horarios de cada seccion (dia, hora inicio, hora fin).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Horarios_Seccion (
    id_horario      SERIAL          PRIMARY KEY,
    id_seccion      INT             NOT NULL,
    dia_semana      VARCHAR(10)     NOT NULL
                        CHECK (dia_semana IN ('Lunes','Martes','Miercoles',
                                              'Jueves','Viernes','Sabado')),
    hora_inicio     TIME            NOT NULL,
    hora_fin        TIME            NOT NULL,

    CONSTRAINT fk_horario_seccion
        FOREIGN KEY (id_seccion)
        REFERENCES Secciones (id_seccion)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT chk_horas_coherentes
        CHECK (hora_fin > hora_inicio)
);

-- -----------------------------------------------------------------------------
-- TABLA: Historial_Academico
-- Registra el historial de cada estudiante por curso (intentos y estado actual).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Historial_Academico (
    id_historial        SERIAL          PRIMARY KEY,
    cod_alumno          VARCHAR(20)     NOT NULL,
    cod_curso           VARCHAR(20)     NOT NULL,
    nro_repitencias     SMALLINT        NOT NULL DEFAULT 0
                            CHECK (nro_repitencias >= 0),
    estado_materia      VARCHAR(15)     NOT NULL DEFAULT 'CURSANDO'
                            CHECK (estado_materia IN ('CURSANDO','REPROBADA','APROBADA')),

    CONSTRAINT fk_historial_alumno
        FOREIGN KEY (cod_alumno)
        REFERENCES Estudiantes (cod_alumno)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_historial_curso
        FOREIGN KEY (cod_curso)
        REFERENCES Cursos (cod_curso)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT uq_historial_alumno_curso
        UNIQUE (cod_alumno, cod_curso)
);

-- -----------------------------------------------------------------------------
-- TABLA: Solicitudes
-- Captura las novedades academicas solicitadas por los estudiantes.
-- Incluye todos los campos exigidos por los formularios universitarios.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Solicitudes (
    id_solicitud            SERIAL          PRIMARY KEY,
    cod_alumno              VARCHAR(20)     NOT NULL,
    tipo_novedad            VARCHAR(20)     NOT NULL
                                CHECK (tipo_novedad IN ('ADICION',
                                                        'CAMBIO_JORNADA',
                                                        'CURSO_DIRIGIDO')),
    id_seccion_destino      INT             NOT NULL,
    id_seccion_origen       INT             NULL,
    motivo_novedad          TEXT            NOT NULL,
    justificacion_detallada TEXT            NOT NULL,
    adjunto_recibo_pago     TEXT            NULL,
    estado_solicitud        VARCHAR(15)     NOT NULL DEFAULT 'PENDIENTE'
                                CHECK (estado_solicitud IN ('PENDIENTE',
                                                            'APROBADA',
                                                            'RECHAZADA')),
    periodo_academico       VARCHAR(7)      NOT NULL,
    fecha_creacion          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_solicitud_alumno
        FOREIGN KEY (cod_alumno)
        REFERENCES Estudiantes (cod_alumno)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_solicitud_seccion_destino
        FOREIGN KEY (id_seccion_destino)
        REFERENCES Secciones (id_seccion)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_solicitud_seccion_origen
        FOREIGN KEY (id_seccion_origen)
        REFERENCES Secciones (id_seccion)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_secciones_distintas
        CHECK (id_seccion_origen IS NULL OR id_seccion_origen <> id_seccion_destino),

    CONSTRAINT chk_periodo_formato
        CHECK (periodo_academico ~ '^\d{4}-[1-3]$')
);

-- =============================================================================
--  INDICES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_solicitudes_alumno_periodo
    ON Solicitudes (cod_alumno, periodo_academico);

CREATE INDEX IF NOT EXISTS idx_horarios_seccion_dia
    ON Horarios_Seccion (id_seccion, dia_semana);

CREATE INDEX IF NOT EXISTS idx_historial_alumno_curso
    ON Historial_Academico (cod_alumno, cod_curso);

CREATE INDEX IF NOT EXISTS idx_estudiantes_programa
    ON Estudiantes (id_programa);

-- =============================================================================
--  FUNCIONES Y TRIGGERS DE VALIDACION
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FUNCION: fn_validar_solicitud
-- Trigger BEFORE INSERT en Solicitudes.
-- Ejecuta 5 validaciones en cascada antes de permitir el registro.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_solicitud()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_matricula_activa  BOOLEAN;
    v_total_solicitudes INT;
    v_nro_repitencias   SMALLINT;
    v_cupos_disp        SMALLINT;
    v_cod_curso_destino VARCHAR(20);
    v_cruce             INT;
BEGIN

    -- VALIDACION 1: Matricula activa
    SELECT matricula_activa
      INTO v_matricula_activa
      FROM Estudiantes
     WHERE cod_alumno = NEW.cod_alumno;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Estudiante con codigo % no existe.', NEW.cod_alumno;
    END IF;

    IF v_matricula_activa = FALSE THEN
        RAISE EXCEPTION
            'El estudiante % no tiene matricula activa para el periodo %. '
            'No es posible radicar solicitudes de novedad.',
            NEW.cod_alumno, NEW.periodo_academico;
    END IF;

    -- VALIDACION 2: Limite de 3 solicitudes por periodo academico
    SELECT COUNT(*)
      INTO v_total_solicitudes
      FROM Solicitudes
     WHERE cod_alumno        = NEW.cod_alumno
       AND periodo_academico = NEW.periodo_academico
       AND estado_solicitud <> 'RECHAZADA';

    IF v_total_solicitudes >= 3 THEN
        RAISE EXCEPTION
            'El estudiante % ya registro % solicitudes activas en el periodo %. '
            'Se permite un maximo de 3 solicitudes por periodo academico.',
            NEW.cod_alumno, v_total_solicitudes, NEW.periodo_academico;
    END IF;

    -- VALIDACION 3: Repitencias (maximo 2 reprobaciones por curso)
    SELECT s.cod_curso
      INTO v_cod_curso_destino
      FROM Secciones s
     WHERE s.id_seccion = NEW.id_seccion_destino;

    SELECT nro_repitencias
      INTO v_nro_repitencias
      FROM Historial_Academico
     WHERE cod_alumno = NEW.cod_alumno
       AND cod_curso  = v_cod_curso_destino;

    IF FOUND AND v_nro_repitencias >= 2 THEN
        RAISE EXCEPTION
            'El estudiante % ha reprobado el curso % en % oportunidades. '
            'Supera el limite de repitencias permitido (2). '
            'Contacte a la coordinacion academica para continuar.',
            NEW.cod_alumno, v_cod_curso_destino, v_nro_repitencias;
    END IF;

    -- VALIDACION 4: Cupos disponibles en la seccion destino
    SELECT cupos_disponibles
      INTO v_cupos_disp
      FROM Secciones
     WHERE id_seccion = NEW.id_seccion_destino;

    IF v_cupos_disp <= 0 THEN
        RAISE EXCEPTION
            'La seccion % no tiene cupos disponibles en este momento. '
            'Consulte otras secciones del mismo curso.',
            NEW.id_seccion_destino;
    END IF;

    -- VALIDACION 5: Cruce de horario (Teorema de Allen para solapamiento)
    SELECT COUNT(*)
      INTO v_cruce
      FROM Horarios_Seccion    hn
      JOIN Horarios_Seccion    he
        ON hn.dia_semana  = he.dia_semana
       AND hn.hora_inicio < he.hora_fin
       AND hn.hora_fin    > he.hora_inicio
     WHERE hn.id_seccion = NEW.id_seccion_destino
       AND he.id_seccion IN (
               SELECT s2.id_seccion_destino
                 FROM Solicitudes s2
                WHERE s2.cod_alumno        = NEW.cod_alumno
                  AND s2.periodo_academico  = NEW.periodo_academico
                  AND s2.estado_solicitud  IN ('PENDIENTE', 'APROBADA')
                  AND s2.id_seccion_destino <> NEW.id_seccion_destino
           );

    IF v_cruce > 0 THEN
        RAISE EXCEPTION
            'La seccion % presenta cruce de horario con una o mas secciones '
            'que el estudiante % ya tiene registradas en el periodo %. '
            'Verifique los horarios antes de continuar.',
            NEW.id_seccion_destino, NEW.cod_alumno, NEW.periodo_academico;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_solicitud ON Solicitudes;
CREATE TRIGGER trg_validar_solicitud
    BEFORE INSERT ON Solicitudes
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_solicitud();

-- -----------------------------------------------------------------------------
-- FUNCION: fn_gestionar_cupos
-- Trigger AFTER INSERT / AFTER UPDATE en Solicitudes.
-- Descuenta un cupo al aprobar y lo devuelve al rechazar.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_gestionar_cupos()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    -- INSERT directo con estado APROBADA
    IF (TG_OP = 'INSERT') AND NEW.estado_solicitud = 'APROBADA' THEN
        UPDATE Secciones
           SET cupos_disponibles = cupos_disponibles - 1
         WHERE id_seccion = NEW.id_seccion_destino
           AND cupos_disponibles > 0;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'No se pudo descontar el cupo de la seccion %: cupos_disponibles ya es 0.',
                NEW.id_seccion_destino;
        END IF;

    -- PENDIENTE/cualquier estado -> APROBADA (descuenta cupo)
    ELSIF (TG_OP = 'UPDATE')
      AND OLD.estado_solicitud <> 'APROBADA'
      AND NEW.estado_solicitud  = 'APROBADA' THEN

        UPDATE Secciones
           SET cupos_disponibles = cupos_disponibles - 1
         WHERE id_seccion = NEW.id_seccion_destino
           AND cupos_disponibles > 0;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'No se pudo aprobar la solicitud %: la seccion % ya no tiene cupos.',
                NEW.id_solicitud, NEW.id_seccion_destino;
        END IF;

    -- APROBADA -> RECHAZADA (devuelve cupo)
    ELSIF (TG_OP = 'UPDATE')
      AND OLD.estado_solicitud = 'APROBADA'
      AND NEW.estado_solicitud = 'RECHAZADA' THEN

        UPDATE Secciones
           SET cupos_disponibles = cupos_disponibles + 1
         WHERE id_seccion = NEW.id_seccion_destino
           AND cupos_disponibles < cupos_totales;

    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gestionar_cupos ON Solicitudes;
CREATE TRIGGER trg_gestionar_cupos
    AFTER INSERT OR UPDATE OF estado_solicitud ON Solicitudes
    FOR EACH ROW
    EXECUTE FUNCTION fn_gestionar_cupos();

-- =============================================================================
--  DATOS DE PRUEBA (SEED DATA)
-- =============================================================================

-- Programas
INSERT INTO Programas (nombre_programa) VALUES
    ('Ingenieria de Sistemas'),
    ('Administracion de Empresas'),
    ('Contaduria Publica')
ON CONFLICT DO NOTHING;

-- Cursos
INSERT INTO Cursos (cod_curso, nombre_curso) VALUES
    ('MAT101', 'Calculo Diferencial'),
    ('PRG201', 'Programacion Orientada a Objetos'),
    ('EST301', 'Estadistica Descriptiva')
ON CONFLICT DO NOTHING;

-- Estudiantes
-- password_hash corresponde a: Password123 (bcrypt 10 rounds)
INSERT INTO Estudiantes
    (cod_alumno, doc_alumno, nombre_completo, email_institucional,
     password_hash, semestre, id_programa, matricula_activa)
VALUES
    ('2024001', '1000123456', 'Carlos Andres Perez Lopez',
     'c.perez@proyectonovedades.edu.co',
     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
     3, 1, TRUE),
    ('2024002', '1000654321', 'Laura Sofia Gomez Rivera',
     'l.gomez@proyectonovedades.edu.co',
     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
     2, 1, TRUE),
    ('2023010', '1000999888', 'Miguel Torres Castillo',
     'm.torres@proyectonovedades.edu.co',
     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
     5, 2, FALSE)  -- Matricula inactiva (prueba de bloqueo)
ON CONFLICT DO NOTHING;

-- Secciones
INSERT INTO Secciones (cod_curso, jornada, grupo, cupos_totales, cupos_disponibles)
VALUES
    ('MAT101', 'Diurna',   'A', 35, 10),
    ('MAT101', 'Nocturna', 'B', 30,  0),  -- Sin cupos (prueba de bloqueo)
    ('PRG201', 'Diurna',   'A', 40, 15),
    ('PRG201', 'Nocturna', 'C', 35,  5),
    ('EST301', 'Diurna',   'A', 30,  8)
ON CONFLICT DO NOTHING;

-- Horarios — MAT101 Diurna A (id_seccion = 1)
INSERT INTO Horarios_Seccion (id_seccion, dia_semana, hora_inicio, hora_fin) VALUES
    (1, 'Lunes',     '07:00', '09:00'),
    (1, 'Miercoles', '07:00', '09:00');

-- Horarios — MAT101 Nocturna B (id_seccion = 2)
INSERT INTO Horarios_Seccion (id_seccion, dia_semana, hora_inicio, hora_fin) VALUES
    (2, 'Lunes',     '18:00', '20:00'),
    (2, 'Miercoles', '18:00', '20:00');

-- Horarios — PRG201 Diurna A (id_seccion = 3) — cruza con seccion 1 los lunes
INSERT INTO Horarios_Seccion (id_seccion, dia_semana, hora_inicio, hora_fin) VALUES
    (3, 'Lunes',   '08:00', '10:00'),
    (3, 'Viernes', '07:00', '09:00');

-- Horarios — PRG201 Nocturna C (id_seccion = 4)
INSERT INTO Horarios_Seccion (id_seccion, dia_semana, hora_inicio, hora_fin) VALUES
    (4, 'Martes', '18:00', '20:00'),
    (4, 'Jueves', '18:00', '20:00');

-- Horarios — EST301 Diurna A (id_seccion = 5)
INSERT INTO Horarios_Seccion (id_seccion, dia_semana, hora_inicio, hora_fin) VALUES
    (5, 'Martes', '07:00', '09:00'),
    (5, 'Jueves', '07:00', '09:00');

-- Historial academico
INSERT INTO Historial_Academico (cod_alumno, cod_curso, nro_repitencias, estado_materia)
VALUES
    ('2024001', 'MAT101', 2, 'REPROBADA'),  -- Bloqueado por repitencias (prueba)
    ('2024002', 'EST301', 0, 'APROBADA')
ON CONFLICT DO NOTHING;

-- =============================================================================
--  FIN DEL SCRIPT — Proyecto Novedades
-- =============================================================================
COMMIT;

