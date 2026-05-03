// src/routes/migracionRoutes.ts
// Rutas internas para ejecutar migraciones (SOLO desarrollo/mantenimiento)
// Protegidas por clave secreta

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';

const enrutador = Router();

// SQL de Migración 010 - Incrustado para funcionar en Vercel
const MIGRACION_010_SQL = `
BEGIN;

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

DO $$ BEGIN
    CREATE TYPE canal_envio_enum AS ENUM (
        'websocket',
        'fcm',
        'bd_pendiente',
        'fallback'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE notificaciones
ADD COLUMN IF NOT EXISTS tipo_notificacion tipo_notificacion_enum DEFAULT 'general',
ADD COLUMN IF NOT EXISTS canal_envio canal_envio_enum NOT NULL DEFAULT 'bd_pendiente',
ADD COLUMN IF NOT EXISTS intentos_reintento SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS proxima_lectura TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE notificaciones
ADD COLUMN IF NOT EXISTS solicitud_id BIGINT;

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

CREATE INDEX IF NOT EXISTS idx_dispositivos_push_usuario_activo
    ON dispositivos_push(usuario_id, activo) WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_dispositivos_push_device_token
    ON dispositivos_push(device_token);

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

CREATE OR REPLACE VIEW notificaciones_pendientes_por_usuario AS
SELECT
    usuario_id,
    COUNT(*) as cantidad_no_leidas,
    MAX(created_at) as ultima_notificacion
FROM notificaciones
WHERE leido = FALSE
GROUP BY usuario_id;

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

COMMENT ON TABLE notificaciones IS
'Registra todas las notificaciones del sistema con soporte híbrido (WebSocket + FCM + BD)';

COMMENT ON COLUMN notificaciones.tipo_notificacion IS
'Tipo de evento: solicitud_nueva, solicitud_aprobada, solicitud_rechazada, etc.';

COMMENT ON COLUMN notificaciones.canal_envio IS
'Indica por qué canal se intentó enviar: websocket, fcm, bd_pendiente, fallback';

COMMENT ON TABLE dispositivos_push IS
'Almacena device tokens de clientes para envío de notificaciones push via FCM';

COMMIT;
`;

/**
 * GET /api/admin/migracion/estado
 * Verificar estado de migraciones
 */
enrutador.get('/estado', async (req: Request, res: Response) => {
  try {
    // Verificar tabla dispositivos_push
    const resultado = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'dispositivos_push'
      ) as existe;
    `);

    const existe = resultado.rows[0].existe;

    res.json({
      ok: true,
      migracion_010: {
        ejecutada: existe,
        tabla_dispositivos_push: existe ? 'CREADA' : 'FALTA',
      },
    });
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/migracion/ejecutar-010
 * Ejecutar migración 010 - Crear tabla dispositivos_push
 *
 * SEGURIDAD: Requiere clave secreta en header X-MIGRATION-KEY
 */
enrutador.post('/ejecutar-010', async (req: Request, res: Response) => {
  try {
    // Validar clave secreta
    const claveRecibida = req.headers['x-migration-key'];
    const claveEsperada = process.env.MIGRATION_SECRET_KEY || 'default-secret-change-me';

    if (claveRecibida !== claveEsperada) {
      return res.status(401).json({
        ok: false,
        error: 'Clave de migración inválida',
      });
    }

    console.log('[Migración] Ejecutando migración 010...');

    // Ejecutar SQL incrustado (funciona en Vercel)
    await pool.query(MIGRACION_010_SQL);

    console.log('[Migración] ✅ Migración 010 completada');

    // Verificar que tabla fue creada
    const verificacion = await pool.query(`
      SELECT COUNT(*) as columnas
      FROM information_schema.columns
      WHERE table_name = 'dispositivos_push';
    `);

    res.json({
      ok: true,
      mensaje: 'Migración 010 ejecutada exitosamente',
      tabla_dispositivos_push: {
        creada: true,
        columnas: verificacion.rows[0].columnas,
      },
    });
  } catch (error: any) {
    console.error('[Migración] Error:', error.message);

    res.status(500).json({
      ok: false,
      error: error.message,
      detalles: error.code || 'Error desconocido',
    });
  }
});

export default enrutador;

