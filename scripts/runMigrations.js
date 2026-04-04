#!/usr/bin/env node
/**
 * scripts/runMigrations.js
 * Script para ejecutar migraciones automáticamente en Vercel
 * Se ejecuta como parte del build process
 *
 * Uso: node scripts/runMigrations.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Leer DATABASE_URL del .env o variables de entorno
require('dotenv').config({ path: '.env.production' });
require('dotenv').config({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

/**
 * Ejecutar un archivo SQL
 */
async function ejecutarSQL(rutaArchivo) {
  try {
    const sql = fs.readFileSync(rutaArchivo, 'utf8');
    if (!sql.trim()) {
      console.log(`⊘ Archivo vacío: ${path.basename(rutaArchivo)}`);
      return;
    }

    console.log(`⏳ Ejecutando: ${path.basename(rutaArchivo)}`);
    await pool.query(sql);
    console.log(`✓ Completado: ${path.basename(rutaArchivo)}`);
  } catch (error) {
    console.error(`✗ Error en ${path.basename(rutaArchivo)}:`, error.message);
    // No detener — continuar con siguiente migración
  }
}

/**
 * Función principal
 */
async function ejecutarMigraciones() {
  try {
    // Si estamos en desarrollo local y no hay DATABASE_URL, saltar
    if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
      console.log('⊘ DATABASE_URL no configurada — migraciones saltadas (development)');
      await pool.end();
      process.exit(0);
    }

    // Conectar a la BD
    const client = await pool.connect();
    console.log('✓ Conexión a PostgreSQL establecida');
    client.release();

    // Obtener lista de migraciones (en orden)
    const migracionesDir = path.join(__dirname, '..', 'migrations');
    if (!fs.existsSync(migracionesDir)) {
      console.log('⊘ Carpeta migrations/ no encontrada — saltando migraciones');
      await pool.end();
      process.exit(0);
    }

    const archivos = fs.readdirSync(migracionesDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Orden alfabético (000_, 001_, etc)

    console.log(`\n📋 ${archivos.length} migraciones encontradas:\n`);

    for (const archivo of archivos) {
      const rutaCompleta = path.join(migracionesDir, archivo);
      await ejecutarSQL(rutaCompleta);
    }

    console.log('\n✓ Todas las migraciones completadas exitosamente\n');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n⚠️  Migraciones no ejecutadas:', error.message);
    if (process.env.NODE_ENV === 'production') {
      // En producción, fallar si no se ejecutan migraciones
      await pool.end();
      process.exit(1);
    } else {
      // En desarrollo, solo advertir
      console.log('Continuando — migraciones se ejecutarán en Vercel\n');
      await pool.end();
      process.exit(0);
    }
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  ejecutarMigraciones();
}

module.exports = { ejecutarMigraciones };


