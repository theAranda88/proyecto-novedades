// src/server.ts
// Punto de entrada del servidor — inicializa la conexión y levanta Express

import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import app  from './app';
import { pool } from './config/database';

const PUERTO = Number(process.env.PORT) || 3000;

/**
 * Inicia el servidor Express tras verificar la conexión a PostgreSQL.
 * Si la BD no responde, el proceso termina con código de error.
 */
async function iniciarServidor(): Promise<void> {
  try {
    // Verificar conexión a PostgreSQL antes de levantar el servidor
    await pool.query('SELECT 1');
    console.log(' Conexión a PostgreSQL verificada');

    app.listen(PUERTO, () => {
      console.log('==============================================');
      console.log(` Servidor Proyecto Novedades iniciado`);
      console.log(` Puerto   : ${PUERTO}`);
      console.log('==============================================');
    });
  } catch (error) {
    console.error(' Error al iniciar el servidor:', (error as Error).message);
    process.exit(1);
  }
}

iniciarServidor();

