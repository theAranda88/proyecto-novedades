// src/middlewares/errorHandler.ts
// Middleware global de manejo de errores no capturados

import { Request, Response, NextFunction } from 'express';
import { RespuestaUtil }                    from '../utils/RespuestaUtil';

/**
 * Clase de error de negocio personalizada para el sistema.
 * Permite lanzar errores controlados desde los servicios con
 * un código HTTP específico que el errorHandler usará en la respuesta.
 *
 * @example
 * throw new ErrorNegocio('El estudiante no tiene matrícula activa', 400);
 */
export class ErrorNegocio extends Error {
  constructor(
    public readonly mensaje: string,
    public readonly codigoHttp: number = 400,
  ) {
    super(mensaje);
    this.name = 'ErrorNegocio';
  }
}

/**
 * Clase de error de base de datos para el sistema.
 * Se usa en los repositorios cuando ocurre un fallo en las queries.
 */
export class ErrorBaseDatos extends Error {
  constructor(public readonly mensaje: string) {
    super(mensaje);
    this.name    = 'ErrorBaseDatos';
    this.message = mensaje;
  }
}

/**
 * Middleware global de manejo de errores de Express.
 * Captura cualquier excepción no manejada que haya sido pasada
 * mediante next(error) desde controladores o servicios.
 * Usa RespuestaUtil para devolver siempre el formato estándar.
 *
 * Tipos de error manejados:
 * - ErrorNegocio    → usa el codigoHttp definido en el error
 * - ErrorBaseDatos  → responde HTTP 500
 * - Error genérico  → responde HTTP 500 con mensaje genérico en producción
 *
 * @param error   - El error capturado
 * @param req     - Objeto Request de Express
 * @param res     - Objeto Response de Express
 * @param next    - Función next (requerida por Express para reconocer el middleware)
 */
export const manejadorErroresGlobal = (
  error: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void => {
  console.error(`[ERROR] ${new Date().toISOString()} — ${req.method} ${req.path}`);
  console.error(error);

  // Error de negocio controlado lanzado desde los servicios
  if (error instanceof ErrorNegocio) {
    RespuestaUtil.error(res, error.mensaje, error.codigoHttp);
    return;
  }

  // Error de base de datos
  if (error instanceof ErrorBaseDatos) {
    RespuestaUtil.error(res, 'Error interno al acceder a la base de datos', 500);
    return;
  }

  // Error genérico no controlado — ocultar detalles en producción
  const mensajePublico =
    process.env.NODE_ENV === 'production'
      ? 'Ha ocurrido un error interno en el servidor'
      : error.message;

  RespuestaUtil.error(res, mensajePublico, 500);
};

