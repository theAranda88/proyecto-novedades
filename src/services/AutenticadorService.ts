// src/services/AutenticadorService.ts
// Lógica de negocio para autenticación. Implementa HU_001 completa.

import bcrypt                                         from 'bcrypt';
import jwt                                            from 'jsonwebtoken';
import { RepositorioUsuario }                         from '../repositories/usuario.repository';
import { RolUsuario, PayloadToken }                   from '../middlewares/authMiddleware';
import { TDatosLogin, TDatosCambioPassword }          from '../schemas/auth.schema';
import { ErrorNegocio, ErrorAutenticacion }           from '../middlewares/errorHandler';
import { pool }                                       from '../config/database';

const COSTO_BCRYPT = Number(process.env.BCRYPT_COST ?? 12);
const MAX_INTENTOS = 5;

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

export class ServicioAutenticacion {

  private readonly repoUsuario: RepositorioUsuario;

  constructor() {
    this.repoUsuario = new RepositorioUsuario();
  }

  /**
   * Autentica a un usuario con su código estudiantil y contraseña.
   * Implementa el flujo completo de HU_001:
   *   1. Verifica existencia del usuario (soft delete)
   *   2. Verifica si la cuenta está bloqueada (HU_001 §CA-04)
   *   3. Compara contraseña con bcrypt
   *   4. Si la contraseña es incorrecta, registra intento fallido
   *   5. Verifica cuenta activa
   *   6. Si rol = estudiante, verifica matricula_activa
   *   7. Genera JWT con primer_login en el payload
   *   8. Registra login exitoso (ultimo_login, resetea intentos)
   *
   * @param datosLogin - Código estudiantil y contraseña validados por Zod
   * @returns {Promise<ResultadoLogin>} Token JWT y datos del usuario
   * @throws {ErrorAutenticacion} HTTP 401 — Credenciales incorrectas
   * @throws {ErrorAutenticacion} HTTP 423 — Cuenta bloqueada
   * @throws {ErrorNegocio} HTTP 403 — Cuenta o matrícula inactiva
   */
  async iniciarSesion(datosLogin: TDatosLogin): Promise<ResultadoLogin> {
    const usuario = await this.repoUsuario.buscarPorCodigo(datosLogin.codigo_estudiantil);

    // No revelar si el código existe o no (mensaje genérico)
    if (!usuario) {
      throw new ErrorAutenticacion('Credenciales incorrectas. Verifique su código y contraseña', 401);
    }

    // Verificar si la cuenta está bloqueada (HU_001 §CA-04)
    if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
      const minutosRestantes = Math.ceil(
        (new Date(usuario.bloqueado_hasta).getTime() - Date.now()) / 60000,
      );
      throw new ErrorAutenticacion(
        `Cuenta bloqueada por intentos fallidos. Intente en ${minutosRestantes} minuto(s)`,
        423,
      );
    }

    // Si el bloqueo ya expiró, se manejará al registrar intento exitoso
    const contrasenaValida = await bcrypt.compare(datosLogin.password, usuario.password_hash);

    if (!contrasenaValida) {
      // Registrar intento fallido y posible bloqueo
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

    if (!usuario.activo) {
      throw new ErrorNegocio('Su cuenta no está activa. Contacte al administrador del sistema', 403);
    }

    // Para ESTUDIANTE: verificar matricula_activa (HU_001 §CA-02)
    if (usuario.rol === RolUsuario.ESTUDIANTE) {
      const perfil = await this.repoUsuario.buscarEstudiantePorUsuarioId(usuario.id);
      if (!perfil?.matricula_activa) {
        throw new ErrorNegocio(
          'Su matrícula no está activa para el periodo actual. Contacte a la coordinación académica',
          403,
        );
      }
    }

    // Generar JWT con primer_login en el payload (HU_001 §CA-06)
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
      primer_login:       usuario.primer_login,
    };

    const token = jwt.sign(payload, secreto, { expiresIn: expiracion } as object);

    // Registrar login exitoso: resetea intentos y actualiza ultimo_login (§CA-07)
    await this.repoUsuario.registrarLoginExitoso(usuario.id);

    return {
      token,
      id_usuario:         usuario.id,
      nombre_completo:    usuario.nombre_completo,
      rol:                usuario.rol,
      primer_login:       usuario.primer_login,
      codigo_estudiantil: usuario.codigo_estudiantil,
      expira_en:          expiracion,
    };
  }

  /**
   * Cambia la contraseña de un usuario. Solo válido cuando primer_login = TRUE.
   * Implementa el flujo de cambio obligatorio de contraseña temporal (HU_001 §CA-03).
   *
   * Flujo:
   *   1. Verifica que el usuario exista y esté activo
   *   2. Verifica que primer_login = TRUE (solo se puede usar una vez)
   *   3. Verifica la contraseña actual con bcrypt
   *   4. Genera nuevo hash bcrypt con cost ≥ 12
   *   5. Actualiza password_hash y establece primer_login = FALSE
   *   6. Emite un nuevo JWT con primer_login = FALSE para acceso completo
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
      primer_login:       false,   // Ya cambió la contraseña
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
