// src/middlewares/authMiddleware.ts
// Middlewares de autenticación, autorización y validación de esquemas Zod

import { Request, Response, NextFunction } from 'express';
import jwt                                  from 'jsonwebtoken';
import { ZodSchema }                        from 'zod';
import { RespuestaUtil }                    from '../utils/RespuestaUtil';

/**
 * Roles disponibles en el sistema Proyecto Novedades.
 * Controla el acceso a los diferentes endpoints de la API.
 */
export enum RolUsuario {
  ESTUDIANTE = 'ESTUDIANTE',
  SECRETARIA = 'SECRETARIA',
  ADMIN      = 'ADMIN',
}

/**
 * Tipo del payload codificado dentro del token JWT.
 * Solo contiene los datos mínimos para identificar al usuario y su rol.
 */
export type PayloadToken = {
  id_usuario:      number;
  nombre_completo: string;
  rol:             RolUsuario;
  cod_alumno:      string | null;
  iat?:            number;
  exp?:            number;
};

// Extensión del tipo Request de Express para adjuntar el usuario autenticado
declare global {
  namespace Express {
    interface Request {
      usuario?: PayloadToken;
    }
  }
}

/**
 * Middleware de validación de esquema con Zod.
 * Intercepta la petición antes del controlador y valida el body
 * contra el esquema proporcionado. Si hay errores de validación,
 * responde con HTTP 422 usando RespuestaUtil sin llegar al controlador.
 *
 * @param esquema - Esquema Zod contra el que se valida req.body
 * @returns Middleware de Express listo para usar en la ruta
 */
export const validarEsquema = (esquema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const resultado = esquema.safeParse(req.body);

    if (!resultado.success) {
      const mensajesError = resultado.error.issues
        .map((e) => `${e.path.map(String).join('.')}: ${e.message}`)
        .join(' | ');

      RespuestaUtil.error(res, `Datos de entrada inválidos: ${mensajesError}`, 422);
      return;
    }

    // Reemplaza el body con los datos ya validados y tipados por Zod
    req.body = resultado.data;
    next();
  };
};

/**
 * Middleware de autenticación JWT.
 * Verifica que la petición incluya un token Bearer válido en el header
 * Authorization. Si el token es válido, adjunta el payload decodificado
 * en req.usuario para que los controladores puedan acceder a él.
 *
 * @seguridad HTTP 401 — Token ausente o formato incorrecto
 * @seguridad HTTP 401 — Token con firma inválida
 * @seguridad HTTP 403 — Token expirado
 */
export const verificarToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const encabezadoAutorizacion = req.headers['authorization'];
  const token = encabezadoAutorizacion?.split(' ')[1]; // Formato: Bearer <token>

  if (!token) {
    RespuestaUtil.error(res, 'Token de autenticación no proporcionado', 401);
    return;
  }

  const secreto = process.env.JWT_SECRET;
  if (!secreto) {
    RespuestaUtil.error(res, 'Error de configuración del servidor', 500);
    return;
  }

  try {
    req.usuario = jwt.verify(token, secreto) as PayloadToken;
    next();
  } catch (error) {
    const esExpirado = (error as Error).name === 'TokenExpiredError';
    RespuestaUtil.error(
      res,
      esExpirado ? 'El token de sesión ha expirado. Inicie sesión nuevamente' : 'Token de autenticación inválido',
      esExpirado ? 403 : 401,
    );
  }
};

/**
 * Middleware de autorización por rol.
 * Debe usarse después de verificarToken. Comprueba que el usuario
 * autenticado tenga alguno de los roles permitidos para acceder
 * al recurso solicitado.
 *
 * @param rolesPermitidos - Lista de roles con acceso al endpoint
 * @returns Middleware de Express listo para usar en la ruta
 * @seguridad HTTP 403 — El rol del usuario no tiene permiso
 */
export const verificarRol = (...rolesPermitidos: RolUsuario[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const usuario = req.usuario;

    if (!usuario) {
      RespuestaUtil.error(res, 'Usuario no autenticado', 401);
      return;
    }

    if (!rolesPermitidos.includes(usuario.rol)) {
      RespuestaUtil.error(
        res,
        `Acceso denegado. Se requiere el rol: ${rolesPermitidos.join(' o ')}`,
        403,
      );
      return;
    }

    next();
  };
};

