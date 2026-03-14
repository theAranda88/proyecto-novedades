-- =============================================================================
--  VALIDACIÓN PRE-MIGRACIÓN — Verificar estado actual de tablas
--  Ejecutar ANTES de aplicar migración 007
--  Fecha: 2026-03-14
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. VERIFICAR ESTRUCTURA DE TABLA ESTUDIANTES
-- ─────────────────────────────────────────────────────────────────────────────
\echo '=== ESTRUCTURA TABLA ESTUDIANTES ==='
\d estudiantes

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. VERIFICAR ESTRUCTURA DE TABLA SOLICITUDES
-- ─────────────────────────────────────────────────────────────────────────────
\echo '=== ESTRUCTURA TABLA SOLICITUDES ==='
\d solicitudes

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VERIFICAR QUE TABLA GRUPOS_CURSO EXISTE
-- ─────────────────────────────────────────────────────────────────────────────
\echo '=== ESTRUCTURA TABLA GRUPOS_CURSO ==='
\d grupos_curso

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CONTAR ESTUDIANTES CON DATOS COMPLETOS
-- ─────────────────────────────────────────────────────────────────────────────
\echo '=== VALIDAR ESTUDIANTES CON DATOS COMPLETOS ==='
SELECT
  COUNT(*) AS total_estudiantes,
  COUNT(usuario_id) AS con_usuario_id,
  COUNT(codigo_estudiantil) AS con_codigo_estudiantil,
  COUNT(semestre_actual) AS con_semestre_actual,
  COUNT(programa_id) AS con_programa_id
FROM estudiantes
WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CONTAR PROGRAMAS DISPONIBLES
-- ─────────────────────────────────────────────────────────────────────────────
\echo '=== PROGRAMAS DISPONIBLES ==='
SELECT
  COUNT(*) AS total_programas,
  COUNT(nombre_programa) AS con_nombre
FROM programas
WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. LISTAR PRIMEROS 3 ESTUDIANTES Y SUS DATOS
-- ─────────────────────────────────────────────────────────────────────────────
\echo '=== MUESTRA DE ESTUDIANTES ==='
SELECT
  codigo_estudiantil,
  nombre_completo,
  usuario_id,
  semestre_actual,
  programa_id,
  correo_institucional
FROM estudiantes
WHERE deleted_at IS NULL
LIMIT 3;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. VERIFICAR SI EXISTEN COLUMNAS DUPLICADAS O EN CONFLICTO
-- ─────────────────────────────────────────────────────────────────────────────
\echo '=== COLUMNAS CONFLICTIVAS EN ESTUDIANTES ==='
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'estudiantes'
  AND column_name IN ('cod_alumno', 'semestre', 'id_programa', 'email_institucional')
ORDER BY column_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. VERIFICAR CONSTRAINTS EN SOLICITUDES
-- ─────────────────────────────────────────────────────────────────────────────
\echo '=== CONSTRAINTS EN SOLICITUDES ==='
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'solicitudes'
ORDER BY constraint_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. VERIFICAR VALORES EN TIPO_NOVEDAD EXISTENTES
-- ─────────────────────────────────────────────────────────────────────────────
\echo '=== TIPOS DE SOLICITUD EXISTENTES ==='
SELECT DISTINCT tipo_novedad, COUNT(*) as cantidad
FROM solicitudes
GROUP BY tipo_novedad
ORDER BY cantidad DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. DIAGNOSTICO FINAL
-- ─────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '╔═══════════════════════════════════════════════════════════════════╗'
\echo '║ DIAGNOSTICO PRE-MIGRACIÓN 007                                     ║'
\echo '╚═══════════════════════════════════════════════════════════════════╝'
\echo ''
\echo '✓ Si ve datos en todas las consultas anteriores, la BD está lista'
\echo '✓ Si ve NULL en semestre_actual o programa_id, ejecutar SEED'
\echo '✓ Si ve CONFLICTO en paso 7, hay columnas duplicadas (requiere cleanup)'
\echo '✓ Si ve tipos_novedad inesperados en paso 9, puede haber incompatibilidades'
\echo ''
\echo 'PRÓXIMO PASO: Ejecutar migrations/007_agregar_grupos_solicitudes.sql'

