// src/services/DashboardService.ts
// Servicio de métricas y KPIs para el Dashboard de Secretaría
// Implementa requerimiento Sprint 3: GET /api/dashboard/secretaria

import { pool } from '../config/database';
import { ErrorNegocio } from '../middlewares/errorHandler';

/** Tipo para la distribución por tipo de solicitud */
type DistribucionTipo = {
  adicion: number;
  cambio_jornada: number;
  cambio_curso: number;
  curso_dirigido: number;
};

/** Tipo para la distribución por estado */
type DistribucionEstado = {
  pendiente: number;
  en_revision: number;
  aprobada: number;
  rechazada: number;
};

/** Objeto completo de métricas del dashboard */
export type MetricasDashboard = {
  total_pendientes: number;
  aprobadas_hoy: number;
  rechazadas_hoy: number;
  tiempo_respuesta_promedio: number;
  solicitudes_vencidas: number;
  distribucion_por_tipo: DistribucionTipo;
  distribucion_por_estado: DistribucionEstado;
  periodo_academico_actual: string;
};

export class ServicioDashboard {
  /**
   * Obtiene todas las métricas consolidadas para el dashboard de Secretaría.
   * IMPORTANTE: Esta implementación usa los nombres de columna REALES de la BD desplegada:
   * - estado_solicitud (no 'estado')
   * - tipo_novedad (no 'tipo_solicitud')
   * - fecha_creacion (columna base)
   * - updated_at (proxy de fecha_resolucion — migración 004 no aplicó esa columna en prod)
   *
   * @returns {Promise<MetricasDashboard>} Objeto con todas las métricas
   * @throws {ErrorNegocio} Si hay error en consultas a BD
   */
  async obtenerMetricasDashboard(): Promise<MetricasDashboard> {
    try {
      // Ejecutar todas las queries en paralelo
      const [
        resultadoTotalPendientes,
        resultadoAprobadosHoy,
        resultadoRechazadosHoy,
        resultadoTiempoPromedio,
        resultadoVencidas,
        resultadoDistribucionTipo,
        resultadoDistribucionEstado,
      ] = await Promise.all([
        this.obtenerTotalPendientes(),
        this.obtenerAprobadosHoy(),
        this.obtenerRechazadosHoy(),
        this.obtenerTiempoResuestaPromedio(),
        this.obtenerSolicitudesVencidas(),
        this.obtenerDistribucionPorTipo(),
        this.obtenerDistribucionPorEstado(),
      ]);

      return {
        total_pendientes: resultadoTotalPendientes,
        aprobadas_hoy: resultadoAprobadosHoy,
        rechazadas_hoy: resultadoRechazadosHoy,
        tiempo_respuesta_promedio: resultadoTiempoPromedio,
        solicitudes_vencidas: resultadoVencidas,
        distribucion_por_tipo: resultadoDistribucionTipo,
        distribucion_por_estado: resultadoDistribucionEstado,
        periodo_academico_actual: this.obtenerPeriodoActual(),
      };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'Error desconocido';
      throw new ErrorNegocio(
        `Error al obtener métricas del dashboard: ${mensaje}`,
        500,
      );
    }
  }

  /**
   * Cuenta total de solicitudes pendientes activas
   * Usa: estado_solicitud (columna real en BD)
   * @private
   */
  private async obtenerTotalPendientes(): Promise<number> {
    const query = `
      SELECT COUNT(*) as total
      FROM solicitudes
      WHERE estado_solicitud = 'PENDIENTE'
        AND deleted_at IS NULL
    `;
    const resultado = await pool.query(query);
    return Number(resultado.rows[0]?.total ?? 0);
  }

  /**
   * Cuenta solicitudes aprobadas en la fecha actual (HOY)
   * Usa: estado_solicitud + updated_at (proxy de fecha_resolucion — no existe en BD desplegada)
   * updated_at es equivalente porque se actualiza al momento de resolver la solicitud.
   * @private
   */
  private async obtenerAprobadosHoy(): Promise<number> {
    const query = `
      SELECT COUNT(*) as total
      FROM solicitudes
      WHERE estado_solicitud = 'APROBADA'
        AND updated_at IS NOT NULL
        AND DATE(updated_at) = CURRENT_DATE
        AND deleted_at IS NULL
    `;
    const resultado = await pool.query(query);
    return Number(resultado.rows[0]?.total ?? 0);
  }

