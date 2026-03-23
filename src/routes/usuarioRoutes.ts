// src/routes/usuarioRoutes.ts
// Rutas para gestión de usuarios — Creación + Gestión integral (CRUD)
//
// ESTRUCTURA:
// - POST   /api/usuarios/                    → Crear usuario (ServicioCreacionUsuarios)
// - GET    /api/usuarios/roles-permitidos    → Obtener permisos (ServicioCreacionUsuarios)
// - GET    /api/usuarios                     → Listar usuarios (ServicioGestionUsuarios)
// - GET    /api/usuarios/buscar              → Buscar usuarios (ServicioGestionUsuarios)
// - GET    /api/usuarios/:id                 → Obtener usuario (ServicioGestionUsuarios)
// - PUT    /api/usuarios/:id                 → Actualizar usuario (ServicioGestionUsuarios)
// - PUT    /api/usuarios/:id/desactivar      → Desactivar usuario (ServicioGestionUsuarios)
// - PUT    /api/usuarios/:id/reactivar       → Reactivar usuario (ServicioGestionUsuarios)
// - PUT    /api/usuarios/:id/estado-matricula → Cambiar matrícula (ServicioGestionUsuarios)

import { Router }                               from 'express';
import { ControladorUsuario }                  from '../controllers/UsuarioController';
import { ControladorGestionUsuarios }          from '../controllers/GestionUsuariosController';
import { validarEsquema, verificarToken }     from '../middlewares/authMiddleware';
import { esquemaCrearUsuario }                from '../schemas/usuario.schema';

const enrutadorUsuarios  = Router();
const controladorUsuario = new ControladorUsuario();
const controladorGestion = new ControladorGestionUsuarios();

