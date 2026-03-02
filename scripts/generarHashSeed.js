/**
 * scripts/generarHashSeed.js
 *
 * Genera el hash bcrypt correcto para Password123 y lo imprime.
 * Usar para verificar o actualizar el hash en 000_setup_completo.sql
 *
 * Uso:
 *   node scripts/generarHashSeed.js
 */

const bcrypt = require('bcrypt');

async function main() {
  const password = 'Password123';
  const cost     = 12;
  const hash     = await bcrypt.hash(password, cost);

  console.log('=== Hash generado para el seed ===');
  console.log(`Password: ${password}`);
  console.log(`Cost:     ${cost}`);
  console.log(`Hash:     ${hash}`);
  console.log('');
  console.log('Verificacion:');
  const ok = await bcrypt.compare(password, hash);
  console.log(`bcrypt.compare('${password}', hash) = ${ok}`);
  console.log('');
  console.log('Copia este hash en migrations/000_setup_completo.sql:');
  console.log(`v_hash TEXT := '${hash}';`);
}

main().catch(console.error);

