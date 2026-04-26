// src/controllers/DashboardController.ts
// Controlador HTTP para endpoints del Dashboard de Secretaría

import { Request, Response, NextFunction } from 'express';
import { ServicioDashboard, MetricasDashboard } from '../services/DashboardService';
import { RespuestaUtil } from '../utils/RespuestaUtil';

export class ControladorDashboard {

  private readonly servicioDashboard: ServicioDashboard;

  constructor() {
    this.servicioDashboard = new ServicioDashboard();
    this.obtenerMetricas = this.obtenerMetricas.bind(this);
  }

  /**
   * GET /api/dashboard/secretaria
   * Retorna las métricas consolidadas para el dashboard de Secretaría.
   * Incluye: total pendientes, aprobadas hoy, tiempo promedio, distribuuciones por tipo/estado
   *
   * Solo accesible por SECRETARIA y ADMIN
   * No requiere parámetros de query
   *
   * @acceso SECRETARIA, ADMIN
   */
  async obtenerMetricas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usuario = req.usuario!;

      // Nota: El middleware de autenticación ya verificó que el rol es válido
      // pero podemos hacer una validación adicional si lo deseamos

      const metricas: MetricasDashboard = await this.servicioDashboard.obtenerMetricasDashboard();

      RespuestaUtil.exito(
        res,
        'Métricas del dashboard obtenidas correctamente',
        metricas,
        200,
      );
    } catch (error) {
      next(error);
    }
  }
}

