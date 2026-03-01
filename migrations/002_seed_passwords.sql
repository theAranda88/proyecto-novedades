-- Script para poblar password_hash de los estudiantes de prueba
-- Contraseña: Password123 (bcrypt 10 rounds)
UPDATE estudiantes
SET password_hash = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
WHERE password_hash = '' OR password_hash IS NULL;

-- Verificar resultado
SELECT cod_alumno, email_institucional, LENGTH(password_hash) AS largo_hash FROM estudiantes;

