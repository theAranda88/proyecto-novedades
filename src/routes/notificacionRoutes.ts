// src/routes/notificacionRoutes.ts
// Rutas para gestión de notificaciones híbridas (WebSocket + FCM + BD)

import express, { Request, Response, NextFunction } from 'express';
import { verificarToken } from '../middlewares/authMiddleware';
import { ServicioNotificacion } from '../services/NotificacionService';
import { RepositorioNotificacion } from '../repositories/notificacion.repository';
import { RespuestaUtil } from '../utils/RespuestaUtil';
import { ErrorNegocio } from '../middlewares/errorHandler';

const enrutador = express.Router();
const servicio = new ServicioNotificacion();
const repositorio = new RepositorioNotificacion();

/**
 * @swagger
 * /api/notificaciones:
 *   get:
 *     summary: Obtener notificaciones del usuario
 *     description: |
 *       Obtiene todas las notificaciones del usuario autenticado con paginación.
 *       Requiere JWT válido en header Authorization.
 *     tags:
 *       - Notificaciones
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pagina
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numero de pagina (comienza en 1)
 *       - in: query
 *         name: tamanio
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Registros por pagina (maximo 50)
 *     responses:
 *       200:
 *         description: Notificaciones obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 mensaje:
 *                   type: string
 *                 datos:
 *                   type: object
 *                   properties:
 *                     datos:
 *                       type: array
 *                     total:
 *                       type: integer
 *                     pagina:
 *                       type: integer
 *                     tamanio:
 *                       type: integer
 *       401:
 *         description: Token JWT invalido o expirado
 */
