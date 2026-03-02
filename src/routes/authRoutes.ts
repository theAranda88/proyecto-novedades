// src/routes/authRoutes.ts
// Rutas de autenticación — Implementa HU_001 completa

import { Router }                         from 'express';
import { ControladorAutenticacion }        from '../controllers/AuthController';
import { validarEsquema, verificarTokenCambioPassword } from '../middlewares/authMiddleware';
import {
  esquemaLogin,
  esquemaCambioPassword,
  esquemaRecuperarPassword,
} from '../schemas/auth.schema';

const enrutadorAuth                = Router();
const controladorAutenticacion     = new ControladorAutenticacion();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión en el sistema
 *     description: |
 *       Autentica un usuario con su **código estudiantil** y contraseña.
 *
 *       ### Flujo de autenticación (HU_001):
 *       1. Verifica existencia del usuario (`deleted_at IS NULL`)
 *       2. Verifica si la cuenta está bloqueada (`bloqueado_hasta`)
 *       3. Compara contraseña con **bcrypt** (cost ≥ 12)
 *       4. Si la contraseña falla, incrementa `intentos_fallidos`
 *       5. Al llegar a **5 intentos**: bloqueo de **15 minutos** (HTTP 423)
 *       6. Verifica `activo = TRUE`
 *       7. Si rol = **estudiante**: verifica `matricula_activa = TRUE`
 *       8. Si `primer_login = TRUE`: devuelve token temporal y debe ir a `/change-password`
 *       9. Registra `ultimo_login`, resetea `intentos_fallidos = 0`
 *
 *       ### Credenciales de prueba:
 *       | Código | Contraseña | Rol | Estado |
 *       |---|---|---|---|
 *       | 2024001 | Password123 | estudiante | activo |
 *       | 2024002 | Password123 | estudiante | activo |
 *       | 2023010 | Password123 | estudiante | matrícula inactiva |
 *       | SEC001 | Password123 | secretaria | activo |
 *       | ADMIN001 | Password123 | admin | activo |
 *     tags:
 *       - Autenticacion
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginBody'
 *           examples:
 *             estudianteActivo:
 *               summary: Estudiante con matrícula activa
 *               value:
 *                 codigo_estudiantil: "2024001"
 *                 password: "Password123"
 *             estudianteInactivo:
 *               summary: Estudiante con matrícula inactiva
 *               value:
 *                 codigo_estudiantil: "2023010"
 *                 password: "Password123"
 *             secretaria:
 *               summary: Secretaria académica
 *               value:
 *                 codigo_estudiantil: "SEC001"
 *                 password: "Password123"
 *             admin:
 *               summary: Administrador del sistema
 *               value:
 *                 codigo_estudiantil: "ADMIN001"
 *                 password: "Password123"
 *     responses:
 *       200:
 *         description: Login exitoso — Token JWT generado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaExito'
 *             example:
 *               ok: true
 *               mensaje: "Bienvenido, Carlos Andres Perez Lopez. Sesión iniciada correctamente"
 *               datos:
 *                 token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 id_usuario: 3
 *                 nombre_completo: "Carlos Andres Perez Lopez"
 *                 rol: "estudiante"
 *                 primer_login: false
 *                 codigo_estudiantil: "2024001"
 *                 expira_en: "8h"
 *               codigo_estado: 200
 *       401:
 *         description: Credenciales incorrectas
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: "Credenciales incorrectas. Intentos restantes: 4"
 *               datos: null
 *               codigo_estado: 401
 *       403:
 *         description: Cuenta o matrícula inactiva
 *       422:
 *         description: Datos de entrada inválidos (Zod)
 *       423:
 *         description: Cuenta bloqueada por intentos fallidos (15 minutos)
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: "Cuenta bloqueada por intentos fallidos. Intente en 14 minuto(s)"
 *               datos: null
 *               codigo_estado: 423
 *       429:
 *         description: Rate limit — Demasiados intentos desde la misma IP
 */
enrutadorAuth.post(
  '/login',
  validarEsquema(esquemaLogin),
  controladorAutenticacion.login,
);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Cambio obligatorio de contraseña temporal
 *     description: |
 *       Permite cambiar la contraseña temporal asignada por el admin.
 *       **Solo funciona cuando `primer_login = TRUE`** en el token.
 *       Al completar, emite un nuevo JWT con `primer_login = FALSE`
 *       que permite acceso completo al sistema.
 *
 *       ### Reglas de la nueva contraseña:
 *       - Mínimo **8 caracteres**
 *       - Al menos **1 número**
 *       - Al menos **1 letra**
 *       - No puede ser igual a la contraseña temporal
 *
 *       ### Flujo completo (HU_001 §CA-03):
 *       1. `POST /api/auth/login` → devuelve token con `primer_login: true`
 *       2. `POST /api/auth/change-password` con ese token → devuelve nuevo token con `primer_login: false`
 *       3. Usar el nuevo token para todos los demás endpoints
 *     tags:
 *       - Autenticacion
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CambioPasswordBody'
 *           example:
 *             password_actual: "Password123"
 *             password_nueva: "NuevaContrasena456"
 *     responses:
 *       200:
 *         description: Contraseña actualizada — Nuevo token con acceso completo
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               mensaje: "Contraseña actualizada exitosamente. Puede acceder al sistema"
 *               datos:
 *                 token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 nombre_completo: "Carlos Andres Perez Lopez"
 *                 rol: "estudiante"
 *                 expira_en: "8h"
 *               codigo_estado: 200
 *       400:
 *         description: Contraseña actual incorrecta o nueva igual a la temporal
 *       401:
 *         description: Token ausente o inválido
 *       403:
 *         description: El usuario ya cambió su contraseña (primer_login = FALSE)
 *       422:
 *         description: Datos de entrada inválidos (Zod)
 */
enrutadorAuth.post(
  '/change-password',
  verificarTokenCambioPassword,
  validarEsquema(esquemaCambioPassword),
  controladorAutenticacion.cambiarPassword,
);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Recuperar contraseña olvidada
 *     description: |
 *       Inicia el flujo de recuperación de contraseña.
 *       El sistema enviará un código al correo institucional del estudiante.
 *       La respuesta es **siempre genérica** para no revelar si el código existe.
 *     tags:
 *       - Autenticacion
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [codigo_estudiantil]
 *             properties:
 *               codigo_estudiantil:
 *                 type: string
 *                 example: "2024001"
 *     responses:
 *       200:
 *         description: Respuesta genérica (no revela si el código existe)
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               mensaje: "Si el código estudiantil existe, recibirá un correo con instrucciones"
 *               datos: null
 *               codigo_estado: 200
 *       422:
 *         description: Datos de entrada inválidos
 */
enrutadorAuth.post(
  '/forgot-password',
  validarEsquema(esquemaRecuperarPassword),
  controladorAutenticacion.olvidoPassword,
);

export default enrutadorAuth;

