// src/repositories/notificacion.repository.ts
// Repositorio para gestión de notificaciones en base de datos

import { pool } from '../config/database';
import { ErrorBaseDatos } from '../middlewares/errorHandler';

export type TipoNotificacion =
  | 'solicitud_nueva'
  | 'solicitud_aprobada'
  | 'solicitud_rechazada'
  | 'solicitud_revision'
  | 'cambio_estado'
  | 'general';

export type CanalEnvio = 'websocket' | 'fcm' | 'bd_pendiente' | 'fallback';

/**
 * Interfaz para crear una notificación
 */
export interface CrearNotificacionDTO {
  usuario_id: number;
  solicitud_id?: number | null;
  titulo: string;
  mensaje: string;
  tipo_notificacion?: TipoNotificacion;
  canal_envio?: CanalEnvio;
}

/**
 * Interfaz para actualizar estado de notificación
 */
export interface ActualizarNotificacionDTO {
  leido?: boolean;
  canal_envio?: CanalEnvio;
  intentos_reintento?: number;
  proxima_lectura?: Date | null;
}

/**
 * Interfaz para registrar device token
 */
export interface RegistrarDispositivoDTO {
  usuario_id: number;
  device_token: string;
  plataforma: 'web' | 'ios' | 'android';
  metadata?: Record<string, any>;
}

