// src/controllers/UsuarioController.ts
// Controlador HTTP para gestión de usuarios — Creación y listado

import { Request, Response, NextFunction } from 'express';
import { ServicioUsuario }                 from '../services/UsuarioService';
import { RespuestaUtil }                   from '../utils/RespuestaUtil';
import { TCrearUsuario }                   from '../schemas/usuario.schema';
import { RolUsuarioEnum }                  from '../schemas/usuario.schema';

/**
 * Controlador que maneja las peticiones HTTP relacionadas
 * con la gestión de usuarios en el sistema.
 *
 * Responsabilidades:
 * - Recibir requests validados por Zod
 * - Delegar lógica de negocio al ServicioUsuario
 * - Validar autorización según rol del usuario autenticado
 * - Devolver respuestas en formato uniforme via RespuestaUtil
 */
export class ControladorUsuario {

  private readonly servicioUsuario: ServicioUsuario;

  constructor() {
    this.servicioUsuario = new ServicioUsuario();
    this.crearUsuario           = this.crearUsuario.bind(this);
    this.obtenerRolesPermitidos = this.obtenerRolesPermitidos.bind(this);
  }

  /**
   * POST /api/usuarios
   * Crea un nuevo usuario en el sistema.
   * Requiere autenticación con rol ADMIN o SECRETARIA.
   *
   * Flujo:
   *   1. Valida permisos del usuario autenticado (req.usuario)
   *   2. Delega creación al ServicioUsuario
   *   3. Devuelve usuario creado + contraseña temporal (una sola vez)
   *
   * Reglas de autorización:
   *   - ADMIN: puede crear ADMIN, SECRETARIA, ESTUDIANTE
   *   - SECRETARIA: puede crear ESTUDIANTE
   *   - ESTUDIANTE: no puede crear usuarios (403)
   *
   * @seguridad Requiere token JWT válido con rol ADMIN o SECRETARIA
   * @seguridad La contraseña temporal se devuelve UNA SOLA VEZ
   */
  async crearUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const datos          = req.body as TCrearUsuario;
      const idUsuarioAutor = req.usuario!.id_usuario;
      const rolUsuarioAutor = (req.usuario!.rol as unknown as string).toLowerCase() as RolUsuarioEnum;

      // Validar que el usuario autenticado tenga permisos para crear
      if (!this.servicioUsuario.puedeCrearUsuarios(rolUsuarioAutor)) {
        RespuestaUtil.error(
          res,
          `Su rol (${rolUsuarioAutor}) no tiene permisos para crear usuarios`,
          403,
        );
        return;
      }

      const usuarioCreado = await this.servicioUsuario.crearUsuario(
        datos,
        idUsuarioAutor,
        rolUsuarioAutor,
      );

      RespuestaUtil.exito(
        res,
        'Usuario creado exitosamente. Contraseña temporal generada (ver datos)',
        usuarioCreado,
        201,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/usuarios/roles-permitidos
   * Obtiene la lista de roles que el usuario autenticado puede crear.
   * Usado por el frontend para mostrar opciones válidas en formulario.
   *
   * @example
   *   Si rol = 'admin' → devuelve ['ADMIN', 'SECRETARIA', 'ESTUDIANTE']
   *   Si rol = 'secretaria' → devuelve ['ESTUDIANTE']
   *   Si rol = 'estudiante' → devuelve []
   *
   * @seguridad Requiere token JWT válido
   */
  async obtenerRolesPermitidos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rolUsuarioAutor = (req.usuario!.rol as unknown as string).toLowerCase() as RolUsuarioEnum;
      const rolesPermitidos = this.servicioUsuario.obtenerRolesPermitidos(rolUsuarioAutor);

      RespuestaUtil.exito(
        res,
        rolesPermitidos.length > 0
          ? `Puede crear usuarios con los siguientes roles: ${rolesPermitidos.join(', ')}`
          : 'Su rol no tiene permisos para crear usuarios',
        {
          rol_usuario_autenticado: rolUsuarioAutor,
          roles_que_puede_crear:   rolesPermitidos,
          puede_crear_usuarios:    rolesPermitidos.length > 0,
        },
        200,
      );
    } catch (error) {
      next(error);
    }
  }
}


