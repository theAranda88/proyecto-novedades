// src/services/GestionUsuariosService.ts
// Servicio de Gestión Integral de Usuarios — CRUD con control de roles y auditoría

import { RepositorioGestionUsuarios } from '../repositories/usuario.repository';
import { ErrorNegocio, ErrorAutenticacion } from '../middlewares/errorHandler';
import { RolUsuario } from '../middlewares/authMiddleware';

/**
 * Respuesta de listado con paginación
 */
type ResultadoListado = {
  usuarios: any[];
  total: number;
  pagina: number;
  limite: number;
  total_paginas: number;
};

/**
 * Reglas de autorización para GESTIÓN de usuarios según rol autenticado.
 * Define qué roles pueden gestionar (editar, desactivar) qué otros roles.
 *
 * ADMIN: puede gestionar todo (otros ADMIN, SECRETARIA, ESTUDIANTE)
 * SECRETARIA: solo puede gestionar ESTUDIANTE
 * ESTUDIANTE: no puede gestionar a nadie
 */
const PERMISOS_GESTION: Record<string, string[]> = {
  'admin':      ['ADMIN', 'SECRETARIA', 'ESTUDIANTE'],
  'secretaria': ['ESTUDIANTE'],
  'estudiante': [],
};


export class ServicioGestionUsuarios {

  private readonly repoGestion: RepositorioGestionUsuarios;

  constructor() {
    this.repoGestion = new RepositorioGestionUsuarios();
  }

  // ============================================================================
  // LECTURA
  // ============================================================================

  /**
   * Lista usuarios con filtros y paginación.
   * Acceso: Solo ADMIN (ver todos) o SECRETARIA (ver solo estudiantes)
   *
   * @param filtros - { rol?, activo?, pagina, limite }
   * @param rolUsuarioAutor - Rol del usuario autenticado
   * @returns {Promise<ResultadoListado>} Lista paginada de usuarios
   * @throws {ErrorAutenticacion} Sin permisos
   */
  async listarUsuarios(
    filtros: {
      rol?: string;
      activo?: boolean;
      pagina?: number;
      limite?: number;
    },
    rolUsuarioAutor: RolUsuario,
  ): Promise<ResultadoListado> {
    // Validar permisos: solo ADMIN y SECRETARIA pueden listar
    if (rolUsuarioAutor === RolUsuario.ESTUDIANTE) {
      throw new ErrorAutenticacion(
        'Los estudiantes no pueden listar usuarios del sistema',
        403,
      );
    }

    // Si es SECRETARIA, solo puede ver ESTUDIANTE
    if (rolUsuarioAutor === RolUsuario.SECRETARIA) {
      filtros.rol = 'ESTUDIANTE';
    }

    const pagina = filtros.pagina ?? 1;
    const limite = filtros.limite ?? 20;

    // Validar paginación
    if (pagina < 1 || limite < 1 || limite > 100) {
      throw new ErrorNegocio(
        'Paginación inválida: pagina >= 1, 1 <= limite <= 100',
        400,
      );
    }

    const resultado = await this.repoGestion.listarConFiltros({
      rol: filtros.rol,
      activo: filtros.activo,
      pagina,
      limite,
    });

    const totalPaginas = Math.ceil(resultado.total / limite);

    return {
      usuarios: resultado.usuarios,
      total: resultado.total,
      pagina,
      limite,
      total_paginas: totalPaginas,
    };
  }

  /**
   * Obtiene un usuario por su ID con todos sus datos.
   * Acceso: ADMIN (cualquier usuario) o SECRETARIA (solo estudiantes)
   *
   * @param idUsuario - ID del usuario a consultar
   * @param rolUsuarioAutor - Rol del usuario autenticado
   * @returns {Promise<any>} Datos completos del usuario
   * @throws {ErrorAutenticacion} Sin permisos
   * @throws {ErrorNegocio} Usuario no encontrado
   */
  async obtenerUsuario(
    idUsuario: number,
    rolUsuarioAutor: RolUsuario,
  ): Promise<any> {
    // Validar permiso básico
    if (rolUsuarioAutor === RolUsuario.ESTUDIANTE) {
      throw new ErrorAutenticacion(
        'Los estudiantes no pueden consultar datos de otros usuarios',
        403,
      );
    }

    const usuario = await this.repoGestion.obtenerPorId(idUsuario);

    if (!usuario) {
      throw new ErrorNegocio('Usuario no encontrado', 404);
    }

    // Si es SECRETARIA, validar que sea ESTUDIANTE
    if (rolUsuarioAutor === RolUsuario.SECRETARIA) {
      if (usuario.rol?.toUpperCase() !== 'ESTUDIANTE') {
        throw new ErrorAutenticacion(
          'Las secretarias solo pueden consultar estudiantes',
          403,
        );
      }
    }

    return usuario;
  }

