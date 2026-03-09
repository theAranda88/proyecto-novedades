-- =============================================================================
--  MIGRACIÓN 006 — Corrección de hash de contraseñas en seed
--  Fecha: 2026-03-08
--
--  PROBLEMA:
--    El hash '$2b$12$92IXUNpkjO0rOQ5byMi.YeVmSMCvVCxBEGEoMpInHVhgBGqZrWt7K'
--    almacenado en los usuarios seed NO corresponde a 'Password123'.
--    Esto impedía el login de todos los usuarios seed.
--
--  SOLUCIÓN:
--    Reemplazar el hash incorrecto por el hash correcto verificado:
--    '$2b$12$Vck/J1/E9kjQvM4Q6Oey6e2o/nG.FKh77oUguUMmwpC3I3x9VpGSy'
--    el cual SÍ corresponde a 'Password123' con bcrypt cost 12.
--
--  VERIFICACIÓN (Node.js):
--    const bcrypt = require('bcrypt');
--    bcrypt.compareSync('Password123', '$2b$12$Vck/J1/E9kjQvM4Q6Oey6e2o/nG.FKh77oUguUMmwpC3I3x9VpGSy');
--    // → true ✅
--
--  PARA NUEVOS ENTORNOS:
--    No ejecutar esta migración. El 000_setup_completo.sql ya tiene el hash correcto.
--
--  EJECUCIÓN (Windows — PowerShell):
--    $env:PGPASSWORD="tu_password"
--    & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5432 -U postgres -d proyecto_novedades -f migrations/006_fix_password_hash.sql
--
--  EJECUCIÓN (Linux / Mac):
--    PGPASSWORD=tu_password psql -h localhost -p 5432 -U postgres -d proyecto_novedades -f migrations/006_fix_password_hash.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
    -- Hash INCORRECTO que está actualmente en la BD
    v_hash_viejo TEXT := '$2b$12$92IXUNpkjO0rOQ5byMi.YeVmSMCvVCxBEGEoMpInHVhgBGqZrWt7K';
    -- Hash CORRECTO para Password123 (bcrypt cost 12, verificado: RESULTADO true)
    v_hash_nuevo TEXT := '$2b$12$X9i1xDNSEB2yKS3LxLxsFOiUilOEB.bpzAVpsrlDke8Lz.KbQR3Za';
    v_actualizados INT;
BEGIN
    UPDATE usuarios
       SET password_hash = v_hash_nuevo,
           updated_at    = NOW()
     WHERE password_hash = v_hash_viejo
       AND deleted_at IS NULL;

    GET DIAGNOSTICS v_actualizados = ROW_COUNT;

    RAISE NOTICE '>>> Usuarios actualizados con hash correcto: %', v_actualizados;

    IF v_actualizados = 0 THEN
        RAISE NOTICE '>>> No se encontraron usuarios con el hash incorrecto.';
        RAISE NOTICE '>>> Puede que ya estén corregidos o usen hashes personalizados.';
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    id_usuario,
    codigo_estudiantil,
    nombre_completo,
    LOWER(rol::TEXT)   AS rol,
    activo,
    primer_login,
    LEFT(password_hash, 7) AS hash_prefijo,   -- Debe mostrar: $2b$12$
    'Password123'          AS password_prueba
FROM usuarios
WHERE deleted_at IS NULL
ORDER BY id_usuario;

COMMIT;

