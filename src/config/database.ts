// src/config/database.ts
// Configuración del pool de conexiones a PostgreSQL
// LAZY CONNECTION: Solo se conecta cuando se necesita (para Vercel serverless)

import { Pool, PoolConfig } from 'pg';
import dotenv   from 'dotenv';

dotenv.config({ quiet: true });

const poolConfig: PoolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
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

// NO conectar automáticamente al importar (causa problemas en Vercel)
// Las conexiones se hacen bajo demanda cuando se ejecutan queries

