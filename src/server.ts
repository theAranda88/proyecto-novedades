// src/server.ts
// Punto de entrada del servidor — compatible con Node.js tradicional y Vercel serverless

import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import app  from './app';
import { pool } from './config/database';

const PUERTO = Number(process.env.PORT) || 3000;
const IS_VERCEL = !!process.env.VERCEL;

/**
 * Iniciar en DESARROLLO o Node.js tradicional
 * - Bind al puerto 3000
 * - Verificar conexión a PostgreSQL
 */
async function iniciarServidor(): Promise<void> {
  try {
    // Verificar conexión a PostgreSQL antes de levantar el servidor
    const verificacion = await pool.query('SELECT NOW()');
    console.log('✓ Conexión a PostgreSQL verificada:', verificacion.rows[0].now);

    if (!IS_VERCEL) {
      app.listen(PUERTO, () => {
        console.log('==============================================');
        console.log(' Servidor Proyecto Novedades iniciado');
        console.log(` Puerto   : ${PUERTO}`);
        console.log(` Ambiente : ${process.env.NODE_ENV || 'development'}`);
        console.log('==============================================');
      });
    }
  } catch (error) {
    console.error('✗ Error al iniciar el servidor:', (error as Error).message);
    process.exit(1);
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

/**
 * Para desarrollo local sin Vercel:
 * npm run dev     — usa nodemon + ts-node
 * npm run build   — compila a dist/
 * npm start       — ejecuta dist/server.js
 */


