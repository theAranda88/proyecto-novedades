// src/controllers/AuthController.ts
// Controlador HTTP para autenticación — Implementa HU_001 completa

import { Request, Response, NextFunction } from 'express';
import { ServicioAutenticacion }            from '../services/AutenticadorService';
import { RespuestaUtil }                    from '../utils/RespuestaUtil';
import { TDatosLogin, TDatosCambioPassword } from '../schemas/auth.schema';

/**
 * Controlador que maneja las peticiones HTTP relacionadas
 * con la autenticación de usuarios en el sistema.
 *
 * Responsabilidades:
 * - Recibir la Request con los datos ya validados por Zod
 * - Delegar la lógica de negocio al ServicioAutenticacion
 * - Devolver la Response usando RespuestaUtil (formato uniforme)
 * - Pasar los errores no controlados al manejador global via next()
 */
export class ControladorAutenticacion {

  private readonly servicioAutenticacion: ServicioAutenticacion;

  constructor() {
    this.servicioAutenticacion = new ServicioAutenticacion();
    this.login           = this.login.bind(this);
    this.cambiarPassword = this.cambiarPassword.bind(this);
    this.olvidoPassword  = this.olvidoPassword.bind(this);
  }

  /**
   * POST /api/auth/login
   * Autentica con codigo_estudiantil + password.
   * Si primer_login = TRUE devuelve el token con la flag para forzar
   * el cambio de contraseña antes de acceder al sistema.
   *
   * @seguridad Rate limit: 10 intentos por IP cada 15 minutos
   * @seguridad Bloqueo de cuenta: 5 intentos fallidos = 15 min bloqueado (HU_001 §CA-04)
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const datos    = req.body as TDatosLogin;
      const resultado = await this.servicioAutenticacion.iniciarSesion(datos);

      const mensaje = resultado.primer_login
        ? `Bienvenido. Debe cambiar su contraseña temporal antes de continuar`
        : `Bienvenido, ${resultado.nombre_completo}. Sesión iniciada correctamente`;

      RespuestaUtil.exito(res, mensaje, resultado, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/change-password
   * Cambia la contraseña temporal. Solo disponible cuando primer_login = TRUE.
   * Al completar, emite un nuevo JWT con primer_login = FALSE.
   * Requiere el token temporal (con primer_login = true) en el header.
   *
   * @seguridad HU_001 §CA-03 — Cambio obligatorio de contraseña en primer acceso
   */
  async cambiarPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const datos     = req.body as TDatosCambioPassword;
      const idUsuario = req.usuario!.id_usuario;
      const resultado = await this.servicioAutenticacion.cambiarContrasena(idUsuario, datos);

      RespuestaUtil.exito(
        res,
        'Contraseña actualizada exitosamente. Puede acceder al sistema con su nueva contraseña',
        resultado,
        200,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Inicia el flujo de recuperación de contraseña.
   * El sistema simula el envío de un código al correo institucional.
   * (HU_001 §CA-05)
   */
  async olvidoPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Respuesta genérica independiente de si el código existe (no revelar info)
      RespuestaUtil.exito(
        res,
        'Si el código estudiantil existe, recibirá un correo con instrucciones para restablecer su contraseña',
        null,
        200,
      );
    } catch (error) {
      next(error);
    }
  }
}
