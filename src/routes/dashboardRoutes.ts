// src/routes/dashboardRoutes.ts
// Rutas para el Dashboard de Secretaría — Métricas y KPIs

import { Router } from 'express';
import { ControladorDashboard } from '../controllers/DashboardController';
import { verificarToken, verificarRol, RolUsuario } from '../middlewares/authMiddleware';

const enrutadorDashboard = Router();
const controladorDashboard = new ControladorDashboard();

/**
 * @swagger
 * /api/dashboard/secretaria:
 *   get:
 *     summary: Obtener métricas del dashboard de Secretaría
 *     description: |
 *       Retorna las métricas consolidadas para el panel de Secretaría.
 *       Incluye:
 *       - Total de solicitudes pendientes
 *       - Solicitudes aprobadas hoy
 *       - Solicitudes rechazadas hoy
 *       - Tiempo promedio de respuesta (en horas)
 *       - Solicitudes vencidas (pendientes > 3 días)
 *       - Distribución por tipo de solicitud
 *       - Distribución por estado
 *       - Período académico actual
 *
 *       Solo SECRETARIA y ADMIN pueden acceder.
 *     tags:
 *       - Dashboard
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Métricas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 mensaje:
 *                   type: string
 *                   example: "Métricas del dashboard obtenidas correctamente"
 *                 datos:
 *                   type: object
 *                   properties:
 *                     total_pendientes:
 *                       type: integer
 *                       example: 42
 *                     aprobadas_hoy:
 *                       type: integer
 *                       example: 128
 *                     rechazadas_hoy:
 *                       type: integer
 *                       example: 5
 *                     tiempo_respuesta_promedio:
 *                       type: number
 *                       format: float
 *                       description: Tiempo en horas
 *                       example: 33.6
 *                     solicitudes_vencidas:
 *                       type: integer
 *                       example: 8
 *                     distribucion_por_tipo:
 *                       type: object
 *                       properties:
 *                         cambio_curso:
 *                           type: integer
 *                           example: 45
 *                         cambio_jornada:
 *                           type: integer
 *                           example: 12
 *                         adicion_curso:
 *                           type: integer
 *                           example: 78
 *                         curso_dirigido:
 *                           type: integer
 *                           example: 23
 *                     distribucion_por_estado:
 *                       type: object
 *                       properties:
 *                         pendiente:
 *                           type: integer
 *                           example: 42
 *                         en_revision:
 *                           type: integer
 *                           example: 15
 *                         aprobada:
 *                           type: integer
 *                           example: 89
 *                         rechazada:
 *                           type: integer
 *                           example: 12
 *                     periodo_academico_actual:
 *                       type: string
 *                       example: "2026-1"
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado (requiere rol SECRETARIA o ADMIN)
 *       500:
 *         description: Error interno del servidor
 */
enrutadorDashboard.get(
  '/secretaria',
  verificarToken,
  verificarRol(RolUsuario.SECRETARIA, RolUsuario.ADMIN),
  controladorDashboard.obtenerMetricas,
);

export default enrutadorDashboard;



