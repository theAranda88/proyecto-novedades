// src/services/AutenticadorService.ts
// Lógica de negocio para la autenticación de usuarios

import bcrypt           from 'bcrypt';
import jwt              from 'jsonwebtoken';
import { pool }         from '../config/database';
import { RolUsuario }   from '../middlewares/authMiddleware';
import { TDatosLogin }  from '../schemas/auth.schema';
import { ErrorNegocio } from '../middlewares/errorHandler';

type FilaUsuario = {
  id_usuario:          number;
  nombre_completo:     string;
  email_institucional: string;
  password_hash:       string;
  rol:                 RolUsuario;
  activo:              boolean;
  cod_alumno:          string | null;
};

type ResultadoLogin = {
  token:           string;
  id_usuario:      number;
  nombre_completo: string;
  rol:             RolUsuario;
  expira_en:       string;
};

export class ServicioAutenticacion {

  /**
   * Autentica a cualquier usuario del sistema con sus credenciales institucionales.
   * Soporta roles: ESTUDIANTE, SECRETARIA, ADMIN.
   *
   * @param datosLogin - Email y contraseña validados por Zod
   * @throws {ErrorNegocio} HTTP 401 — Credenciales incorrectas
   * @throws {ErrorNegocio} HTTP 403 — Cuenta o matrícula inactiva
   */
  async iniciarSesion(datosLogin: TDatosLogin): Promise<ResultadoLogin> {

    const resultadoUsuario = await pool.query<FilaUsuario>(
      `SELECT id_usuario, nombre_completo, email_institucional,
              password_hash, rol, activo, cod_alumno
         FROM usuarios
        WHERE email_institucional = $1
        LIMIT 1`,
      [datosLogin.email_institucional],
    );

    const usuario = resultadoUsuario.rows[0];

    if (!usuario) {
      throw new ErrorNegocio('Credenciales incorrectas. Verifique su email y contraseña', 401);
    }

    const contrasenaValida = await bcrypt.compare(datosLogin.password, usuario.password_hash);
    if (!contrasenaValida) {
      throw new ErrorNegocio('Credenciales incorrectas. Verifique su email y contraseña', 401);
    }

    if (!usuario.activo) {
      throw new ErrorNegocio('Su cuenta no está activa. Contacte al administrador del sistema', 403);
    }

    if (usuario.rol === RolUsuario.ESTUDIANTE && usuario.cod_alumno) {
      const res = await pool.query<{ matricula_activa: boolean }>(
        `SELECT matricula_activa FROM estudiantes WHERE cod_alumno = $1`,
        [usuario.cod_alumno],
      );
      if (!res.rows[0]?.matricula_activa) {
        throw new ErrorNegocio(
          'Su matrícula no está activa para el periodo actual. Contacte a la coordinación académica',
          403,
        );
      }
    }

    const secreto = process.env.JWT_SECRET;
    if (!secreto) {
      throw new ErrorNegocio('Error de configuración del servidor. Contacte al administrador', 500);
    }

    const token = jwt.sign(
      { id_usuario: usuario.id_usuario, nombre_completo: usuario.nombre_completo, rol: usuario.rol, cod_alumno: usuario.cod_alumno ?? null },
      secreto,
      { expiresIn: '2h' },
    );

    return { token, id_usuario: usuario.id_usuario, nombre_completo: usuario.nombre_completo, rol: usuario.rol, expira_en: '2h' };
  }
}
