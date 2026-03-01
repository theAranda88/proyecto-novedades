// src/utils/RespuestaUtil.ts
// Utilidad de respuesta uniforme para toda la API del sistema

import { Response } from 'express';

/**
 * Estructura estándar de todas las respuestas de la API.
 * Garantiza consistencia en el formato de respuesta para el cliente.
 */
export interface IRespuestaEstandar<T = unknown> {
  ok:           boolean;
  mensaje:      string;
  datos:        T | null;
  codigo_estado: number;
}

/**
 * Clase utilitaria que centraliza la construcción y envío de
 * respuestas HTTP uniformes en todos los controladores del sistema.
 *
 * @example
 * // Respuesta exitosa
 * RespuestaUtil.exito(res, 'Login exitoso', { token }, 200);
 *
 * @example
 * // Respuesta de error
 * RespuestaUtil.error(res, 'Credenciales inválidas', 401);
 */
export class RespuestaUtil {

  /**
   * Envía una respuesta HTTP de ÉXITO al cliente.
   * Construye el objeto estándar con ok=true y lo serializa como JSON.
   *
   * @param res           - Objeto Response de Express
   * @param mensaje       - Mensaje descriptivo del resultado exitoso
   * @param datos         - Payload de datos a devolver (puede ser null)
   * @param codigoEstado  - Código HTTP de éxito (default: 200)
   */
  static exito<T>(
    res: Response,
    mensaje: string,
    datos: T | null = null,
    codigoEstado: number = 200,
  ): Response {
    const respuesta: IRespuestaEstandar<T> = {
      ok:            true,
      mensaje,
      datos,
      codigo_estado: codigoEstado,
    };
    return res.status(codigoEstado).json(respuesta);
  }

  /**
   * Envía una respuesta HTTP de ERROR al cliente.
   * Construye el objeto estándar con ok=false y datos=null.
   *
   * @param res          - Objeto Response de Express
   * @param mensaje      - Mensaje descriptivo del error ocurrido
   * @param codigoEstado - Código HTTP de error (default: 400)
   */
  static error(
    res: Response,
    mensaje: string,
    codigoEstado: number = 400,
  ): Response {
    const respuesta: IRespuestaEstandar<null> = {
      ok:            false,
      mensaje,
      datos:         null,
      codigo_estado: codigoEstado,
    };
    return res.status(codigoEstado).json(respuesta);
  }

  /**
   * Construye el objeto de respuesta estándar sin enviarlo.
   * Útil para construir la respuesta manualmente o en pruebas unitarias.
   *
   * @param ok           - Indica si la operación fue exitosa
   * @param mensaje      - Mensaje descriptivo del resultado
   * @param datos        - Datos a incluir en la respuesta
   * @param codigoEstado - Código HTTP correspondiente
   */
  static construir<T>(
    ok: boolean,
    mensaje: string,
    datos: T | null = null,
    codigoEstado: number = 200,
  ): IRespuestaEstandar<T> {
    return { ok, mensaje, datos, codigo_estado: codigoEstado };
  }
}