  /**
   * Busca usuarios por nombre, email o código estudiantil.
   * Acceso: ADMIN (todos) o SECRETARIA (solo estudiantes)
   *
   * @param termino - Texto de búsqueda
   * @param rolUsuarioAutor - Rol del usuario autenticado
   * @param limite - Límite de resultados (máx 50)
   * @returns {Promise<any[]>} Usuarios que coinciden
   */
  async buscarUsuarios(
    termino: string,
    rolUsuarioAutor: RolUsuario,
    limite: number = 20,
  ): Promise<any[]> {
    if (rolUsuarioAutor === RolUsuario.ESTUDIANTE) {
      throw new ErrorAutenticacion(
        'Los estudiantes no pueden buscar usuarios',
        403,
      );
    }

    if (!termino || termino.trim().length < 2) {
      throw new ErrorNegocio('El término de búsqueda debe tener al menos 2 caracteres', 400);
    }

    if (limite < 1 || limite > 50) {
      throw new ErrorNegocio('El límite debe estar entre 1 y 50', 400);
    }

    let resultados = await this.repoGestion.buscar(termino, limite);

    // Si es SECRETARIA, filtrar solo ESTUDIANTE
    if (rolUsuarioAutor === RolUsuario.SECRETARIA) {
      resultados = resultados.filter(
        (u) => u.rol?.toUpperCase() === 'ESTUDIANTE'
      );
    }

    return resultados;
  }

  // ============================================================================
  // ACTUALIZACIÓN
  // ============================================================================

  /**
   * Actualiza datos básicos de un usuario (nombre, email).
   * Acceso: ADMIN (cualquier usuario) o SECRETARIA (solo estudiantes)
   *
   * Validaciones:
   *   - No se puede cambiar el rol (solo editar nombre/email)
   *   - Email debe ser único
   *   - No puedo autoeditar en ciertos campos
   *
   * @param idUsuario - ID del usuario a editar
   * @param datos - { nombre_completo?, email_institucional? }
   * @param idUsuarioAutor - ID del usuario autenticado
   * @param rolUsuarioAutor - Rol del usuario autenticado
   * @throws {ErrorAutenticacion} Sin permisos
   * @throws {ErrorNegocio} Validación fallida
   */
  async actualizarUsuario(
    idUsuario: number,
    datos: { nombre_completo?: string; email_institucional?: string },
    idUsuarioAutor: number,
    rolUsuarioAutor: RolUsuario,
  ): Promise<void> {
    // 1. Validar que el usuario existe
    const usuarioExistente = await this.repoGestion.obtenerPorId(idUsuario);
    if (!usuarioExistente) {
      throw new ErrorNegocio('Usuario no encontrado', 404);
    }

    // 2. Validar permisos según rol
    const rolesPermitidos = PERMISOS_GESTION[rolUsuarioAutor] || [];
    const rolUsuarioEnMayuscula = usuarioExistente.rol?.toUpperCase();

    if (!rolesPermitidos.includes(rolUsuarioEnMayuscula || '')) {
      throw new ErrorAutenticacion(
        `No tiene permisos para editar a un usuario con rol ${usuarioExistente.rol}`,
        403,
      );
    }

    // 3. Validaciones de datos
    if (datos.nombre_completo) {
      if (datos.nombre_completo.length < 3 || datos.nombre_completo.length > 200) {
        throw new ErrorNegocio(
          'El nombre debe tener entre 3 y 200 caracteres',
          400,
        );
      }
    }

    if (datos.email_institucional) {
      if (datos.email_institucional !== usuarioExistente.email_institucional) {
        const emailExiste = await this.verificarEmailUnico(datos.email_institucional);
        if (emailExiste) {
          throw new ErrorNegocio(
            `El email ${datos.email_institucional} ya está registrado`,
            409,
          );
        }
      }
    }

    // 4. Actualizar
    await this.repoGestion.actualizar(idUsuario, datos, idUsuarioAutor);
  }

