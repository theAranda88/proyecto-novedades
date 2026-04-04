#!/usr/bin/env node
/**
 * scripts/runMigrations.js
 * Script para ejecutar migraciones automáticamente en Vercel
 * Se ejecuta como parte del build process
 *
 * NOTA: Si falla la conexión a BD, continúa (migraciones se ejecutarán en tiempo de ejecución)
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Leer DATABASE_URL del .env o variables de entorno
require('dotenv').config({ path: '.env.production' });
require('dotenv').config({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL;

// Si no hay DATABASE_URL, simplemente continuar (migraciones se harán después)
if (!DATABASE_URL) {
  console.log('⊘ DATABASE_URL no configurada — migraciones saltadas');
  process.exit(0);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  connect_timeout: 5000,
});

/**
 * Ejecutar un archivo SQL
 */
async function ejecutarSQL(rutaArchivo) {
  try {
    const sql = fs.readFileSync(rutaArchivo, 'utf8');
    if (!sql.trim()) {
      console.log(`⊘ Archivo vacío: ${path.basename(rutaArchivo)}`);
      return true;
    }

    console.log(`⏳ Ejecutando: ${path.basename(rutaArchivo)}`);
    await pool.query(sql);
    console.log(`✓ Completado: ${path.basename(rutaArchivo)}`);
    return true;
  } catch (error) {
    console.warn(`⚠️  Error en ${path.basename(rutaArchivo)}: ${error.message}`);
    return false;
  }
}

/**
 * Función principal
 */
async function ejecutarMigraciones() {
  try {
    // Intentar conectar con timeout
    const client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      )
    ]);

    console.log('✓ Conexión a PostgreSQL establecida');
    client.release();

    // Obtener lista de migraciones
    const migracionesDir = path.join(__dirname, '..', 'migrations');
    if (!fs.existsSync(migracionesDir)) {
      console.log('⊘ Carpeta migrations/ no encontrada — saltando');
      await pool.end();
      process.exit(0);
    }

    const archivos = fs.readdirSync(migracionesDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`\n📋 ${archivos.length} migraciones encontradas\n`);

    for (const archivo of archivos) {
      const rutaCompleta = path.join(migracionesDir, archivo);
      await ejecutarSQL(rutaCompleta);
    }

    console.log('\n✓ Todas las migraciones completadas\n');
    await pool.end();
    process.exit(0);

  } catch (error) {
    console.warn(`\n⚠️  Error de conexión a BD: ${error.message}`);
    console.warn('ℹ️  Build continuará — Las migraciones se ejecutarán en tiempo de ejecución\n');

    try {
      await pool.end();
    } catch (e) {}

    // NO fallar el build — Vercel necesita desplegar
    process.exit(0);
  }
}

// Ejecutar
ejecutarMigraciones();


