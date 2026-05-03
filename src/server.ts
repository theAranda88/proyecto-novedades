// src/server.ts
// Punto de entrada del servidor — compatible con Node.js tradicional y Vercel serverless
// ACTUALIZADO: Integrado Socket.io para notificaciones en tiempo real

import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { createServer } from 'http';
import app  from './app';
import { pool } from './config/database';
import { inicializarSocket } from './config/socketio';
import { orquestradorNotificaciones } from './services/NotificationOrchestrator';

const PUERTO = Number(process.env.PORT) || 3000;
const IS_VERCEL = !!process.env.VERCEL;

/**
 * Iniciar en DESARROLLO o Node.js tradicional
 * - Crear servidor HTTP
 * - Integrar Socket.io
 * - Bind al puerto 3000
 * - Verificar conexión a PostgreSQL
 */
async function iniciarServidor(): Promise<void> {
  try {
    // Verificar conexión a PostgreSQL antes de levantar el servidor (solo en desarrollo)
    if (!IS_VERCEL) {
      const verificacion = await pool.query('SELECT NOW()');
      console.log('✓ Conexión a PostgreSQL verificada:', verificacion.rows[0].now);
    }

    if (!IS_VERCEL) {
      // ─────────────────────────────────────────────────────────────────────────────
      // Crear servidor HTTP (necesario para Socket.io)
      // ─────────────────────────────────────────────────────────────────────────────
      const httpServer = createServer(app);

      // ─────────────────────────────────────────────────────────────────────────────
      // Inicializar Socket.io
      // ─────────────────────────────────────────────────────────────────────────────
      const io = inicializarSocket(httpServer);

      // ─────────────────────────────────────────────────────────────────────────────
      // Establecer IO en app para que controllers/services lo accedan
      // ─────────────────────────────────────────────────────────────────────────────
      app.set('io', io);
      orquestradorNotificaciones.establecerIO(io);

      // ─────────────────────────────────────────────────────────────────────────────
      // Escuchar en puerto
      // ─────────────────────────────────────────────────────────────────────────────
      httpServer.listen(PUERTO, () => {
        console.log('==============================================');
        console.log(' Servidor Proyecto Novedades iniciado');
        console.log(` Puerto   : ${PUERTO}`);
        console.log(` Ambiente : ${process.env.NODE_ENV || 'development'}`);
        console.log(' WebSocket: ✅ Socket.io activado');
        console.log('==============================================');
      });
    }
  } catch (error) {
    console.error('✗ Error al iniciar el servidor:', (error as Error).message);
    if (!IS_VERCEL) {
      process.exit(1);
    }
  }
}

// En desarrollo o Node tradicional: iniciar ahora
// En Vercel: exportar app como handler (ver más abajo)
if (!IS_VERCEL) {
  iniciarServidor();
}

/**
 * Exportar app para Vercel serverless
 * Vercel llama automáticamente a este export
 */
export default app;



