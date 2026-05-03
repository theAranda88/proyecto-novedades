// src/services/NotificacionService.ts
// Servicio para gestión de notificaciones a estudiantes
// REFACTORIZADO: Ahora usa RepositorioNotificacion para mayor flexibilidad

import { RepositorioNotificacion, TipoNotificacion, CanalEnvio } from '../repositories/notificacion.repository';
import { ErrorBaseDatos, ErrorNegocio } from '../middlewares/errorHandler';

export class ServicioNotificacion {
  private repositorio: RepositorioNotificacion;

  constructor() {
    this.repositorio = new RepositorioNotificacion();
  }

  /**
   * Crea una notificación para un usuario.
   * Se ejecuta dentro de una transacción al cambiar el estado de una solicitud.
   *
   * @param usuarioId - ID del usuario (estudiante) que recibe la notificación
   * @param solicitudId - ID de la solicitud relacionada
   * @param tipo - Tipo de notificación
   * @param observaciones - Observaciones adicionales (para rechazadas)
   * @returns {Promise<{ id: number }>} ID de la notificación creada
   */
  async crearNotificacion(
    usuarioId: number,
    solicitudId: number,
    tipo: TipoNotificacion,
    observaciones?: string | null,
  ): Promise<{ id: number }> {
    try {
      const { titulo, mensaje } = this.generarContenidoNotificacion(tipo, observaciones);

      const id = await this.repositorio.crear({
        usuario_id: usuarioId,
        solicitud_id: solicitudId,
        titulo,
        mensaje,
        tipo_notificacion: tipo,
        canal_envio: 'bd_pendiente', // Inicialmente pendiente
      });

      return { id };
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al crear notificación: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Genera el título y mensaje de una notificación según el tipo.
   *
   * @private
   */
  private generarContenidoNotificacion(
    tipo: TipoNotificacion,
    observaciones?: string | null,
  ): { titulo: string; mensaje: string } {
    switch (tipo) {
      case 'solicitud_aprobada':
        return {
          titulo: 'Solicitud Aprobada',
          mensaje: 'Tu solicitud de novedad académica ha sido APROBADA. Puedes proceder con los trámites correspondientes.',
        };

      case 'solicitud_rechazada':
        return {
          titulo: 'Solicitud Rechazada',
          mensaje: `Tu solicitud de novedad académica ha sido RECHAZADA.${observaciones ? ` Motivo: ${observaciones}` : ''}`,
        };

      case 'solicitud_revision':
        return {
          titulo: 'Solicitud en Revisión',
          mensaje: 'Tu solicitud de novedad académica está siendo revisada por la Secretaría Académica.',
        };

      case 'solicitud_nueva':
        return {
          titulo: 'Nueva Solicitud Recibida',
          mensaje: 'Se ha recibido una nueva solicitud de novedad académica que requiere revisión.',
        };

      case 'cambio_estado':
        return {
          titulo: 'Cambio de Estado',
          mensaje: 'El estado de tu solicitud ha sido actualizado.',
        };

      default:
        return {
          titulo: 'Notificación del Sistema',
          mensaje: 'Has recibido una notificación del sistema.',
        };
    }
  }

  /**
   * Obtiene las notificaciones no leídas de un usuario.
   *
   * @param usuarioId - ID del usuario
   * @returns {Promise<any[]>} Lista de notificaciones no leídas
   */
  async obtenerNoLeidas(usuarioId: number): Promise<any[]> {
    try {
      return await this.repositorio.obtenerNoLeidasPorUsuario(usuarioId, 20);
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al obtener notificaciones: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Obtiene todas las notificaciones de un usuario con paginación
   */
  async obtenerPorUsuario(
    usuarioId: number,
    pagina: number = 1,
    tamanio: number = 10,
  ): Promise<{ datos: any[]; total: number }> {
    try {
      return await this.repositorio.obtenerPorUsuario(usuarioId, pagina, tamanio);
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al obtener notificaciones: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Marca una notificación como leída.
   *
   * @param notificacionId - ID de la notificación
   * @returns {Promise<void>}
   */
  async marcarComoLeida(notificacionId: number): Promise<void> {
    try {
      await this.repositorio.marcarComoLeida(notificacionId);
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al marcar notificación como leída: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Marca todas las notificaciones de un usuario como leídas
   */
  async marcarTodasComoLeidas(usuarioId: number): Promise<number> {
    try {
      return await this.repositorio.marcarTodasComoLeidas(usuarioId);
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al marcar notificaciones como leídas: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Obtiene estadísticas de notificaciones no leídas
   */
  async obtenerEstadisticas(usuarioId: number): Promise<{
    total: number;
    por_tipo: Record<string, number>;
  }> {
    try {
      return await this.repositorio.obtenerEstadisticasNoLeidas(usuarioId);
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al obtener estadísticas: ${(error as Error).message}`,
      );
    }
  }
}

