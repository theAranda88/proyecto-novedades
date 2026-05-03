// src/services/NotificationOrchestrator.ts
// Orquestador de notificaciones híbridas (WebSocket + FCM + BD)
// Coordina el envío por múltiples canales con fallback automático

import { Server as SocketIOServer } from 'socket.io';
import { RepositorioNotificacion, TipoNotificacion } from '../repositories/notificacion.repository';
import { ServicioNotificacion } from './NotificacionService';
import { FCMService } from './FCMService';
import { estaConectado, obtenerConexiones } from '../config/socketio';
import { ErrorNegocio, ErrorBaseDatos } from '../middlewares/errorHandler';

/**
 * Interfaz para datos de notificación a enviar
 */
export interface DatosNotificacionHibrida {
  usuarioId: number;
  solicitudId?: number;
  titulo: string;
  mensaje: string;
  tipo: TipoNotificacion;
  destinatarios?: 'estudiante' | 'secretarias' | 'admin' | 'todos';
  observaciones?: string;
}

/**
 * Interfaz para resultado de envío
 */
export interface ResultadoEnvio {
  exitoso: boolean;
  canalPrincipal: string;
  canalFallback?: string;
  notificacionId: number;
  timestamp: string;
  detalles: {
    websocket: { enviado: boolean; motivo?: string };
    fcm?: { enviado: boolean; motivo?: string };
    bd: { enviado: boolean; motivo?: string };
  };
}

export class NotificationOrchestrator {
  private io: SocketIOServer | null = null;
  private repositorio: RepositorioNotificacion;
  private servicio: ServicioNotificacion;
  private fcmService: any; // Instancia singleton de FCMService

  constructor(io?: SocketIOServer) {
    this.io = io || null;
    this.repositorio = new RepositorioNotificacion();
    this.servicio = new ServicioNotificacion();
    this.fcmService = FCMService.obtenerInstancia();
  }

