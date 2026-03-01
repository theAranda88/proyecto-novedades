-- =============================================================================
--  MIGRACIÓN 003: Sistema de Roles y Tabla Usuarios
--  Agrega soporte para roles SECRETARIA, ESTUDIANTE y ADMIN
--
--  ANÁLISIS DE CAMBIOS:
--  - La tabla Estudiantes solo maneja datos académicos del alumno.
--  - Se crea tabla Usuarios para gestionar acceso al sistema con roles.
--  - Cada estudiante tendrá también un registro en Usuarios.
--  - Secretaria y Admin tienen registro solo en Usuarios (no en Estudiantes).
--  - El password_hash se mueve a Usuarios (Estudiantes deja de tenerlo).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PASO 1: Crear tipo ENUM para roles del sistema
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE rol_sistema AS ENUM ('ESTUDIANTE', 'SECRETARIA', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- PASO 2: Crear tabla Usuarios
-- Gestiona el acceso al sistema para todos los tipos de usuario.
-- Un usuario tipo ESTUDIANTE debe tener un cod_alumno asociado.
-- Un usuario tipo SECRETARIA o ADMIN no tiene cod_alumno.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Usuarios (
    id_usuario          SERIAL              PRIMARY KEY,
    nombre_completo     VARCHAR(200)        NOT NULL,
    email_institucional VARCHAR(150)        NOT NULL UNIQUE,
    password_hash       VARCHAR(255)        NOT NULL,
    rol                 rol_sistema         NOT NULL DEFAULT 'ESTUDIANTE',
    activo              BOOLEAN             NOT NULL DEFAULT TRUE,
    cod_alumno          VARCHAR(20)         NULL,       -- Solo para rol ESTUDIANTE
    fecha_creacion      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    -- Un estudiante solo puede tener un usuario
    CONSTRAINT uq_usuario_alumno
        UNIQUE (cod_alumno),

    -- El cod_alumno solo aplica a estudiantes
    CONSTRAINT chk_alumno_solo_estudiante
        CHECK (
            (rol = 'ESTUDIANTE' AND cod_alumno IS NOT NULL)
            OR
            (rol IN ('SECRETARIA', 'ADMIN') AND cod_alumno IS NULL)
        ),

    CONSTRAINT fk_usuario_estudiante
        FOREIGN KEY (cod_alumno)
        REFERENCES Estudiantes (cod_alumno)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- PASO 3: Crear índices para búsquedas frecuentes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_usuarios_email
    ON Usuarios (email_institucional);

CREATE INDEX IF NOT EXISTS idx_usuarios_rol
    ON Usuarios (rol);

CREATE INDEX IF NOT EXISTS idx_usuarios_cod_alumno
    ON Usuarios (cod_alumno)
    WHERE cod_alumno IS NOT NULL;

-- -----------------------------------------------------------------------------
-- PASO 4: Migrar estudiantes existentes a la tabla Usuarios
-- Los estudiantes existentes se convierten en usuarios con rol ESTUDIANTE.
-- Se toma el password_hash que ya tienen en la tabla Estudiantes.
-- -----------------------------------------------------------------------------
INSERT INTO Usuarios (nombre_completo, email_institucional, password_hash, rol, activo, cod_alumno)
SELECT
    nombre_completo,
    email_institucional,
    password_hash,
    'ESTUDIANTE',
    matricula_activa,
    cod_alumno
FROM Estudiantes
ON CONFLICT (email_institucional) DO NOTHING;

-- -----------------------------------------------------------------------------
-- PASO 5: Insertar usuarios de prueba — SECRETARIA y ADMIN
-- password_hash corresponde a: AdminPass123 (bcrypt 10 rounds)
-- ⚠️  Solo para desarrollo. Cambiar en producción.
-- -----------------------------------------------------------------------------
INSERT INTO Usuarios (nombre_completo, email_institucional, password_hash, rol, activo, cod_alumno)
VALUES
    (
        'Ana Maria Rodriguez',
        'secretaria@proyectonovedades.edu.co',
        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
        'SECRETARIA',
        TRUE,
        NULL
    ),
    (
        'Administrador del Sistema',
        'admin@proyectonovedades.edu.co',
        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
        'ADMIN',
        TRUE,
        NULL
    )
ON CONFLICT (email_institucional) DO NOTHING;

-- -----------------------------------------------------------------------------
-- PASO 6: Agregar columna atendido_por en Solicitudes
-- Registra qué usuario (secretaria/admin) gestionó la solicitud.
-- -----------------------------------------------------------------------------
ALTER TABLE Solicitudes
    ADD COLUMN IF NOT EXISTS atendido_por INT NULL,
    ADD COLUMN IF NOT EXISTS fecha_atencion TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS observacion_secretaria TEXT NULL;

ALTER TABLE Solicitudes
    ADD CONSTRAINT fk_solicitud_atendida_por
        FOREIGN KEY (atendido_por)
        REFERENCES Usuarios (id_usuario)
        ON UPDATE CASCADE
        ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- PASO 7: Verificar resultado
-- -----------------------------------------------------------------------------
SELECT
    id_usuario,
    nombre_completo,
    email_institucional,
    rol,
    activo,
    cod_alumno
FROM Usuarios
ORDER BY rol, id_usuario;

COMMIT;