/**
 * @swagger
 * /api/usuarios:
 *   post:
 *     summary: Crear nuevo usuario en el sistema
 *     description: |
 *       Crea un nuevo usuario con el rol especificado.
 *       La contraseña se genera automáticamente y el usuario debe cambiarla en el primer login.
 *
 *       ### Reglas de autorización (HU_001 §CA-01):
 *       | Rol Usuario Autenticado | Puede crear | Ejemplo |
 *       |---|---|---|
 *       | **ADMIN** | ADMIN, SECRETARIA, ESTUDIANTE | Crear secretarias, admin adicionales |
 *       | **SECRETARIA** | ESTUDIANTE | Crear cuentas de estudiantes |
 *       | **ESTUDIANTE** | ✗ Ninguno (403) | No permitido |
 *
 *       ### Flujo de primer login:
 *       1. Usuario creado con `primer_login = TRUE`
 *       2. Usuario recibe contraseña temporal (en respuesta, mostrar una sola vez)
 *       3. Al hacer login, debe obligatoriamente cambiar contraseña via `/api/auth/change-password`
 *       4. Después puede acceder al sistema normalmente
 *
 *       ### Campos para ESTUDIANTE (HU_DB §4.2):
 *       Cuando `rol = ESTUDIANTE`, se requieren **OBLIGATORIAMENTE**:
 *       - **programa_id**: ID del programa académico
 *         - 1 = Ingeniería Sistemas
 *         - 2 = Ingeniería Industrial
 *         - 3 = Administración Empresas
 *       - **semestre_actual**: Semestre académico (1-12, donde 1=primer año, 2=segundo año, etc.)
 *       - **jornada**: Horario de clases
 *         - `manana` (6 AM - 12 PM)
 *         - `tarde` (12 PM - 6 PM)
 *         - `noche` (6 PM - 10 PM)
 *       - **matricula_activa**: Si el estudiante puede acceder al sistema (default: true)
 *
 *       ### Validaciones:
 *       - Email único en el sistema
 *       - Código estudiantil único
 *       - Nombre con letras y espacios solamente
 *       - Rol debe ser ESTUDIANTE, SECRETARIA o ADMIN
 *
 *     tags:
 *       - Gestión de Usuarios
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrearUsuarioBody'
 *           examples:
 *             crearEstudiante:
 *               summary: Secretaria crea estudiante (con programa y semestre)
 *               value:
 *                 nombre_completo: "Juan Pedro Rodríguez García"
 *                 email_institucional: "jrodriguez@proyectonovedades.edu.co"
 *                 codigo_estudiantil: "2025001"
 *                 rol: "ESTUDIANTE"
 *                 programa_id: 1
 *                 semestre_actual: 3
 *                 jornada: "manana"
 *                 matricula_activa: true
 *             crearSecretaria:
 *               summary: Admin crea secretaria
 *               value:
 *                 nombre_completo: "Diana Marcela López Soto"
 *                 email_institucional: "dlopez@proyectonovedades.edu.co"
 *                 codigo_estudiantil: "SEC002"
 *                 rol: "SECRETARIA"
 *             crearAdmin:
 *               summary: Admin crea otro admin
 *               value:
 *                 nombre_completo: "Carlos Alberto Peña Torres"
 *                 email_institucional: "cpena@proyectonovedades.edu.co"
 *                 codigo_estudiantil: "ADMIN002"
 *                 rol: "ADMIN"
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaExito'
 *             example:
 *               ok: true
 *               mensaje: "Usuario creado exitosamente.  Contraseña temporal generada (ver datos)"
 *               datos:
 *                 id_usuario: 12
 *                 nombre_completo: "Juan Pedro Rodríguez García"
 *                 email_institucional: "jrodriguez@proyectonovedades.edu.co"
 *                 codigo_estudiantil: "2025001"
 *                 rol: "estudiante"
 *                 primer_login: true
 *                 programa_id: 1
 *                 semestre_actual: 3
 *                 jornada: "manana"
 *                 matricula_activa: true
 *                 contrasena_temporal: "KmNp8QhL54"
 *                 mensaje_contrasena: " CONTRASEÑA TEMPORAL: \"KmNp8QhL54\"...\nEste usuario DEBE cambiar su contraseña..."
 *               codigo_estado: 201
 *       400:
 *         description: Validación fallida (nombre, email, etc.)
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: "Validación de datos fallida: El nombre debe tener mínimo 3 caracteres"
 *               datos: null
 *               codigo_estado: 400
 *       403:
 *         description: Sin permisos para crear ese rol
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: "Su rol (estudiante) no tiene permisos para crear usuarios con rol ESTUDIANTE. Roles permitidos: ninguno"
 *               datos: null
 *               codigo_estado: 403
 *       409:
 *         description: Email o código estudiantil ya existen
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: "El email jrodriguez@proyectonovedades.edu.co ya está registrado en el sistema"
 *               datos: null
 *               codigo_estado: 409
 *       422:
 *         description: Campos obligatorios faltantes para ESTUDIANTE
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: "Datos de entrada inválidos: Para crear ESTUDIANTE son obligatorios: programa_id, semestre_actual, jornada"
 *               datos: null
 *               codigo_estado: 422
 *       401:
 *         description: Token no válido o expirado
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: "Token no válido"
 *               datos: null
 *               codigo_estado: 401
 */
enrutadorUsuarios.post(
  '/',
  verificarToken,
  validarEsquema(esquemaCrearUsuario),
  controladorUsuario.crearUsuario,
);


