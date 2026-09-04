// src/services/AutenticadorService.ts
// Lógica de negocio para autenticación. Implementa HU_001 + login Google institucional.

import bcrypt                                 from 'bcrypt';
import jwt                                    from 'jsonwebtoken';
import { OAuth2Client }                       from 'google-auth-library';
import { RepositorioUsuario }                 from '../repositories/usuario.repository';
import { RolUsuario, PayloadToken }           from '../middlewares/authMiddleware';
import { TDatosLogin, TDatosCambioPassword }  from '../schemas/auth.schema';
import { ErrorNegocio, ErrorAutenticacion }   from '../middlewares/errorHandler';
import { pool }                               from '../config/database';

const COSTO_BCRYPT = Number(process.env.BCRYPT_COST ?? 12);
const MAX_INTENTOS = 5;
const MENSAJE_CREDENCIALES = 'Credenciales incorrectas. Verifique su correo y contraseña';

type FilaUsuarioSesion = {
  id:                  number;
  nombre_completo:     string;
  codigo_estudiantil:  string;
  email_institucional: string;
  password_hash:       string;
  rol:                 string;
  primer_login:        boolean;
  intentos_fallidos:   number;
  bloqueado_hasta:     Date | null;
  ultimo_login:        Date | null;
  activo:              boolean;
  deleted_at:          Date | null;
  google_sub:          string | null;
};

type ResultadoLogin = {
  token:              string;
  id_usuario:         number;
  nombre_completo:    string;
  rol:                string;
  primer_login:       boolean;
  codigo_estudiantil: string;
  expira_en:          string;
};

type ResultadoCambioPassword = {
  token:           string;
  nombre_completo: string;
  rol:             string;
  expira_en:       string;
};

type IdentidadGoogle = {
  correo:        string;
  googleSub:     string;
  dominioGoogle: string | undefined;
};

export class ServicioAutenticacion {

  private readonly repoUsuario: RepositorioUsuario;
  private clienteGoogle: OAuth2Client | null = null;

  constructor() {
    this.repoUsuario = new RepositorioUsuario();
  }

  /**
   * Autentica a un usuario con su correo institucional y contraseña.
   * Implementa el flujo HU_001: bloqueo 423, bcrypt, matrícula, primer_login.
   *
   * @param datosLogin - Correo y contraseña validados por Zod
   * @returns {Promise<ResultadoLogin>} Token JWT y datos del usuario
   * @throws {ErrorAutenticacion} HTTP 401 — Credenciales incorrectas
   * @throws {ErrorAutenticacion} HTTP 423 — Cuenta bloqueada
   * @throws {ErrorNegocio} HTTP 403 — Cuenta o matrícula inactiva
   */
  async iniciarSesion(datosLogin: TDatosLogin): Promise<ResultadoLogin> {
    const usuario = await this.repoUsuario.buscarPorCorreo(datosLogin.correo);

    if (!usuario) {
      throw new ErrorAutenticacion(MENSAJE_CREDENCIALES, 401);
    }

    this.verificarBloqueoCuenta(usuario);

    const contrasenaValida = await bcrypt.compare(datosLogin.password, usuario.password_hash);

    if (!contrasenaValida) {
      await this.repoUsuario.registrarIntentoFallido(usuario.id, usuario.intentos_fallidos);
      const intentosRestantes = MAX_INTENTOS - (usuario.intentos_fallidos + 1);
      if (intentosRestantes <= 0) {
        throw new ErrorAutenticacion(
          'Credenciales incorrectas. Cuenta bloqueada por 15 minutos por exceder intentos',
          423,
        );
      }
      throw new ErrorAutenticacion(
        `Credenciales incorrectas. Intentos restantes: ${intentosRestantes}`,
        401,
      );
    }

    return this.completarInicioSesion(usuario, { completarPrimerLogin: false });
  }

