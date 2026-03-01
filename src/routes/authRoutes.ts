// src/routes/authRoutes.ts
// Definición de rutas para el módulo de autenticación

import { Router }                    from 'express';
import { ControladorAutenticacion }  from '../controllers/AuthController';
import { validarEsquema }            from '../middlewares/authMiddleware';
import { esquemaLogin }              from '../schemas/auth.schema';

const enrutadorAuth = Router();
const controladorAutenticacion = new ControladorAutenticacion();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión en el sistema
 *     description: |
 *       Autentica a cualquier usuario del sistema (ESTUDIANTE, SECRETARIA o ADMIN)
 *       con sus credenciales institucionales y devuelve un token JWT con expiración de **2 horas**.
 *
 *       ### Validaciones aplicadas (en orden):
 *       1. **Zod** — Valida formato de email y longitud mínima de contraseña
 *       2. **Existencia** — Busca el usuario por `email_institucional` en la tabla `usuarios`
 *       3. **bcrypt** — Compara la contraseña con el hash almacenado
 *       4. **Cuenta activa** — Verifica que `activo = TRUE` en tabla `usuarios`
 *       5. **Matrícula activa** — Solo para ESTUDIANTE: verifica `matricula_activa = TRUE` en tabla `estudiantes`
 *
 *       ### Payload del token JWT generado:
 *       ```json
 *       {
 *         "id_usuario": 1,
 *         "nombre_completo": "Carlos Andres Perez Lopez",
 *         "rol": "ESTUDIANTE",
 *         "cod_alumno": "2024001"
 *       }
 *       ```
 *
 *       ###  Rate Limit:
 *       Máximo **10 intentos** por IP cada 15 minutos.
 *
 *       ### Credenciales de prueba:
 *       | Email | Contraseña | Rol | Estado |
 *       |---|---|---|---|
 *       | c.perez@proyectonovedades.edu.co | Password123 | ESTUDIANTE |  Éxito |
 *       | l.gomez@proyectonovedades.edu.co | Password123 | ESTUDIANTE |  Éxito |
 *       | m.torres@proyectonovedades.edu.co | Password123 | ESTUDIANTE |  Matrícula inactiva |
 *       | secretaria@proyectonovedades.edu.co | Password123 | SECRETARIA |  Éxito |
 *       | admin@proyectonovedades.edu.co | Password123 | ADMIN |  Éxito |
 *     tags:
 *       -  Autenticación
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginBody'
 *           examples:
 *             estudianteActivo:
 *               summary:  ESTUDIANTE — Matrícula activa
 *               value:
 *                 email_institucional: c.perez@proyectonovedades.edu.co
 *                 password: Password123
 *             estudianteInactivo:
 *               summary:  ESTUDIANTE — Matrícula inactiva
 *               value:
 *                 email_institucional: m.torres@proyectonovedades.edu.co
 *                 password: Password123
 *             secretaria:
 *               summary:  SECRETARIA
 *               value:
 *                 email_institucional: secretaria@proyectonovedades.edu.co
 *                 password: Password123
 *             admin:
 *               summary:  ADMIN
 *               value:
 *                 email_institucional: admin@proyectonovedades.edu.co
 *                 password: Password123
 *             credencialesInvalidas:
 *               summary: Contraseña incorrecta
 *               value:
 *                 email_institucional: c.perez@proyectonovedades.edu.co
 *                 password: contrasena_incorrecta
 *             datosInvalidos:
 *               summary: Validación Zod fallida
 *               value:
 *                 email_institucional: no-es-un-email
 *                 password: "123"
 *     responses:
 *       200:
 *         description: Login exitoso — Token JWT generado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/RespuestaExito'
 *                 - type: object
 *                   properties:
 *                     datos:
 *                       $ref: '#/components/schemas/TokenRespuesta'
 *             examples:
 *               estudianteExitoso:
 *                 summary: Login ESTUDIANTE exitoso
 *                 value:
 *                   ok: true
 *                   mensaje: "Bienvenido, Carlos Andres Perez Lopez. Sesión iniciada correctamente"
 *                   datos:
 *                     token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     id_usuario: 1
 *                     nombre_completo: "Carlos Andres Perez Lopez"
 *                     rol: "ESTUDIANTE"
 *                     expira_en: "2h"
 *                   codigo_estado: 200
 *               secretariaExitoso:
 *                 summary: Login SECRETARIA exitoso
 *                 value:
 *                   ok: true
 *                   mensaje: "Bienvenido, Ana Maria Rodriguez. Sesión iniciada correctamente"
 *                   datos:
 *                     token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     id_usuario: 4
 *                     nombre_completo: "Ana Maria Rodriguez"
 *                     rol: "SECRETARIA"
 *                     expira_en: "2h"
 *                   codigo_estado: 200
 *               adminExitoso:
 *                 summary: Login ADMIN exitoso
 *                 value:
 *                   ok: true
 *                   mensaje: "Bienvenido, Administrador del Sistema. Sesión iniciada correctamente"
 *                   datos:
 *                     token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     id_usuario: 5
 *                     nombre_completo: "Administrador del Sistema"
 *                     rol: "ADMIN"
 *                     expira_en: "2h"
 *                   codigo_estado: 200
 *       401:
 *         description: Credenciales incorrectas (email no existe o contraseña inválida)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaError'
 *             example:
 *               ok: false
 *               mensaje: "Credenciales incorrectas. Verifique su email y contraseña"
 *               datos: null
 *               codigo_estado: 401
 *       403:
 *         description: Cuenta inactiva o matrícula inactiva (solo ESTUDIANTE)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaError'
 *             examples:
 *               matriculaInactiva:
 *                 summary: Matrícula inactiva (ESTUDIANTE)
 *                 value:
 *                   ok: false
 *                   mensaje: "Su matrícula no está activa para el periodo actual. Contacte a la coordinación académica"
 *                   datos: null
 *                   codigo_estado: 403
 *               cuentaInactiva:
 *                 summary: Cuenta desactivada por el ADMIN
 *                 value:
 *                   ok: false
 *                   mensaje: "Su cuenta no está activa. Contacte al administrador del sistema"
 *                   datos: null
 *                   codigo_estado: 403
 *       422:
 *         description: Datos de entrada inválidos (validación Zod)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaError'
 *             example:
 *               ok: false
 *               mensaje: "Datos de entrada inválidos: email_institucional: El formato del email institucional no es válido"
 *               datos: null
 *               codigo_estado: 422
 *       429:
 *         description: Demasiados intentos — Rate limit alcanzado (10 por 15 min)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaError'
 *             example:
 *               ok: false
 *               mensaje: "Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos"
 *               datos: null
 *               codigo_estado: 429
 */
enrutadorAuth.post(
  '/login',
  validarEsquema(esquemaLogin),
  controladorAutenticacion.login,
);

export default enrutadorAuth;

