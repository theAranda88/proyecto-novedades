// src/controllers/GestionUsuariosController.ts
// Controlador HTTP para Gestión Integral de Usuarios

import { Request, Response, NextFunction } from 'express';
import { ServicioGestionUsuarios } from '../services/GestionUsuariosService';
import { RespuestaUtil } from '../utils/RespuestaUtil';
import { RolUsuario } from '../middlewares/authMiddleware';

/**
 * Controlador que maneja las peticiones HTTP para gestión de usuarios.
 * Métodos: listar, obtener, buscar, actualizar, desactivar, reactivar, cambiar matrícula
 */
export class ControladorGestionUsuarios {

  private readonly servicioGestion: ServicioGestionUsuarios;

  constructor() {
    this.servicioGestion = new ServicioGestionUsuarios();
    // Binding para mantener contexto 'this'
    this.listarUsuarios = this.listarUsuarios.bind(this);
    this.obtenerUsuario = this.obtenerUsuario.bind(this);
    this.buscarUsuarios = this.buscarUsuarios.bind(this);
    this.actualizarUsuario = this.actualizarUsuario.bind(this);
    this.desactivarUsuario = this.desactivarUsuario.bind(this);
    this.reactivarUsuario = this.reactivarUsuario.bind(this);
    this.actualizarEstadoMatricula = this.actualizarEstadoMatricula.bind(this);
  }