  /**
   * Cuenta solicitudes rechazadas en la fecha actual (HOY)
   * Usa: estado_solicitud + updated_at (proxy de fecha_resolucion — no existe en BD desplegada)
   * @private
   */
  private async obtenerRechazadosHoy(): Promise<number> {
    const query = `
      SELECT COUNT(*) as total
      FROM solicitudes
      WHERE estado_solicitud = 'RECHAZADA'
        AND updated_at IS NOT NULL
        AND DATE(updated_at) = CURRENT_DATE
        AND deleted_at IS NULL
    `;
    const resultado = await pool.query(query);
    return Number(resultado.rows[0]?.total ?? 0);
  }

  /**
   * Calcula el tiempo promedio de respuesta (en horas) de solicitudes resueltas
   * Usa: updated_at - fecha_creacion (proxy porque fecha_resolucion no existe en BD desplegada)
   * @private
   */
  private async obtenerTiempoResuestaPromedio(): Promise<number> {
    const query = `
      SELECT AVG(EXTRACT(EPOCH FROM (updated_at - fecha_creacion)) / 3600) as promedio_horas
      FROM solicitudes
      WHERE estado_solicitud IN ('APROBADA', 'RECHAZADA')
        AND updated_at IS NOT NULL
        AND deleted_at IS NULL
    `;
    const resultado = await pool.query(query);
    const promedio = resultado.rows[0]?.promedio_horas;
    return promedio ? Number(promedio) : 0;
  }

  /**
   * Cuenta solicitudes pendientes vencidas (> 3 días sin resolver)
   * Usa: estado_solicitud + fecha_creacion
   * @private
   */
  private async obtenerSolicitudesVencidas(): Promise<number> {
    const query = `
      SELECT COUNT(*) as total
      FROM solicitudes
      WHERE estado_solicitud = 'PENDIENTE'
        AND fecha_creacion < NOW() - INTERVAL '3 days'
        AND deleted_at IS NULL
    `;
    const resultado = await pool.query(query);
    return Number(resultado.rows[0]?.total ?? 0);
  }

  /**
   * Obtiene la distribución de solicitudes por tipo de novedad
   * Tipos: ADICION, ADICION_CURSO, CAMBIO_JORNADA, CAMBIO_CURSO, CURSO_DIRIGIDO
   * Usa: tipo_novedad (columna real en BD, no 'tipo_solicitud')
   * @private
   */
  private async obtenerDistribucionPorTipo(): Promise<DistribucionTipo> {
    const query = `
      SELECT 
        LOWER(tipo_novedad) as tipo,
        COUNT(*) as cantidad
      FROM solicitudes
      WHERE deleted_at IS NULL
      GROUP BY tipo_novedad
    `;
    const resultado = await pool.query(query);

    const distribucion: DistribucionTipo = {
      adicion: 0,
      cambio_jornada: 0,
      cambio_curso: 0,
      curso_dirigido: 0,
    };

    resultado.rows.forEach((fila: { tipo: string; cantidad: string }) => {
      // Mapear del SQL al objeto (quitando prefijo si existe)
      let tipoMapeado = fila.tipo;
      if (tipoMapeado === 'adicion_curso') {
        tipoMapeado = 'adicion'; // Unificar adicion y adicion_curso
      }

      const tipo = tipoMapeado as keyof DistribucionTipo;
      if (tipo in distribucion) {
        distribucion[tipo] = Number(fila.cantidad);
      }
    });

    return distribucion;
  }

  /**
   * Obtiene la distribución de solicitudes por estado
   * Estados: PENDIENTE, EN_REVISION, APROBADA, RECHAZADA
   * Usa: estado_solicitud (columna real en BD)
   * @private
   */
  private async obtenerDistribucionPorEstado(): Promise<DistribucionEstado> {
    const query = `
      SELECT 
        LOWER(estado_solicitud) as estado,
        COUNT(*) as cantidad
      FROM solicitudes
      WHERE deleted_at IS NULL
      GROUP BY estado_solicitud
    `;
    const resultado = await pool.query(query);

    const distribucion: DistribucionEstado = {
      pendiente: 0,
      en_revision: 0,
      aprobada: 0,
      rechazada: 0,
    };

    resultado.rows.forEach((fila: { estado: string; cantidad: string }) => {
      const estado = fila.estado as keyof DistribucionEstado;
      if (estado in distribucion) {
        distribucion[estado] = Number(fila.cantidad);
      }
    });

    return distribucion;
  }

  /**
   * Calcula el período académico actual en formato "YYYY-S"
   * Lógica: enero-junio = semestre 1, julio-diciembre = semestre 2
   * @private
   */
  private obtenerPeriodoActual(): string {
    const ahora = new Date();
    const anio = ahora.getFullYear();
    const mes = ahora.getMonth() + 1;
    const semestre = mes <= 6 ? 1 : 2;
    return `${anio}-${semestre}`;
  }
}