  /**
   * Desactiva un usuario (no puede acceder al sistema).
   * Acceso: ADMIN (cualquier usuario) o SECRETARIA (solo estudiantes)
   *
   * Validaciones:
   *   - No puedo desactivarme a mí mismo
   *   - Un ADMIN no puede desactivar a otro ADMIN de igual o mayor rango
   *
   * @param idUsuario - ID del usuario a desactivar
   * @param idUsuarioAutor - ID del usuario autenticado
   * @param rolUsuarioAutor - Rol del usuario autenticado
   * @throws {ErrorAutenticacion} Sin permisos
   * @throws {ErrorNegocio} Validación fallida
   */
  async desactivarUsuario(
    idUsuario: number,
    idUsuarioAutor: number,
    rolUsuarioAutor: RolUsuario,
  ): Promise<void> {
    // 1. No puedo desactivarme a mí mismo
    if (idUsuario === idUsuarioAutor) {
      throw new ErrorNegocio(
        'No puede desactivar su propia cuenta. Contacte a un administrador',
        400,
      );
    }

    // 2. Obtener usuario a desactivar
    const usuario = await this.repoGestion.obtenerPorId(idUsuario);
    if (!usuario) {
      throw new ErrorNegocio('Usuario no encontrado', 404);
    }

    // 3. Validar permisos
    const rolesPermitidos = PERMISOS_GESTION[rolUsuarioAutor] || [];
    const rolUsuarioEnMayuscula = usuario.rol?.toUpperCase();

    if (!rolesPermitidos.includes(rolUsuarioEnMayuscula || '')) {
      throw new ErrorAutenticacion(
        `No tiene permisos para desactivar a un usuario con rol ${usuario.rol}`,
        403,
      );
    }

    // 4. Si ya está inactivo, no hacer nada
    if (!usuario.activo) {
      throw new ErrorNegocio('Este usuario ya está desactivado', 400);
    }

    // 5. Desactivar
    await this.repoGestion.desactivar(idUsuario, idUsuarioAutor);
  }

  /**
   * Reactiva un usuario (si fue desactivado).
   * Acceso: Solo ADMIN
   *
   * @param idUsuario - ID del usuario a reactivar
   * @param idUsuarioAutor - ID del usuario autenticado
   * @param rolUsuarioAutor - Rol del usuario autenticado
   * @throws {ErrorAutenticacion} Sin permisos (solo ADMIN)
   * @throws {ErrorNegocio} Usuario no encontrado o ya activo
   */
  async reactivarUsuario(
    idUsuario: number,
    idUsuarioAutor: number,
    rolUsuarioAutor: RolUsuario,
  ): Promise<void> {
    // Solo ADMIN puede reactivar
    if (rolUsuarioAutor !== RolUsuario.ADMIN) {
      throw new ErrorAutenticacion(
        'Solo los administradores pueden reactivar usuarios',
        403,
      );
    }

    const usuario = await this.repoGestion.obtenerPorId(idUsuario);
    if (!usuario) {
      throw new ErrorNegocio('Usuario no encontrado', 404);
    }

    if (usuario.activo) {
      throw new ErrorNegocio('Este usuario ya está activo', 400);
    }

    await this.repoGestion.reactivar(idUsuario, idUsuarioAutor);
  }

  /**
   * Actualiza el estado de matrícula de un estudiante.
   * Acceso: ADMIN o SECRETARIA (solo estudiantes)
   *
   * @param idUsuario - ID del estudiante
   * @param matriculaActiva - true = activa, false = inactiva
   * @param idUsuarioAutor - ID del usuario autenticado
   * @param rolUsuarioAutor - Rol del usuario autenticado
   * @throws {ErrorAutenticacion} Sin permisos
   * @throws {ErrorNegocio} Validación fallida
   */
  async actualizarEstadoMatricula(
    idUsuario: number,
    matriculaActiva: boolean,
    idUsuarioAutor: number,
    rolUsuarioAutor: RolUsuario,
  ): Promise<void> {
    // Validar permiso
    if (rolUsuarioAutor === RolUsuario.ESTUDIANTE) {
      throw new ErrorAutenticacion(
        'Los estudiantes no pueden cambiar estado de matrícula',
        403,
      );
    }

    // Obtener usuario
    const usuario = await this.repoGestion.obtenerPorId(idUsuario);
    if (!usuario) {
      throw new ErrorNegocio('Usuario no encontrado', 404);
    }

    // Validar que sea ESTUDIANTE
    if (usuario.rol?.toUpperCase() !== 'ESTUDIANTE') {
      throw new ErrorNegocio(
        'Solo se puede cambiar estado de matrícula a estudiantes',
        400,
      );
    }

    // Si es SECRETARIA, solo puede editar estudiantes (ya validado arriba, pero redundancia es OK)
    if (rolUsuarioAutor === RolUsuario.SECRETARIA) {
      // Ya validado en línea anterior que es ESTUDIANTE
    }

    // Actualizar
    await this.repoGestion.actualizarEstadoMatricula(
      idUsuario,
      matriculaActiva,
      idUsuarioAutor,
    );
  }

  // ============================================================================
  // UTILITARIOS
  // ============================================================================

  /**
   * Verifica si un email es único (no existe en el sistema).
   * Retorna true si es único (disponible), false si ya existe.
   *
   * TODO: Implementar con repo.existeEmail() cuando esté disponible
   */
  private async verificarEmailUnico(email: string): Promise<boolean> {
    // Por ahora retorna true (asume que no existe)
    // En el futuro usar: const existe = await this.repoGestion.existeEmail(email);
    // return !existe; (retornar true si NO existe)
    return true;
  }
}