enrutador.get(
  '/',
  verificarToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usuarioId = req.usuario?.id_usuario;
      if (!usuarioId) {
        throw new ErrorNegocio('ID de usuario no encontrado');
      }

      const pagina = Math.max(1, parseInt(req.query.pagina as string) || 1);
      const tamanio = Math.min(50, Math.max(1, parseInt(req.query.tamanio as string) || 10));

      const { datos, total } = await servicio.obtenerPorUsuario(usuarioId, pagina, tamanio);

      const respuesta = {
        datos,
        total,
        pagina,
        tamanio,
        total_paginas: Math.ceil(total / tamanio),
      };

      res.json(RespuestaUtil.exito(res, 'Notificaciones obtenidas correctamente', respuesta));
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/notificaciones/no-leidas:
 *   get:
 *     summary: Obtener notificaciones no leidas
 *     description: |
 *       Obtiene las ultimas 20 notificaciones no leidas del usuario.
 *       Requiere JWT valido.
 *     tags:
 *       - Notificaciones
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de notificaciones no leidas
 *       401:
 *         description: Token JWT invalido o expirado
 */
enrutador.get(
  '/no-leidas',
  verificarToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usuarioId = req.usuario?.id_usuario;
      if (!usuarioId) {
        throw new ErrorNegocio('ID de usuario no encontrado');
      }

      const notificaciones = await servicio.obtenerNoLeidas(usuarioId);

      res.json(RespuestaUtil.exito(res, 'Notificaciones no leidas obtenidas', notificaciones));
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/notificaciones/estadisticas:
 *   get:
 *     summary: Obtener estadisticas de notificaciones
 *     description: |
 *       Obtiene el contador de notificaciones no leidas agrupadas por tipo.
 *       Requiere JWT valido.
 *     tags:
 *       - Notificaciones
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Estadisticas de notificaciones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 datos:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     por_tipo:
 *                       type: object
 */
enrutador.get(
  '/estadisticas',
  verificarToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usuarioId = req.usuario?.id_usuario;
      if (!usuarioId) {
        throw new ErrorNegocio('ID de usuario no encontrado');
      }

      const estadisticas = await servicio.obtenerEstadisticas(usuarioId);

      res.json(RespuestaUtil.exito(res, 'Estadisticas obtenidas', estadisticas));
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/notificaciones/{id}/leer:
 *   patch:
 *     summary: Marcar notificacion como leida
 *     description: |
 *       Marca una notificacion especifica como leida.
 *       Requiere JWT valido.
 *     tags:
 *       - Notificaciones
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la notificacion
 *     responses:
 *       200:
 *         description: Notificacion marcada como leida
 *       400:
 *         description: ID invalido
 */
enrutador.patch(
  '/:id/leer',
  verificarToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notificacionId = parseInt(req.params.id as string);

      if (isNaN(notificacionId)) {
        throw new ErrorNegocio('ID de notificacion invalido');
      }

      await servicio.marcarComoLeida(notificacionId);

      res.json(
        RespuestaUtil.exito(res, 'Notificacion marcada como leida', { id: notificacionId }),
      );
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/notificaciones/marcar-todas-leidas:
 *   patch:
 *     summary: Marcar todas las notificaciones como leidas
 *     description: |
 *       Marca todas las notificaciones no leidas del usuario como leidas.
 *       Requiere JWT valido.
 *     tags:
 *       - Notificaciones
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Operacion completada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 datos:
 *                   type: object
 *                   properties:
 *                     cantidad_marcadas:
 *                       type: integer
 */
enrutador.patch(
  '/marcar-todas-leidas',
  verificarToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usuarioId = req.usuario?.id_usuario;
      if (!usuarioId) {
        throw new ErrorNegocio('ID de usuario no encontrado');
      }

      const cantidad = await servicio.marcarTodasComoLeidas(usuarioId);

      res.json(
        RespuestaUtil.exito(
          res,
          `${cantidad} notificaciones marcadas como leidas`,
          { cantidad_marcadas: cantidad },
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/notificaciones/dispositivos/registrar:
 *   post:
 *     summary: Registrar dispositivo para notificaciones push
 *     description: |
 *       Registra un device token para envio de notificaciones push via FCM.
 *       Se envía desde cliente movil (Flutter) o web.
 *       Requiere JWT valido.
 *     tags:
 *       - Notificaciones
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - device_token
 *               - plataforma
 *             properties:
 *               device_token:
 *                 type: string
 *                 description: Token FCM del dispositivo
 *               plataforma:
 *                 type: string
 *                 enum: [web, ios, android]
 *                 description: Plataforma del dispositivo
 *               metadata:
 *                 type: object
 *                 description: Informacion adicional (navegador, SO, version)
 *     responses:
 *       201:
 *         description: Dispositivo registrado exitosamente
 *       400:
 *         description: Datos invalidos o incompletos
 */
enrutador.post(
  '/dispositivos/registrar',
  verificarToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usuarioId = req.usuario?.id_usuario;
      if (!usuarioId) {
        throw new ErrorNegocio('ID de usuario no encontrado');
      }

      const { device_token, plataforma, metadata } = req.body;

      if (!device_token || !plataforma) {
        throw new ErrorNegocio('device_token y plataforma son requeridos');
      }

      if (!['web', 'ios', 'android'].includes(plataforma)) {
        throw new ErrorNegocio('plataforma debe ser: web, ios o android');
      }

      const dispositivo_id = await repositorio.registrarDispositivo({
        usuario_id: usuarioId,
        device_token,
        plataforma: plataforma as 'web' | 'ios' | 'android',
        metadata,
      });

      res.status(201).json(
        RespuestaUtil.exito(
          res,
          'Dispositivo registrado exitosamente',
          { dispositivo_id },
          201,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/notificaciones/dispositivos:
 *   get:
 *     summary: Obtener dispositivos registrados
 *     description: |
 *       Obtiene todos los dispositivos push registrados del usuario.
 *       Requiere JWT valido.
 *     tags:
 *       - Notificaciones
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de dispositivos obtenidos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 datos:
 *                   type: array
 */
enrutador.get(
  '/dispositivos',
  verificarToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usuarioId = req.usuario?.id_usuario;
      if (!usuarioId) {
        throw new ErrorNegocio('ID de usuario no encontrado');
      }

      const dispositivos = await repositorio.obtenerDispositivosActivos(usuarioId);

      res.json(
        RespuestaUtil.exito(res, 'Dispositivos obtenidos', dispositivos),
      );
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/notificaciones/dispositivos/{id}/desactivar:
 *   delete:
 *     summary: Desactivar dispositivo
 *     description: |
 *       Desactiva un dispositivo para dejar de recibir notificaciones push.
 *       Requiere JWT valido.
 *     tags:
 *       - Notificaciones
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del dispositivo
 *     responses:
 *       200:
 *         description: Dispositivo desactivado exitosamente
 *       400:
 *         description: ID invalido
 */
enrutador.delete(
  '/dispositivos/:id/desactivar',
  verificarToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dispositivoId = parseInt(req.params.id as string);

      if (isNaN(dispositivoId)) {
        throw new ErrorNegocio('ID de dispositivo invalido');
      }

      await repositorio.desactivarDispositivo(dispositivoId);

      res.json(
        RespuestaUtil.exito(res, 'Dispositivo desactivado', { id: dispositivoId }),
      );
    } catch (error) {
      next(error);
    }
  },
);

export default enrutador;






