// src/config/database.ts
// Configuración del pool de conexiones a PostgreSQL

import { Pool, PoolConfig } from 'pg';
import dotenv   from 'dotenv';

dotenv.config({ quiet: true });

/**
 * Pool de conexiones a la base de datos PostgreSQL.
 * Reutiliza conexiones para evitar overhead de apertura/cierre.
 *
 * Soporta DOS modos de configuración:
 * 1. DATABASE_URL (recomendado para producción) — URL completa PostgreSQL
 * 2. Variables individuales (desarrollo) — DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *
 * En Railway: DATABASE_URL = postgresql://user:pass@host:port/dbname
 * En Vercel: POSTGRES_URL_NON_POOLING = similar
 */

const poolConfig: PoolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      // SSL requerido para Vercel/Railway en producción
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    }
  : {
      host:     process.env.DB_HOST     ?? 'localhost',
      port:     Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME     ?? 'proyecto_novedades',
      user:     process.env.DB_USER     ?? 'postgres',
      password: process.env.DB_PASSWORD ?? '',
      max:      10,
      idleTimeoutMillis:    30000,
      connectionTimeoutMillis: 2000,
    };

export const pool = new Pool(poolConfig);

// Verificar la conexión al iniciar el servidor
pool.connect((err, client, release) => {
  if (err) {
    console.error(' Error al conectar con PostgreSQL:', err.message);
    return;
  }
  console.log(' Conexión a PostgreSQL establecida correctamente');
  release();
});

// Manejador de errores de conexión (importante en producción)
pool.on('error', (err) => {
  console.error(' Error inesperado en el pool de PostgreSQL:', err);
});

// Graceful shutdown — cerrar conexiones antes de terminar el proceso
process.on('SIGINT', async () => {
  console.log(' ⚠ Señal SIGINT recibida — cerrando conexiones...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(' ⚠ Señal SIGTERM recibida — cerrando conexiones...');
  await pool.end();
  process.exit(0);
});