  /**
   * GET /api/usuarios
   * Lista usuarios con filtros y paginación.
   * Acceso: ADMIN (todos) o SECRETARIA (solo estudiantes)
   */
  async listarUsuarios(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pagina = parseInt(req.query.pagina as string) || 1;
      const limite = parseInt(req.query.limite as string) || 20;
      const rol = req.query.rol as string | undefined;
      const activo = req.query.activo
        ? req.query.activo === 'true'
        : undefined;

      const rolUsuarioAutor = req.usuario!.rol;

      const resultado = await this.servicioGestion.listarUsuarios(
        { pagina, limite, rol, activo },
        rolUsuarioAutor,
      );

      RespuestaUtil.exito(
        res,
        `Se listaron ${resultado.usuarios.length} de ${resultado.total} usuarios`,
        resultado,
        200,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/usuarios/:id
   * Obtiene un usuario completo por ID.
   * Acceso: ADMIN (cualquier usuario) o SECRETARIA (solo estudiantes)
   */
  async obtenerUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idUsuario = parseInt(<string>req.params.id);
      if (isNaN(idUsuario)) {
        RespuestaUtil.error(res, 'El ID debe ser un número válido', 400);
        return;
      }

      const rolUsuarioAutor = req.usuario!.rol;

      const usuario = await this.servicioGestion.obtenerUsuario(
        idUsuario,
        rolUsuarioAutor,
      );

      RespuestaUtil.exito(
        res,
        'Usuario obtenido exitosamente',
        usuario,
        200,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/usuarios/buscar?q=termino
   * Busca usuarios por nombre, email o código.
   * Acceso: ADMIN (todos) o SECRETARIA (solo estudiantes)
   */
  async buscarUsuarios(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const termino = (req.query.q as string) || '';
      const limite = parseInt(req.query.limite as string) || 20;

      const rolUsuarioAutor = req.usuario!.rol;

      const resultados = await this.servicioGestion.buscarUsuarios(
        termino,
        rolUsuarioAutor,
        limite,
      );

      RespuestaUtil.exito(
        res,
        `Se encontraron ${resultados.length} usuario(s)`,
        { resultados, cantidad: resultados.length },
        200,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/usuarios/:id
   * Actualiza datos básicos de un usuario (nombre, email).
   * Acceso: ADMIN (cualquier usuario) o SECRETARIA (solo estudiantes)
   *
   * Body:
   * {
   *   "nombre_completo": "Juan Nuevo Nombre",
   *   "email_institucional": "newemail@universidad.edu.co"
   * }
   */
  async actualizarUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idUsuario = parseInt(<string>req.params.id);
      if (isNaN(idUsuario)) {
        RespuestaUtil.error(res, 'El ID debe ser un número válido', 400);
        return;
      }

      const idUsuarioAutor = req.usuario!.id_usuario;
      const rolUsuarioAutor = req.usuario!.rol;

      const datos = {
        nombre_completo: req.body.nombre_completo,
        email_institucional: req.body.email_institucional,
      };

      await this.servicioGestion.actualizarUsuario(
        idUsuario,
        datos,
        idUsuarioAutor,
        rolUsuarioAutor,
      );

      RespuestaUtil.exito(
        res,
        'Usuario actualizado exitosamente',
        { id_usuario: idUsuario },
        200,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/usuarios/:id/desactivar
   * Desactiva un usuario (no puede acceder al sistema).
   * Acceso: ADMIN (cualquier usuario) o SECRETARIA (solo estudiantes)
   *
   * Nota: Se marca activo = false, auditoría registrada automáticamente
   */
  async desactivarUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idUsuario = parseInt(<string>req.params.id);
      if (isNaN(idUsuario)) {
        RespuestaUtil.error(res, 'El ID debe ser un número válido', 400);
        return;
      }

      const idUsuarioAutor = req.usuario!.id_usuario;
      const rolUsuarioAutor = req.usuario!.rol;

      await this.servicioGestion.desactivarUsuario(
        idUsuario,
        idUsuarioAutor,
        rolUsuarioAutor,
      );

      RespuestaUtil.exito(
        res,
        'Usuario desactivado exitosamente. No podrá acceder al sistema',
        { id_usuario: idUsuario, activo: false },
        200,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/usuarios/:id/reactivar
   * Reactiva un usuario si fue desactivado.
   * Acceso: Solo ADMIN
   */
  async reactivarUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idUsuario = parseInt(<string>req.params.id);
      if (isNaN(idUsuario)) {
        RespuestaUtil.error(res, 'El ID debe ser un número válido', 400);
        return;
      }

      const idUsuarioAutor = req.usuario!.id_usuario;
      const rolUsuarioAutor = req.usuario!.rol;

      await this.servicioGestion.reactivarUsuario(
        idUsuario,
        idUsuarioAutor,
        rolUsuarioAutor,
      );

      RespuestaUtil.exito(
        res,
        'Usuario reactivado exitosamente. Podrá acceder al sistema',
        { id_usuario: idUsuario, activo: true },
        200,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/usuarios/:id/estado-matricula
   * Actualiza el estado de matrícula de un estudiante.
   * Acceso: ADMIN o SECRETARIA (solo estudiantes)
   *
   * Body:
   * {
   *   "matricula_activa": true  // o false
   * }
   */
  async actualizarEstadoMatricula(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idUsuario = parseInt(<string>req.params.id);
      if (isNaN(idUsuario)) {
        RespuestaUtil.error(res, 'El ID debe ser un número válido', 400);
        return;
      }

      const matriculaActiva = req.body.matricula_activa;
      if (typeof matriculaActiva !== 'boolean') {
        RespuestaUtil.error(res, 'matricula_activa debe ser true o false', 400);
        return;
      }

      const idUsuarioAutor = req.usuario!.id_usuario;
      const rolUsuarioAutor = req.usuario!.rol;

      await this.servicioGestion.actualizarEstadoMatricula(
        idUsuario,
        matriculaActiva,
        idUsuarioAutor,
        rolUsuarioAutor,
      );

      const estado = matriculaActiva ? 'activa' : 'inactiva';
      RespuestaUtil.exito(
        res,
        `Matrícula actualizada a ${estado}`,
        { id_usuario: idUsuario, matricula_activa: matriculaActiva },
        200,
      );
    } catch (error) {
      next(error);
    }
  }
}

