// src/middlewares/authMiddleware.ts
// Middlewares de autenticación, autorización y validación de esquemas Zod

import { Request, Response, NextFunction } from 'express';
import jwt                                  from 'jsonwebtoken';
import { ZodSchema }                        from 'zod';
import { RespuestaUtil }                    from '../utils/RespuestaUtil';

/**
 * Roles disponibles en el sistema Proyecto Novedades.
 * Valores en minúscula para coincidir con la columna `rol` de la BD.
 */
export enum RolUsuario {
  ESTUDIANTE = 'estudiante',
  SECRETARIA = 'secretaria',
  ADMIN      = 'admin',
}

/**
 * Payload codificado dentro del token JWT.
 * Incluye primer_login para que el middleware pueda bloquear el acceso
 * si el usuario no ha cambiado su contraseña temporal.
 */
export type PayloadToken = {
  id_usuario:         number;
  nombre_completo:    string;
  rol:                RolUsuario;
  codigo_estudiantil: string | null;   // null para SECRETARIA y ADMIN
  primer_login:       boolean;
  iat?:               number;
  exp?:               number;
};

// Extensión del tipo Request de Express
declare global {
  namespace Express {
    interface Request {
      usuario?: PayloadToken;
    }
  }
}

/**
 * Middleware de validación de esquema con Zod.
 * Valida req.body antes de llegar al controlador.
 * Responde HTTP 422 si hay errores de validación.
 *
 * @param esquema - Esquema Zod contra el que se valida req.body
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

    req.body = resultado.data;
    next();
  };
};

/**
 * Middleware de autenticación JWT.
 * Verifica el token Bearer. Si primer_login = true bloquea el acceso
 * con HTTP 403 hasta que el usuario cambie su contraseña.
 *
 * @seguridad HTTP 401 — Token ausente o inválido
 * @seguridad HTTP 403 — Token expirado
 * @seguridad HTTP 403 — primer_login = true (contraseña temporal sin cambiar)
 */
export const verificarToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const encabezadoAutorizacion = req.headers['authorization'];
  const token = encabezadoAutorizacion?.split(' ')[1];

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
    const payload = jwt.verify(token, secreto) as PayloadToken;

    // Bloquear acceso si el usuario no ha cambiado su contraseña temporal
    if (payload.primer_login === true) {
      RespuestaUtil.error(
        res,
        'Debe cambiar su contraseña temporal antes de continuar. Use POST /api/auth/change-password',
        403,
      );
      return;
    }

    req.usuario = payload;
    next();
  } catch (error) {
    const esExpirado = (error as Error).name === 'TokenExpiredError';
    RespuestaUtil.error(
      res,
      esExpirado
        ? 'El token de sesión ha expirado. Inicie sesión nuevamente'
        : 'Token de autenticación inválido',
      esExpirado ? 403 : 401,
    );
  }
};

/**
 * Middleware de autenticación para el endpoint change-password.
 * Igual que verificarToken pero NO bloquea si primer_login = true,
 * ya que ese endpoint es precisamente para el cambio de contraseña.
 *
 * @seguridad HTTP 401 — Token ausente o inválido
 * @seguridad HTTP 403 — Token expirado
 */
export const verificarTokenCambioPassword = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const encabezadoAutorizacion = req.headers['authorization'];
  const token = encabezadoAutorizacion?.split(' ')[1];

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
      esExpirado
        ? 'El token de sesión ha expirado. Inicie sesión nuevamente'
        : 'Token de autenticación inválido',
      esExpirado ? 403 : 401,
    );
  }
};

/**
 * Middleware de autorización por rol.
 * Debe usarse después de verificarToken. Verifica que el usuario
 * tenga alguno de los roles permitidos para el recurso.
 *
 * @param rolesPermitidos - Roles con acceso al endpoint
 * @seguridad HTTP 403 — Rol sin permisos
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
        `Acceso denegado. Roles permitidos: ${rolesPermitidos.join(', ')}`,
        403,
      );
      return;
    }

    next();
  };
};
