// src/controllers/AuthController.ts
// Controlador HTTP para los endpoints de autenticación

import { Request, Response, NextFunction } from 'express';
import { ServicioAutenticacion }            from '../services/AutenticadorService';
import { RespuestaUtil }                    from '../utils/RespuestaUtil';
import { TDatosLogin }                      from '../schemas/auth.schema';

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
    // Bind necesario para mantener el contexto 'this' en Express
    this.login = this.login.bind(this);
  }

  /**
   * Maneja el endpoint POST /api/auth/login.
   * El body ya fue validado por el middleware validarEsquema(esquemaLogin).
   *
   * Flujo:
   * 1. Extrae los datos validados del body
   * 2. Invoca ServicioAutenticacion.iniciarSesion()
   * 3. Devuelve el token JWT usando RespuestaUtil.exito() con HTTP 200
   * 4. Ante cualquier error lo pasa al manejadorErroresGlobal via next()
   *
   * @param req  - Request con body tipado como TDatosLogin
   * @param res  - Response de Express
   * @param next - Función next para pasar errores al manejador global
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const datosLogin = req.body as TDatosLogin;

      const resultado = await this.servicioAutenticacion.iniciarSesion(datosLogin);

      RespuestaUtil.exito(
        res,
        `Bienvenido, ${resultado.nombre_completo}. Sesión iniciada correctamente`,
        resultado,
        200,
      );
    } catch (error) {
      next(error);
    }
  }
}