  /**
   * Autentica con un ID token de Google (Workspace @uniautonoma.edu.co).
   * No crea usuarios: el correo debe existir previamente en `usuarios`.
   * Google verifica la identidad; no se compara bcrypt.
   *
   * @param idToken - JWT emitido por Google Identity Services
   * @returns {Promise<ResultadoLogin>} Token JWT interno del sistema
   * @throws {ErrorAutenticacion} HTTP 401 — Token inválido o usuario inexistente
   * @throws {ErrorAutenticacion} HTTP 403 — Dominio no institucional
   * @throws {ErrorAutenticacion} HTTP 423 — Cuenta bloqueada
   */
  async iniciarSesionConGoogle(idToken: string): Promise<ResultadoLogin> {
    const identidad = await this.verificarIdTokenGoogle(idToken);
    this.verificarDominioInstitucional(identidad.correo, identidad.dominioGoogle);

    const usuarioPorSub = await this.repoUsuario.buscarPorGoogleSub(identidad.googleSub);
    const usuarioPorCorreo = await this.repoUsuario.buscarPorCorreo(identidad.correo);
    const usuario = usuarioPorSub ?? usuarioPorCorreo;

    if (!usuario) {
      throw new ErrorAutenticacion(MENSAJE_CREDENCIALES, 401);
    }

    if (usuarioPorSub && usuarioPorCorreo && usuarioPorSub.id !== usuarioPorCorreo.id) {
      throw new ErrorAutenticacion(MENSAJE_CREDENCIALES, 401);
    }

    if (usuarioPorSub && usuario.email_institucional.toLowerCase() !== identidad.correo) {
      throw new ErrorAutenticacion(MENSAJE_CREDENCIALES, 401);
    }

    if (!usuario.google_sub) {
      await this.repoUsuario.vincularGoogleSub(usuario.id, identidad.googleSub);
    }

    return this.completarInicioSesion(usuario, { completarPrimerLogin: true });
  }

  /**
   * Cambia la contraseña de un usuario. Solo válido cuando primer_login = TRUE.
   * Implementa el flujo de cambio obligatorio de contraseña temporal (HU_001 §CA-03).
   *
   * @param idUsuario   - ID del usuario del payload del token temporal
   * @param datos       - Contraseña actual y nueva, validadas por Zod
   * @returns {Promise<ResultadoCambioPassword>} Nuevo token con acceso completo
   * @throws {ErrorNegocio} HTTP 403 — Ya cambió la contraseña o contraseña actual incorrecta
   */
  async cambiarContrasena(
    idUsuario: number,
    datos:     TDatosCambioPassword,
  ): Promise<ResultadoCambioPassword> {
    const usuario = await this.repoUsuario.buscarPorCodigo(
      await this.obtenerCodigoPorId(idUsuario),
    );

    if (!usuario) {
      throw new ErrorNegocio('Usuario no encontrado', 404);
    }

    if (!usuario.primer_login) {
      throw new ErrorNegocio(
        'Esta acción solo está disponible en el primer acceso al sistema',
        403,
      );
    }

    const contrasenaActualValida = await bcrypt.compare(datos.password_actual, usuario.password_hash);
    if (!contrasenaActualValida) {
      throw new ErrorNegocio('La contraseña actual no es correcta', 400);
    }

    if (datos.password_actual === datos.password_nueva) {
      throw new ErrorNegocio(
        'La nueva contraseña no puede ser igual a la contraseña temporal',
        400,
      );
    }

    const nuevoHash = await bcrypt.hash(datos.password_nueva, COSTO_BCRYPT);
    await this.repoUsuario.actualizarPassword(usuario.id, nuevoHash);

    const secreto    = process.env.JWT_SECRET!;
    const expiracion = (process.env.JWT_EXPIRES_IN ?? '8h') as string;

    const payload: Omit<PayloadToken, 'iat' | 'exp'> = {
      id_usuario:         usuario.id,
      nombre_completo:    usuario.nombre_completo,
      rol:                usuario.rol as RolUsuario,
      codigo_estudiantil: usuario.codigo_estudiantil,
      primer_login:       false,
    };

    const token = jwt.sign(payload, secreto, { expiresIn: expiracion } as object);

    return {
      token,
      nombre_completo: usuario.nombre_completo,
      rol:             usuario.rol,
      expira_en:       expiracion,
    };
  }

  /**
   * Pipeline común tras resolver al usuario: bloqueo, activo, matrícula, JWT y auditoría.
   *
   * @param usuario - Fila de usuarios ya autenticada
   * @param opciones.completarPrimerLogin - true en Google (identidad verificada por Google)
   */
  private async completarInicioSesion(
    usuario: FilaUsuarioSesion,
    opciones: { completarPrimerLogin: boolean },
  ): Promise<ResultadoLogin> {
    this.verificarBloqueoCuenta(usuario);

    if (!usuario.activo) {
      throw new ErrorNegocio('Su cuenta no está activa. Contacte al administrador del sistema', 403);
    }

    if (usuario.rol === RolUsuario.ESTUDIANTE) {
      const perfil = await this.repoUsuario.buscarEstudiantePorUsuarioId(usuario.id);
      if (!perfil?.matricula_activa) {
        throw new ErrorNegocio(
          'Su matrícula no está activa para el periodo actual. Contacte a la coordinación académica',
          403,
        );
      }
    }

    let primerLogin = usuario.primer_login;
    if (opciones.completarPrimerLogin && primerLogin) {
      await this.repoUsuario.marcarPrimerLoginCompletado(usuario.id);
      primerLogin = false;
    }

    const secreto = process.env.JWT_SECRET;
    if (!secreto) {
      throw new ErrorNegocio('Error de configuración del servidor', 500);
    }

    const expiracion = (process.env.JWT_EXPIRES_IN ?? '8h') as string;
    const payload: Omit<PayloadToken, 'iat' | 'exp'> = {
      id_usuario:         usuario.id,
      nombre_completo:    usuario.nombre_completo,
      rol:                usuario.rol as RolUsuario,
      codigo_estudiantil: usuario.codigo_estudiantil,
      primer_login:       primerLogin,
    };

    const token = jwt.sign(payload, secreto, { expiresIn: expiracion } as object);

    await this.repoUsuario.registrarLoginExitoso(usuario.id);

    return {
      token,
      id_usuario:         usuario.id,
      nombre_completo:    usuario.nombre_completo,
      rol:                usuario.rol,
      primer_login:       primerLogin,
      codigo_estudiantil: usuario.codigo_estudiantil,
      expira_en:          expiracion,
    };
  }

