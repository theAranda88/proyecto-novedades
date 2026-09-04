-- =============================================================================
--  MIGRACIÓN 011: Login Google + campos de sincronización en estudiantes
--
--  - usuarios.google_sub: identificador estable de la cuenta Google (Workspace)
--  - estudiantes.telefono: contacto Campus (opcional)
--  - estudiantes.anio_academico / periodo_academico / sesion_academica:
--    foto del período de matrícula (Campus API)
--
--  No ejecuta DELETE físico. Idempotente (IF NOT EXISTS).
--  Los correos reales @uniautonoma.edu.co para probar Google van en 012.
-- =============================================================================

BEGIN;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255) NULL;

ALTER TABLE estudiantes
    ADD COLUMN IF NOT EXISTS telefono            VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS anio_academico      VARCHAR(10) NULL,
    ADD COLUMN IF NOT EXISTS periodo_academico   VARCHAR(10) NULL,
    ADD COLUMN IF NOT EXISTS sesion_academica    VARCHAR(10) NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'chk_estudiantes_sesion_academica'
    ) THEN
        ALTER TABLE estudiantes
            ADD CONSTRAINT chk_estudiantes_sesion_academica
            CHECK (sesion_academica IS NULL OR sesion_academica IN ('PREG', 'POSG'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_google_sub
    ON usuarios(google_sub)
    WHERE google_sub IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_email_institucional
    ON usuarios(LOWER(email_institucional))
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_estudiantes_periodo_academico
    ON estudiantes(anio_academico, periodo_academico, sesion_academica)
    WHERE deleted_at IS NULL;

COMMIT;
