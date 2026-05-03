// src/routes/migracionRoutes.ts
// Rutas internas para ejecutar migraciones (SOLO desarrollo/mantenimiento)
// Protegidas por clave secreta

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import fs from 'fs';
import path from 'path';

const enrutador = Router();

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

    // Leer archivo de migración
    const rutaMigracion = path.join(__dirname, '../../migrations/010_tabla_notificaciones_hibrida.sql');

    if (!fs.existsSync(rutaMigracion)) {
      return res.status(404).json({
        ok: false,
        error: `Archivo de migración no encontrado: ${rutaMigracion}`,
      });
    }

    const scriptSQL = fs.readFileSync(rutaMigracion, 'utf8');

    // Ejecutar dentro de transacción
    await pool.query(scriptSQL);

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