  /**
   * Verifica si la cuenta está bloqueada por intentos fallidos (HU_001 §CA-04).
   *
   * @param usuario - Registro del usuario
   * @throws {ErrorAutenticacion} HTTP 423 si el bloqueo sigue vigente
   */
  private verificarBloqueoCuenta(usuario: FilaUsuarioSesion): void {
    if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
      const minutosRestantes = Math.ceil(
        (new Date(usuario.bloqueado_hasta).getTime() - Date.now()) / 60000,
      );
      throw new ErrorAutenticacion(
        `Cuenta bloqueada por intentos fallidos. Intente en ${minutosRestantes} minuto(s)`,
        423,
      );
    }
  }

  /**
   * Verifica el ID token con Google y extrae correo, sub y dominio hospedado.
   *
   * @param idToken - JWT de Google Identity Services
   * @returns Identidad verificada
   * @throws {ErrorAutenticacion} HTTP 401 si el token es inválido
   * @throws {ErrorNegocio} HTTP 500 si falta GOOGLE_CLIENT_ID
   */
  private async verificarIdTokenGoogle(idToken: string): Promise<IdentidadGoogle> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new ErrorNegocio('Error de configuración del servidor', 500);
    }

    if (!this.clienteGoogle) {
      this.clienteGoogle = new OAuth2Client(clientId);
    }

    try {
      const ticket = await this.clienteGoogle.verifyIdToken({
        idToken,
        audience: clientId,
      });
      const payload = ticket.getPayload();

      if (!payload?.email || !payload.sub || payload.email_verified !== true) {
        throw new ErrorAutenticacion('Token de Google inválido o expirado', 401);
      }

      return {
        correo:        payload.email.toLowerCase(),
        googleSub:     payload.sub,
        dominioGoogle: payload.hd,
      };
    } catch (error) {
      if (error instanceof ErrorAutenticacion || error instanceof ErrorNegocio) {
        throw error;
      }
      throw new ErrorAutenticacion('Token de Google inválido o expirado', 401);
    }
  }

  /**
   * Restringe el login Google al dominio institucional de Workspace.
   *
   * @param correo - Correo verificado por Google
   * @param dominioHospedado - Claim `hd` (hosted domain) si existe
   * @throws {ErrorAutenticacion} HTTP 403 si el dominio no es el institucional
   */
  private verificarDominioInstitucional(correo: string, dominioHospedado: string | undefined): void {
    const dominioPermitido = (process.env.GOOGLE_DOMINIO_PERMITIDO ?? 'uniautonoma.edu.co')
      .trim()
      .toLowerCase();
    const dominioCorreo = correo.split('@')[1] ?? '';
    const coincideHd = !dominioHospedado || dominioHospedado.toLowerCase() === dominioPermitido;

    if (dominioCorreo !== dominioPermitido || !coincideHd) {
      throw new ErrorAutenticacion(
        `Solo se permite iniciar sesión con una cuenta institucional @${dominioPermitido}`,
        403,
      );
    }
  }

  /**
   * Obtiene el código estudiantil de un usuario por su ID.
   * Método auxiliar para cambiarContrasena.
   *
   * @param idUsuario - ID del usuario
   * @returns {Promise<string>} Código estudiantil
   */
  private async obtenerCodigoPorId(idUsuario: number): Promise<string> {
    const res = await pool.query<{ codigo_estudiantil: string }>(
      `SELECT codigo_estudiantil FROM usuarios WHERE id_usuario = $1 AND deleted_at IS NULL`,
      [idUsuario],
    );
    return res.rows[0]?.codigo_estudiantil ?? '';
  }
}
