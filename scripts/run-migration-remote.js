// scripts/run-migration-remote.js
// Ejecutar migración en BD remota Railway
// USO: node scripts/run-migration-remote.js

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const CONEXION_REMOTA = 'postgresql://postgres:sgSLQqnWzdPyKBnghUgYklLNxfbpcRJR@mainline.proxy.rlwy.net:24684/railway';

async function main() {
  const pool = new Pool({
    connectionString: CONEXION_REMOTA,
    ssl: { rejectUnauthorized: false }, // Railway requiere SSL
  });

  try {
    console.log('=====================================');
    console.log('MIGRACION - BD REMOTA RAILWAY');
    console.log('=====================================\n');

    // PASO 1: Verificar tablas existentes
    console.log('[Paso 1] Verificando tablas existentes en BD remota...');
    const resultTablas = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log(`✓ Tablas encontradas: ${resultTablas.rows.length}`);
    resultTablas.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    // Verificar si dispositivos_push ya existe
    const existeDispositivosPush = resultTablas.rows.some(
      row => row.table_name === 'dispositivos_push'
    );

    if (existeDispositivosPush) {
      console.log('\n⚠️  TABLA "dispositivos_push" YA EXISTE');
      console.log('No es necesario ejecutar migración.\n');
      process.exit(0);
    }

    console.log('\n✓ Tabla "dispositivos_push" NO existe - Procederemos a crearla\n');

    // PASO 2: Hacer backup (verificar que tabla migraciones existe)
    console.log('[Paso 2] Verificando tabla de control de migraciones...');
    try {
      const resultMig = await pool.query(`
        SELECT migration_name FROM migrations_executed 
        WHERE migration_name = '010_crear_dispositivos_push';
      `);
      if (resultMig.rows.length > 0) {
        console.log('✓ Migración 010 ya fue ejecutada');
        process.exit(0);
      }
    } catch (e) {
      // Tabla no existe, será creada por la migración
      console.log('✓ Tabla de control de migraciones no existe (será creada)');
    }

    // PASO 3: Leer archivo de migración
    console.log('\n[Paso 3] Leyendo archivo de migración 010...');
    const rutaMigracion = path.join(
      __dirname,
      '../migrations/010_tabla_notificaciones_hibrida.sql'
    );

    if (!fs.existsSync(rutaMigracion)) {
      console.error('❌ ERROR: Archivo de migración no encontrado');
      console.error(`Ruta esperada: ${rutaMigracion}`);
      process.exit(1);
    }

    const scriptSQL = fs.readFileSync(rutaMigracion, 'utf8');
    console.log('✓ Archivo de migración cargado\n');

    // PASO 4: Ejecutar migración dentro de transacción
    console.log('[Paso 4] Ejecutando migración...\n');
    console.log('------- INICIO DE EJECUCION -------');

    await pool.query(scriptSQL);

    console.log('------- FIN DE EJECUCION -------\n');

    // PASO 5: Verificar que tabla fue creada
    console.log('[Paso 5] Verificando que tabla fue creada...');
    const verificacion = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'dispositivos_push'
      ORDER BY ordinal_position;
    `);

    if (verificacion.rows.length === 0) {
      console.error('❌ ERROR: Tabla dispositivos_push no fue creada');
      process.exit(1);
    }

    console.log(`✓ Tabla "dispositivos_push" creada con ${verificacion.rows.length} columnas:\n`);
    verificacion.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    // PASO 6: Verificar índices
    console.log('\n[Paso 6] Verificando índices creados...');
    const indices = await pool.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'dispositivos_push'
      ORDER BY indexname;
    `);

    console.log(`✓ Índices creados: ${indices.rows.length}\n`);
    indices.rows.forEach(row => {
      console.log(`  - ${row.indexname}`);
    });

    // PASO 7: Verificar registro de migración
    console.log('\n[Paso 7] Verificando registro de migración...');
    const registro = await pool.query(`
      SELECT migration_name, executed_at 
      FROM migrations_executed 
      WHERE migration_name = '010_crear_dispositivos_push';
    `);

    if (registro.rows.length > 0) {
      console.log(`✓ Migración registrada: ${registro.rows[0].executed_at}\n`);
    }

    // RESUMEN FINAL
    console.log('=====================================');
    console.log('✅ MIGRACION COMPLETADA EXITOSAMENTE');
    console.log('=====================================');
    console.log(`
Resumen de cambios:
  - Tabla creada: dispositivos_push
  - Columnas: ${verificacion.rows.length}
  - Índices: ${indices.rows.length}
  - BD remota: Railway (mainline.proxy.rlwy.net)
  - Timestamp: ${new Date().toISOString()}
    `);

    process.exit(0);
  } catch (error) {
    console.error('\n=====================================');
    console.error('❌ ERROR EJECUTANDO MIGRACION');
    console.error('=====================================');
    console.error(`Error: ${error.message}\n`);

    if (error.code) {
      console.error(`Código de error PostgreSQL: ${error.code}`);
    }

    console.error('\nDetalles completos:');
    console.error(error);

    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();


