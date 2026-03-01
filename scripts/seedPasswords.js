/**
 * Script de utilidad para generar el hash bcrypt de Password123
 * y actualizar TODOS los usuarios de prueba en la tabla usuarios.
 *
 * Ejecutar: node scripts/seedPasswords.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'proyecto_novedades',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function poblarPasswords() {
  try {
    console.log(' Generando hash bcrypt de "Password123"...');
    const hash = await bcrypt.hash('Password123', 10);
    console.log(' Hash generado:', hash);

    // Actualizar TODOS los usuarios en tabla usuarios con el hash correcto
    const res = await pool.query(
      `UPDATE usuarios SET password_hash = $1 RETURNING id_usuario, email_institucional, rol`,
      [hash]
    );

    console.log(`\n Actualizados ${res.rowCount} usuarios:`);
    res.rows.forEach(r =>
      console.log(`   [${r.rol.padEnd(10)}] ${r.email_institucional}`)
    );

    console.log('\n Credenciales de prueba:');
    console.log('   c.perez@proyectonovedades.edu.co       | Password123 | ESTUDIANTE');
    console.log('   l.gomez@proyectonovedades.edu.co       | Password123 | ESTUDIANTE');
    console.log('   m.torres@proyectonovedades.edu.co      | Password123 | ESTUDIANTE (inactivo)');
    console.log('   secretaria@proyectonovedades.edu.co    | Password123 | SECRETARIA');
    console.log('   admin@proyectonovedades.edu.co         | Password123 | ADMIN');

  } catch (err) {
    console.error(' Error:', err.message);
  } finally {
    await pool.end();
  }
}

poblarPasswords();

