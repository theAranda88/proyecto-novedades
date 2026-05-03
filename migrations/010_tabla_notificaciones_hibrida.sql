-- =============================================================================
-- Migración 010: Extender tabla notificaciones para arquitectura híbrida
-- =============================================================================
-- DESCRIPCIÓN:
--   Agrega campos para soporte de Firebase Cloud Messaging (FCM)
--   Permite rastrear device tokens, intentos de reintento y sincronización
--   entre canales de notificación (WebSocket + FCM + BD)
--
-- CAMBIOS:
--   1. Agregar campo `tipo_notificacion` (enum)
--   2. Agregar campo `canal_envio` para registrar si se envió por Socket.io o FCM
--   3. Agregar campo `intentos_reintento` para FCM
--   4. Agregar campo `proxima_lectura` para sincronización multi-dispositivo
--   5. Crear índices de rendimiento
--   6. Crear tabla `dispositivos_push` para gestionar device tokens
--
-- EJECUTAR:
--   PGPASSWORD=admin123 psql -U postgres -d proyecto_novedades -f migrations/010_tabla_notificaciones_hibrida.sql
--
-- VERIFICAR:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='notificaciones' ORDER BY ordinal_position;
--
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CREAR ENUM PARA TIPO DE NOTIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE tipo_notificacion_enum AS ENUM (
        'solicitud_nueva',
        'solicitud_aprobada',
        'solicitud_rechazada',
        'solicitud_revision',
        'cambio_estado',
        'general'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CREAR ENUM PARA CANAL DE ENVÍO
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE canal_envio_enum AS ENUM (
        'websocket',
        'fcm',
        'bd_pendiente',
        'fallback'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. EXTENDER TABLA notificaciones
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE notificaciones
ADD COLUMN IF NOT EXISTS tipo_notificacion tipo_notificacion_enum DEFAULT 'general',
ADD COLUMN IF NOT EXISTS canal_envio canal_envio_enum NOT NULL DEFAULT 'bd_pendiente',
ADD COLUMN IF NOT EXISTS intentos_reintento SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS proxima_lectura TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Agregar columna solicitud_id si no existe (en caso de migración incompleta)
ALTER TABLE notificaciones
ADD COLUMN IF NOT EXISTS solicitud_id BIGINT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CREAR TABLA dispositivos_push (gestión de device tokens para FCM)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dispositivos_push (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id BIGINT NOT NULL,
    device_token VARCHAR(1000) NOT NULL,
    plataforma VARCHAR(50) NOT NULL CHECK (plataforma IN ('web', 'ios', 'android')),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ultima_uso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    UNIQUE(usuario_id, device_token, plataforma)
);

CREATE INDEX idx_dispositivos_push_usuario_activo
    ON dispositivos_push(usuario_id, activo) WHERE activo = TRUE;

CREATE INDEX idx_dispositivos_push_device_token
    ON dispositivos_push(device_token);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CREAR ÍNDICES DE RENDIMIENTO EN notificaciones
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_leido
    ON notificaciones(usuario_id, leido) WHERE leido = FALSE;

CREATE INDEX IF NOT EXISTS idx_notificaciones_solicitud
    ON notificaciones(solicitud_id);

CREATE INDEX IF NOT EXISTS idx_notificaciones_canal_envio
    ON notificaciones(canal_envio);

CREATE INDEX IF NOT EXISTS idx_notificaciones_created_at
    ON notificaciones(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notificaciones_tipo
    ON notificaciones(tipo_notificacion);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CREAR VISTA: notificaciones_pendientes_por_usuario
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW notificaciones_pendientes_por_usuario AS
SELECT
    usuario_id,
    COUNT(*) as cantidad_no_leidas,
    MAX(created_at) as ultima_notificacion
FROM notificaciones
WHERE leido = FALSE
GROUP BY usuario_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. CREAR VISTA: estado_sincronizacion_dispositivos
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW estado_sincronizacion_dispositivos AS
SELECT
    u.id_usuario,
    u.nombre_completo,
    COUNT(DISTINCT dp.id) as dispositivos_activos,
    MAX(dp.ultima_uso) as ultima_actividad,
    STRING_AGG(DISTINCT dp.plataforma, ', ' ORDER BY dp.plataforma) as plataformas
FROM usuarios u
LEFT JOIN dispositivos_push dp ON u.id_usuario = dp.usuario_id AND dp.activo = TRUE
GROUP BY u.id_usuario, u.nombre_completo;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. COMENTARIOS DOCUMENTACIÓN
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE notificaciones IS
'Registra todas las notificaciones del sistema con soporte híbrido (WebSocket + FCM + BD)';

COMMENT ON COLUMN notificaciones.tipo_notificacion IS
'Tipo de evento: solicitud_nueva, solicitud_aprobada, solicitud_rechazada, etc.';

COMMENT ON COLUMN notificaciones.canal_envio IS
'Indica por qué canal se intentó enviar: websocket, fcm, bd_pendiente, fallback';

COMMENT ON COLUMN notificaciones.intentos_reintento IS
'Contador de intentos fallidos de reenvío por FCM (máximo 3)';

COMMENT ON COLUMN notificaciones.proxima_lectura IS
'Timestamp del siguiente intento de sincronización si el anterior falló';

COMMENT ON TABLE dispositivos_push IS
'Almacena device tokens de clientes para envío de notificaciones push via FCM';

COMMENT ON COLUMN dispositivos_push.metadata IS
'JSON con información adicional: navegador, SO, versión app, etc.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación POST-MIGRACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- Ejecutar manualmente después para validar:
/*
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'notificaciones'
ORDER BY ordinal_position;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'dispositivos_push'
ORDER BY ordinal_position;

SELECT * FROM information_schema.table_constraints
WHERE table_name = 'dispositivos_push';

SELECT * FROM pg_indexes
WHERE tablename IN ('notificaciones', 'dispositivos_push');
*/

