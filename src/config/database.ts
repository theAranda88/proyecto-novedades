// src/config/database.ts
// Configuración del pool de conexiones a PostgreSQL

import { Pool } from 'pg';
import dotenv   from 'dotenv';

dotenv.config({ quiet: true });

/**
 * Pool de conexiones a la base de datos PostgreSQL.
 * Reutiliza conexiones para evitar overhead de apertura/cierre.
 * Máximo 10 conexiones simultáneas configuradas.
 * Lee las credenciales desde las variables de entorno (.env).
 */
export const pool = new Pool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     ?? 'proyecto_novedades',
  user:     process.env.DB_USER     ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  max:      10,
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 2000,
});

// Verificar la conexión al iniciar el servidor
pool.connect((err, client, release) => {
  if (err) {
    console.error(' Error al conectar con PostgreSQL:', err.message);
    return;
  }
  console.log(' Conexión a PostgreSQL establecida correctamente');
  release();
});

