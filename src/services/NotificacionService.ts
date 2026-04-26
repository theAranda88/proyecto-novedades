// src/services/NotificacionService.ts
// Servicio para gestión de notificaciones a estudiantes

import { pool } from '../config/database';
import { ErrorBaseDatos } from '../middlewares/errorHandler';

export type TipoNotificacion = 'solicitud_aprobada' | 'solicitud_rechazada' | 'solicitud_revision';

export class ServicioNotificacion {

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

      const resultado = await pool.query<{ id: number }>(
        `INSERT INTO notificaciones
            (usuario_id, solicitud_id, titulo, mensaje, leido)
         VALUES ($1, $2, $3, $4, FALSE)
         RETURNING id`,
        [usuarioId, solicitudId, titulo, mensaje],
      );

      return { id: resultado.rows[0].id };
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
      const resultado = await pool.query(
        `SELECT id, solicitud_id, titulo, mensaje, created_at
           FROM notificaciones
          WHERE usuario_id = $1
            AND leido = FALSE
          ORDER BY created_at DESC
          LIMIT 10`,
        [usuarioId],
      );
      return resultado.rows;
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
      await pool.query(
        `UPDATE notificaciones
            SET leido = TRUE
          WHERE id = $1`,
        [notificacionId],
      );
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al marcar notificación como leída: ${(error as Error).message}`,
      );
    }
  }
}