  /**
   * Establecer instancia de Socket.io (se llama desde server.ts)
   */
  public establecerIO(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * Enviar notificación por canal óptimo con fallback
   * Estrategia INTELIGENTE:
   * 1. Siempre guardar en BD (garantía absoluta)
   * 2. Si usuario online → WebSocket (instantáneo)
   * 3. Si no online y tiene dispositivos push → FCM
   * 4. Si FCM no disponible → Marcar como fallback (reintentos futuros)
   */
  async enviarNotificacion(datos: DatosNotificacionHibrida): Promise<ResultadoEnvio> {
    const timestamp = new Date().toISOString();
    const detalles: any = {
      websocket: { enviado: false, motivo: '' },
      fcm: { enviado: false, motivo: '' },
      bd: { enviado: false, motivo: '' },
    };

    try {
      // PASO 1: Crear registro en BD (es el fallback absoluto)
      let notificacionId: number;
      try {
        notificacionId = await this.repositorio.crear({
          usuario_id: datos.usuarioId,
          solicitud_id: datos.solicitudId || null,
          titulo: datos.titulo,
          mensaje: datos.mensaje,
          tipo_notificacion: datos.tipo,
          canal_envio: 'bd_pendiente',
        });
        detalles.bd.enviado = true;
      } catch (error) {
        detalles.bd.enviado = false;
        detalles.bd.motivo = (error as Error).message;
        throw new ErrorBaseDatos(`No se pudo guardar notificación en BD: ${(error as Error).message}`);
      }

      // PASO 2: Intentar WebSocket (si usuario conectado)
      let canalPrincipal = 'bd_pendiente';
      if (this.io && estaConectado(datos.usuarioId)) {
        try {
          const evento = this.mapearEventoSegunTipo(datos.tipo);
          this.io.to(`usuario-${datos.usuarioId}`).emit(evento, {
            id: notificacionId,
            titulo: datos.titulo,
            mensaje: datos.mensaje,
            tipo: datos.tipo,
            solicitudId: datos.solicitudId,
            timestamp,
          });

          canalPrincipal = 'websocket';
          detalles.websocket.enviado = true;

          // Actualizar registro: se envió por WebSocket
          await this.repositorio.actualizarEstadoEnvio(notificacionId, {
            canal_envio: 'websocket',
          });

          return {
            exitoso: true,
            canalPrincipal,
            notificacionId,
            timestamp,
            detalles,
          };
        } catch (error) {
          detalles.websocket.enviado = false;
          detalles.websocket.motivo = (error as Error).message;
        }
      } else {
        detalles.websocket.motivo = 'Usuario no conectado';
      }

      // PASO 3: Si WebSocket falló, intentar FCM
      if (!detalles.websocket.enviado && this.fcmService.estaListoParaEnviar()) {
        try {
          const dispositivos = await this.repositorio.obtenerDispositivosActivos(datos.usuarioId);

          if (dispositivos.length > 0) {
            const tokens = dispositivos.map((d) => d.device_token);

            const resultadoFCM = await this.fcmService.enviarNotificacionMultiple(tokens, {
              titulo: datos.titulo,
              cuerpo: datos.mensaje,
              datos: {
                notificacion_id: notificacionId.toString(),
                tipo: datos.tipo,
                solicitud_id: datos.solicitudId?.toString() || '',
              },
              icono: '/assets/notification-icon.png',
            });

            if (resultadoFCM.exitosos > 0) {
              canalPrincipal = 'fcm';
              detalles.fcm.enviado = true;
              detalles.fcm.motivo = `${resultadoFCM.exitosos} de ${tokens.length} exitosos`;

              await this.repositorio.actualizarEstadoEnvio(notificacionId, {
                canal_envio: 'fcm',
              });
            } else {
              detalles.fcm.enviado = false;
              detalles.fcm.motivo = `Todos los intentos FCM fallaron (${resultadoFCM.fallidos} fallos)`;

              await this.repositorio.actualizarEstadoEnvio(notificacionId, {
                canal_envio: 'fallback',
                intentos_reintento: 0,
              });
            }
          } else {
            detalles.fcm.motivo = 'Usuario sin dispositivos registrados';

            await this.repositorio.actualizarEstadoEnvio(notificacionId, {
              canal_envio: 'fallback',
            });
          }
        } catch (error) {
          detalles.fcm.enviado = false;
          detalles.fcm.motivo = (error as Error).message;

          await this.repositorio.actualizarEstadoEnvio(notificacionId, {
            canal_envio: 'fallback',
            intentos_reintento: 0,
          });
        }
      } else if (!this.fcmService.estaListoParaEnviar()) {
        detalles.fcm.motivo = 'FCM no inicializado (credenciales faltantes)';

        await this.repositorio.actualizarEstadoEnvio(notificacionId, {
          canal_envio: 'fallback',
        });
      }

      return {
        exitoso: true,
        canalPrincipal,
        notificacionId,
        timestamp,
        detalles,
      };
    } catch (error) {
      throw new ErrorNegocio(
        `Error orquestando notificación: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Enviar notificación cuando se crea una solicitud (a secretarias)
   */
  async notificarNuevaSolicitud(
    solicitudId: number,
    codigoSolicitud: string,
    tipoSolicitud: string,
    usuarioIdEstudiante: number,
  ): Promise<ResultadoEnvio[]> {
    try {
      // Obtener IDs de secretarias (rol = 'SECRETARIA')
      // Por ahora, notificamos a una secretaria de prueba (ID: 7)
      // En producción, consultar tabla usuarios con rol SECRETARIA
      const secretariaIds = [7]; // TEMPORAL: será dinámico

      const resultados: ResultadoEnvio[] = [];

      for (const secretariaId of secretariaIds) {
        const resultado = await this.enviarNotificacion({
          usuarioId: secretariaId,
          solicitudId,
          titulo: 'Nueva Solicitud Recibida',
          mensaje: `Nueva solicitud ${codigoSolicitud} (${tipoSolicitud}) requiere revisión`,
          tipo: 'solicitud_nueva',
          observaciones: `Estudiante: ID ${usuarioIdEstudiante}`,
        });
        resultados.push(resultado);
      }

      return resultados;
    } catch (error) {
      throw new ErrorNegocio(
        `Error notificando nueva solicitud: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Enviar notificación cuando cambia el estado de una solicitud (al estudiante)
   */
  async notificarCambioEstadoSolicitud(
    solicitudId: number,
    codigoSolicitud: string,
    usuarioIdEstudiante: number,
    nuevoEstado: 'APROBADA' | 'RECHAZADA' | 'EN_REVISION',
    observaciones?: string,
  ): Promise<ResultadoEnvio> {
    try {
      const tipoMap: Record<string, TipoNotificacion> = {
        APROBADA: 'solicitud_aprobada',
        RECHAZADA: 'solicitud_rechazada',
        EN_REVISION: 'solicitud_revision',
      };

      const mensajeMap: Record<string, string> = {
        APROBADA: `Tu solicitud ${codigoSolicitud} ha sido APROBADA. ✅`,
        RECHAZADA: `Tu solicitud ${codigoSolicitud} ha sido RECHAZADA. ❌${observaciones ? ` Motivo: ${observaciones}` : ''}`,
        EN_REVISION: `Tu solicitud ${codigoSolicitud} está en revisión. ⏳`,
      };

      return await this.enviarNotificacion({
        usuarioId: usuarioIdEstudiante,
        solicitudId,
        titulo: `Solicitud ${nuevoEstado}`,
        mensaje: mensajeMap[nuevoEstado],
        tipo: tipoMap[nuevoEstado],
        observaciones,
      });
    } catch (error) {
      throw new ErrorNegocio(
        `Error notificando cambio de estado: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Mapear tipo de notificación a evento Socket.io
   */
  private mapearEventoSegunTipo(tipo: TipoNotificacion): string {
    switch (tipo) {
      case 'solicitud_nueva':
        return 'notificacion:solicitud_nueva';
      case 'solicitud_aprobada':
        return 'notificacion:solicitud_aprobada';
      case 'solicitud_rechazada':
        return 'notificacion:solicitud_rechazada';
      case 'solicitud_revision':
        return 'notificacion:solicitud_revision';
      case 'cambio_estado':
        return 'notificacion:cambio_estado';
      default:
        return 'notificacion:general';
    }
  }

  /**
   * Obtener estado actual de notificaciones (DEBUG)
   */
  async obtenerEstadoSistema(): Promise<{
    socketIoActivo: boolean;
    usuariosConectados: number;
    timestamp: string;
  }> {
    return {
      socketIoActivo: this.io !== null,
      usuariosConectados: this.io
        ? Object.keys(this.io.sockets.sockets).length
        : 0,
      timestamp: new Date().toISOString(),
    };
  }
}

// Exportar instancia singleton
export const orquestradorNotificaciones = new NotificationOrchestrator();



