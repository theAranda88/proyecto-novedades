// src/middlewares/errorHandler.ts
// Middleware global de manejo de errores no capturados

import { Request, Response, NextFunction } from 'express';
import { RespuestaUtil }                    from '../utils/RespuestaUtil';

/**
 * Error de negocio controlado. Se lanza desde los servicios
 * con un código HTTP específico para el cliente.
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
 * Error de autenticación. Cubre 401 (sin token/inválido),
 * 403 (expirado/primer_login) y 423 (cuenta bloqueada).
 */
export class ErrorAutenticacion extends Error {
  constructor(
    public readonly mensaje: string,
    public readonly codigoHttp: 401 | 403 | 423 = 401,
  ) {
    super(mensaje);
    this.name = 'ErrorAutenticacion';
  }
}

/**
 * Error de base de datos para fallos en queries SQL.
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
 * Captura cualquier excepción pasada via next(error).
 * Siempre responde usando el formato estándar de RespuestaUtil.
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

  if (error instanceof ErrorNegocio) {
    RespuestaUtil.error(res, error.mensaje, error.codigoHttp);
    return;
  }

  if (error instanceof ErrorAutenticacion) {
    RespuestaUtil.error(res, error.mensaje, error.codigoHttp);
    return;
  }

  if (error instanceof ErrorBaseDatos) {
    RespuestaUtil.error(res, 'Error interno al acceder a la base de datos', 500);
    return;
  }

  const mensajePublico =
    process.env.NODE_ENV === 'production'
      ? 'Ha ocurrido un error interno en el servidor'
      : error.message;

  RespuestaUtil.error(res, mensajePublico, 500);
};