export class RepositorioNotificacion {
  /**
   * Crear una notificación en BD
   * @param datos - Datos de la notificación
   * @returns ID de notificación creada
   */
  async crear(datos: CrearNotificacionDTO): Promise<number> {
    try {
      const {
        usuario_id,
        solicitud_id,
        titulo,
        mensaje,
        tipo_notificacion = 'general',
        canal_envio = 'bd_pendiente',
      } = datos;

      const resultado = await pool.query<{ id: number }>(
        `INSERT INTO notificaciones
          (usuario_id, solicitud_id, titulo, mensaje, tipo_notificacion, canal_envio, leido)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE)
         RETURNING id`,
        [usuario_id, solicitud_id || null, titulo, mensaje, tipo_notificacion, canal_envio],
      );

      return resultado.rows[0].id;
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al crear notificación: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Obtener notificación por ID
   */
  async obtenerPorId(id: number): Promise<any> {
    try {
      const resultado = await pool.query(
        `SELECT 
          id, usuario_id, solicitud_id, titulo, mensaje, 
          tipo_notificacion, canal_envio, intentos_reintento,
          leido, created_at, updated_at
         FROM notificaciones
         WHERE id = $1`,
        [id],
      );

      if (resultado.rows.length === 0) {
        throw new Error(`Notificación ${id} no encontrada`);
      }

      return resultado.rows[0];
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al obtener notificación: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Obtener notificaciones no leídas de un usuario (últimas 20)
   */
  async obtenerNoLeidasPorUsuario(usuarioId: number, limite: number = 20): Promise<any[]> {
    try {
      const resultado = await pool.query(
        `SELECT 
          id, solicitud_id, titulo, mensaje, tipo_notificacion,
          created_at, updated_at
         FROM notificaciones
         WHERE usuario_id = $1 AND leido = FALSE
         ORDER BY created_at DESC
         LIMIT $2`,
        [usuarioId, limite],
      );

      return resultado.rows;
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al obtener notificaciones no leídas: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Obtener todas las notificaciones de un usuario (con paginación)
   */
  async obtenerPorUsuario(
    usuarioId: number,
    pagina: number = 1,
    tamanio: number = 10,
  ): Promise<{ datos: any[]; total: number }> {
    try {
      const offset = (pagina - 1) * tamanio;

      const [resultadoDatos, resultadoTotal] = await Promise.all([
        pool.query(
          `SELECT 
            id, solicitud_id, titulo, mensaje, tipo_notificacion,
            canal_envio, leido, created_at, updated_at
           FROM notificaciones
           WHERE usuario_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [usuarioId, tamanio, offset],
        ),
        pool.query(
          `SELECT COUNT(*) as total FROM notificaciones WHERE usuario_id = $1`,
          [usuarioId],
        ),
      ]);

      return {
        datos: resultadoDatos.rows,
        total: parseInt(resultadoTotal.rows[0].total, 10),
      };
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al obtener notificaciones del usuario: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Marcar notificación como leída
   */
  async marcarComoLeida(id: number): Promise<void> {
    try {
      await pool.query(
        `UPDATE notificaciones
         SET leido = TRUE, updated_at = NOW()
         WHERE id = $1`,
        [id],
      );
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al marcar notificación como leída: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Marcar todas las notificaciones de un usuario como leídas
   */
  async marcarTodasComoLeidas(usuarioId: number): Promise<number> {
    try {
      const resultado = await pool.query(
        `UPDATE notificaciones
         SET leido = TRUE, updated_at = NOW()
         WHERE usuario_id = $1 AND leido = FALSE
         RETURNING id`,
        [usuarioId],
      );

      return resultado.rows.length;
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al marcar notificaciones como leídas: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Actualizar canal de envío y reintentos
   */
  async actualizarEstadoEnvio(
    id: number,
    datos: ActualizarNotificacionDTO,
  ): Promise<void> {
    try {
      const campos: string[] = [];
      const valores: any[] = [];
      let indice = 1;

      if (datos.leido !== undefined) {
        campos.push(`leido = $${indice++}`);
        valores.push(datos.leido);
      }

      if (datos.canal_envio) {
        campos.push(`canal_envio = $${indice++}`);
        valores.push(datos.canal_envio);
      }

      if (datos.intentos_reintento !== undefined) {
        campos.push(`intentos_reintento = $${indice++}`);
        valores.push(datos.intentos_reintento);
      }

      if (datos.proxima_lectura !== undefined) {
        campos.push(`proxima_lectura = $${indice++}`);
        valores.push(datos.proxima_lectura);
      }

      campos.push(`updated_at = NOW()`);

      valores.push(id);

      const query = `UPDATE notificaciones SET ${campos.join(', ')} WHERE id = $${indice}`;

      await pool.query(query, valores);
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al actualizar notificación: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Obtener notificaciones pendientes de reenvío por FCM (intentos < 3)
   */
  async obtenerPendientesDeReintento(): Promise<any[]> {
    try {
      const resultado = await pool.query(
        `SELECT 
          id, usuario_id, solicitud_id, titulo, mensaje, 
          tipo_notificacion, intentos_reintento, proxima_lectura
         FROM notificaciones
         WHERE canal_envio IN ('fcm', 'fallback')
           AND intentos_reintento < 3
           AND (proxima_lectura IS NULL OR proxima_lectura <= NOW())
           AND leido = FALSE
         ORDER BY proxima_lectura ASC NULLS FIRST
         LIMIT 50`,
      );

      return resultado.rows;
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al obtener notificaciones pendientes: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Registrar dispositivo push
   */
  async registrarDispositivo(datos: RegistrarDispositivoDTO): Promise<number> {
    try {
      const { usuario_id, device_token, plataforma, metadata } = datos;

      const resultado = await pool.query<{ id: number }>(
        `INSERT INTO dispositivos_push
          (usuario_id, device_token, plataforma, activo, metadata)
         VALUES ($1, $2, $3, TRUE, $4)
         ON CONFLICT (usuario_id, device_token, plataforma)
         DO UPDATE SET 
          ultima_uso = NOW(),
          activo = TRUE,
          metadata = EXCLUDED.metadata
         RETURNING id`,
        [usuario_id, device_token, plataforma, metadata ? JSON.stringify(metadata) : null],
      );

      return resultado.rows[0].id;
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al registrar dispositivo: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Obtener dispositivos activos de un usuario
   */
  async obtenerDispositivosActivos(usuarioId: number): Promise<any[]> {
    try {
      const resultado = await pool.query(
        `SELECT 
          id, device_token, plataforma, metadata, ultima_uso
         FROM dispositivos_push
         WHERE usuario_id = $1 AND activo = TRUE
         ORDER BY ultima_uso DESC`,
        [usuarioId],
      );

      return resultado.rows;
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al obtener dispositivos: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Desactivar dispositivo
   */
  async desactivarDispositivo(id: number): Promise<void> {
    try {
      await pool.query(
        `UPDATE dispositivos_push
         SET activo = FALSE
         WHERE id = $1`,
        [id],
      );
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al desactivar dispositivo: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Obtener estadísticas de notificaciones no leídas
   */
  async obtenerEstadisticasNoLeidas(usuarioId: number): Promise<{
    total: number;
    por_tipo: Record<string, number>;
  }> {
    try {
      const resultado = await pool.query(
        `SELECT 
          COUNT(*) as total,
          tipo_notificacion,
          COUNT(*) FILTER (WHERE tipo_notificacion = 'solicitud_nueva') as solicitud_nueva,
          COUNT(*) FILTER (WHERE tipo_notificacion = 'solicitud_aprobada') as solicitud_aprobada,
          COUNT(*) FILTER (WHERE tipo_notificacion = 'solicitud_rechazada') as solicitud_rechazada
         FROM notificaciones
         WHERE usuario_id = $1 AND leido = FALSE
         GROUP BY tipo_notificacion`,
        [usuarioId],
      );

      if (resultado.rows.length === 0) {
        return { total: 0, por_tipo: {} };
      }

      const total = resultado.rows.reduce((sum, row) => sum + parseInt(row.total, 10), 0);
      const por_tipo: Record<string, number> = {};

      resultado.rows.forEach((row) => {
        por_tipo[row.tipo_notificacion] = parseInt(row[row.tipo_notificacion], 10) || 0;
      });

      return { total, por_tipo };
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al obtener estadísticas: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Eliminar notificación (soft delete conceptual)
   */
  async eliminar(id: number): Promise<void> {
    try {
      await pool.query(
        `DELETE FROM notificaciones WHERE id = $1`,
        [id],
      );
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al eliminar notificación: ${(error as Error).message}`,
      );
    }
  }
}