/**
 * @swagger
 * /api/usuarios/roles-permitidos:
 *   get:
 *     summary: Obtener roles que puede crear el usuario autenticado
 *     description: |
 *       Devuelve la lista de roles que el usuario autenticado tiene permisos para crear.
 *       Útil para mostrar opciones válidas en dropdown/select del formulario de creación.
 *
 *       **Ejemplo:** Un usuario con rol **SECRETARIA** verá que solo puede crear **ESTUDIANTE**.
 *
 *     tags:
 *       - Gestión de Usuarios
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Roles que puede crear
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaExito'
 *             examples:
 *               admin:
 *                 summary: Usuario con rol ADMIN
 *                 value:
 *                   ok: true
 *                   mensaje: "Puede crear usuarios con los siguientes roles: ADMIN, SECRETARIA, ESTUDIANTE"
 *                   datos:
 *                     rol_usuario_autenticado: "admin"
 *                     roles_que_puede_crear: ["ADMIN", "SECRETARIA", "ESTUDIANTE"]
 *                     puede_crear_usuarios: true
 *                   codigo_estado: 200
 *               secretaria:
 *                 summary: Usuario con rol SECRETARIA
 *                 value:
 *                   ok: true
 *                   mensaje: "Puede crear usuarios con los siguientes roles: ESTUDIANTE"
 *                   datos:
 *                     rol_usuario_autenticado: "secretaria"
 *                     roles_que_puede_crear: ["ESTUDIANTE"]
 *                     puede_crear_usuarios: true
 *                   codigo_estado: 200
 *               estudiante:
 *                 summary: Usuario con rol ESTUDIANTE (sin permisos)
 *                 value:
 *                   ok: true
 *                   mensaje: "Su rol no tiene permisos para crear usuarios"
 *                   datos:
 *                     rol_usuario_autenticado: "estudiante"
 *                     roles_que_puede_crear: []
 *                     puede_crear_usuarios: false
 *                   codigo_estado: 200
 *       401:
 *         description: Token no válido o expirado
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: "Token no válido"
 *               datos: null
 *               codigo_estado: 401
 */
enrutadorUsuarios.get(
  '/roles-permitidos',
  verificarToken,
  controladorUsuario.obtenerRolesPermitidos,
);

// ============================================================================
// RUTAS DE GESTIÓN DE USUARIOS (ServicioGestionUsuarios)
// ============================================================================

/**
 * @swagger
 * /api/usuarios:
 *   get:
 *     summary: Listar usuarios con filtros y paginación
 *     description: |
 *       Devuelve un listado paginado de usuarios del sistema.
 *
 *       ### Acceso:
 *       - **ADMIN**: Ve todos los usuarios
 *       - **SECRETARIA**: Ve solo ESTUDIANTE
 *       - **ESTUDIANTE**: ✗ 403 Forbidden
 *
 *       ### Filtros disponibles:
 *       - `rol`: Filtrar por rol (ADMIN, SECRETARIA, ESTUDIANTE)
 *       - `activo`: true o false
 *       - `pagina`: Número de página (default: 1)
 *       - `limite`: Usuarios por página (default: 20, máx: 100)
 *
 *     tags:
 *       - Gestión de Usuarios
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: pagina
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limite
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *       - name: rol
 *         in: query
 *         schema:
 *           type: string
 *           enum: [ADMIN, SECRETARIA, ESTUDIANTE]
 *       - name: activo
 *         in: query
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Lista de usuarios obtenida exitosamente
 *       403:
 *         description: Sin permisos
 */
enrutadorUsuarios.get('', verificarToken, controladorGestion.listarUsuarios);

/**
 * @swagger
 * /api/usuarios/buscar:
 *   get:
 *     summary: Buscar usuarios por nombre, email o código
 *     description: |
 *       Busca usuarios que coincidan con el término en:
 *       - Nombre completo (búsqueda ILIKE)
 *       - Email institucional
 *       - Código estudiantil
 *
 *       ### Acceso:
 *       - **ADMIN**: Busca en todos
 *       - **SECRETARIA**: Busca solo ESTUDIANTE
 *       - **ESTUDIANTE**: ✗ 403 Forbidden
 *
 *     tags:
 *       - Gestión de Usuarios
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *     responses:
 *       200:
 *         description: Resultados de búsqueda
 *       400:
 *         description: Término demasiado corto
 */
enrutadorUsuarios.get('/buscar', verificarToken, controladorGestion.buscarUsuarios);

/**
 * @swagger
 * /api/usuarios/{id}:
 *   get:
 *     summary: Obtener datos completos de un usuario
 *     description: |
 *       Retorna todos los datos del usuario incluyendo datos académicos si es estudiante.
 *
 *       ### Acceso:
 *       - **ADMIN**: Ve cualquier usuario
 *       - **SECRETARIA**: Ve solo ESTUDIANTE
 *       - **ESTUDIANTE**: ✗ 403 Forbidden
 *
 *     tags:
 *       - Gestión de Usuarios
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Datos del usuario
 *       404:
 *         description: Usuario no encontrado
 */
enrutadorUsuarios.get('/:id', verificarToken, controladorGestion.obtenerUsuario);

/**
 * @swagger
 * /api/usuarios/{id}:
 *   put:
 *     summary: Actualizar datos de un usuario (nombre, email)
 *     description: |
 *       Actualiza datos básicos del usuario.
 *       NO permite cambiar rol ni código estudiantil.
 *
 *       ### Acceso:
 *       - **ADMIN**: Edita cualquier usuario
 *       - **SECRETARIA**: Edita solo ESTUDIANTE
 *       - **ESTUDIANTE**: ✗ 403 Forbidden
 *
 *     tags:
 *       - Gestión de Usuarios
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre_completo:
 *                 type: string
 *               email_institucional:
 *                 type: string
 *     responses:
 *       200:
 *         description: Usuario actualizado exitosamente
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Usuario no encontrado
 */
enrutadorUsuarios.put('/:id', verificarToken, controladorGestion.actualizarUsuario);

/**
 * @swagger
 * /api/usuarios/{id}/desactivar:
 *   put:
 *     summary: Desactivar un usuario
 *     description: |
 *       Marca un usuario como inactivo (activo = false).
 *       El usuario NO podrá hacer login hasta ser reactivado.
 *
 *       ### Validaciones:
 *       - No puede desactivarse a sí mismo
 *       - Registra auditoría automáticamente
 *
 *     tags:
 *       - Gestión de Usuarios
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Usuario desactivado exitosamente
 *       400:
 *         description: No puede desactivarse a sí mismo
 *       404:
 *         description: Usuario no encontrado
 */
enrutadorUsuarios.put('/:id/desactivar', verificarToken, controladorGestion.desactivarUsuario);

/**
 * @swagger
 * /api/usuarios/{id}/reactivar:
 *   put:
 *     summary: Reactivar un usuario (solo ADMIN)
 *     description: |
 *       Reactiva un usuario que fue desactivado.
 *       El usuario podrá volver a hacer login.
 *
 *       ### Acceso:
 *       - **ADMIN**: ✓ Puede reactivar
 *       - **SECRETARIA**: ✗ 403 Forbidden
 *
 *     tags:
 *       - Gestión de Usuarios
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Usuario reactivado exitosamente
 *       403:
 *         description: Sin permisos (solo ADMIN)
 */
enrutadorUsuarios.put('/:id/reactivar', verificarToken, controladorGestion.reactivarUsuario);

/**
 * @swagger
 * /api/usuarios/{id}/estado-matricula:
 *   put:
 *     summary: Cambiar estado de matrícula de un estudiante
 *     description: |
 *       Activa o desactiva la matrícula de un estudiante.
 *
 *       ### Acceso:
 *       - **ADMIN**: ✓ Cambiar cualquier estudiante
 *       - **SECRETARIA**: ✓ Cambiar estudiantes
 *       - **ESTUDIANTE**: ✗ 403 Forbidden
 *
 *     tags:
 *       - Gestión de Usuarios
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - matricula_activa
 *             properties:
 *               matricula_activa:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Estado de matrícula actualizado
 *       400:
 *         description: Usuario no es estudiante
 *       404:
 *         description: Usuario no encontrado
 */
enrutadorUsuarios.put('/:id/estado-matricula', verificarToken, controladorGestion.actualizarEstadoMatricula);

export default enrutadorUsuarios;


