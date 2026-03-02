// src/repositories/usuario.repository.ts
// Acceso a datos de la tabla `usuarios`. Solo consultas SQL, sin lógica de negocio.

import { pool }           from '../config/database';
import { ErrorBaseDatos } from '../middlewares/errorHandler';

/** Fila de la tabla usuarios mapeada al esquema HU_DB */
type FilaUsuario = {
  id:                  number;   // id_usuario en BD
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
};

type FilaEstudianteBasica = {
  id:                      number;
  matricula_activa:        boolean;
  estado_academico:        string;
  creditos_inscritos:      number;
  creditos_max_permitidos: number;
  jornada:                 string;
};

export class RepositorioUsuario {

  /**
   * Busca un usuario activo por su código estudiantil.
   * Aplica soft delete (deleted_at IS NULL).
   *
   * @param codigoEstudiantil - Código institucional del usuario
   * @returns {Promise<FilaUsuario | null>} Usuario o null si no existe
   * @throws {ErrorBaseDatos} Si falla la consulta SQL
   */
  async buscarPorCodigo(codigoEstudiantil: string): Promise<FilaUsuario | null> {
    try {
      const resultado = await pool.query<FilaUsuario>(
        `SELECT id_usuario          AS id,
                nombre_completo,
                codigo_estudiantil,
                email_institucional,
                password_hash,
                LOWER(rol::TEXT)    AS rol,
                primer_login,
                intentos_fallidos,
                bloqueado_hasta,
                ultimo_login,
                activo,
                deleted_at
           FROM usuarios
          WHERE codigo_estudiantil = $1
            AND deleted_at IS NULL
          LIMIT 1`,
        [codigoEstudiantil],
      );
      return resultado.rows[0] ?? null;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al buscar usuario por código: ${(error as Error).message}`);
    }
  }

  /**
   * Incrementa el contador de intentos fallidos de login.
   * Si alcanza 5 intentos, establece bloqueado_hasta = NOW() + 15 min.
   * Cumple HU_001 §CA-04 — Bloqueo por intentos fallidos.
   *
   * @param idUsuario        - id_usuario del usuario
   * @param intentosActuales - Intentos fallidos actuales antes de este fallo
   */
  async registrarIntentoFallido(idUsuario: number, intentosActuales: number): Promise<void> {
    try {
      const nuevosIntentos = intentosActuales + 1;
      const bloquear       = nuevosIntentos >= 5;

      await pool.query(
        `UPDATE usuarios
            SET intentos_fallidos = $1,
                bloqueado_hasta   = CASE WHEN $2 THEN NOW() + INTERVAL '15 minutes'
                                         ELSE bloqueado_hasta END,
                updated_at        = NOW()
          WHERE id_usuario = $3
            AND deleted_at IS NULL`,
        [nuevosIntentos, bloquear, idUsuario],
      );
    } catch (error) {
      throw new ErrorBaseDatos(`Error al registrar intento fallido: ${(error as Error).message}`);
    }
  }

  /**
   * Registra un login exitoso: resetea intentos_fallidos y bloqueado_hasta,
   * actualiza ultimo_login. Cumple HU_001 §CA-07 — Auditoría de login.
   *
   * @param idUsuario - id_usuario del usuario autenticado
   */
  async registrarLoginExitoso(idUsuario: number): Promise<void> {
    try {
      await pool.query(
        `UPDATE usuarios
            SET intentos_fallidos = 0,
                bloqueado_hasta   = NULL,
                ultimo_login      = NOW(),
                updated_at        = NOW()
          WHERE id_usuario = $1
            AND deleted_at IS NULL`,
        [idUsuario],
      );
    } catch (error) {
      throw new ErrorBaseDatos(`Error al registrar login exitoso: ${(error as Error).message}`);
    }
  }

  /**
   * Actualiza el hash de contraseña y establece primer_login = FALSE.
   * Cumple HU_001 §CA-03 — Cambio obligatorio de contraseña.
   *
   * @param idUsuario    - id_usuario del usuario
   * @param passwordHash - Nuevo hash bcrypt (cost ≥ 12)
   */
  async actualizarPassword(idUsuario: number, passwordHash: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE usuarios
            SET password_hash = $1,
                primer_login  = FALSE,
                updated_at    = NOW()
          WHERE id_usuario = $2
            AND deleted_at IS NULL`,
        [passwordHash, idUsuario],
      );
    } catch (error) {
      throw new ErrorBaseDatos(`Error al actualizar contraseña: ${(error as Error).message}`);
    }
  }

  /**
   * Busca el perfil académico de un estudiante vinculado a un usuario.
   * Usa usuario_id populado por la migración 004.
   * ROW_NUMBER() genera el ID secuencial numérico usado en inscripciones/historial_v2.
   *
   * @param usuarioId - id_usuario del usuario
   * @returns {Promise<FilaEstudianteBasica | null>} Perfil académico o null
   */
  async buscarEstudiantePorUsuarioId(usuarioId: number): Promise<FilaEstudianteBasica | null> {
    try {
      const resultado = await pool.query<FilaEstudianteBasica>(
        `SELECT
            ROW_NUMBER() OVER (ORDER BY cod_alumno)  AS id,
            matricula_activa,
            COALESCE(estado_academico, 'normal')     AS estado_academico,
            COALESCE(creditos_inscritos, 0)          AS creditos_inscritos,
            COALESCE(creditos_max_permitidos, 20)    AS creditos_max_permitidos,
            COALESCE(jornada, 'manana')              AS jornada
           FROM estudiantes
          WHERE usuario_id = $1
            AND deleted_at IS NULL
          LIMIT 1`,
        [usuarioId],
      );
      return resultado.rows[0] ?? null;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al buscar estudiante: ${(error as Error).message}`);
    }
  }

  /**
   * Obtiene el cod_alumno de un estudiante a partir del id_usuario.
   * Necesario para operaciones sobre tabla solicitudes (que usa cod_alumno).
   *
   * @param usuarioId - id_usuario del usuario
   * @returns {Promise<string | null>} cod_alumno o null si no tiene perfil
   */
  async obtenerCodAlumnoPorUsuarioId(usuarioId: number): Promise<string | null> {
    try {
      const resultado = await pool.query<{ cod_alumno: string }>(
        `SELECT cod_alumno
           FROM estudiantes
          WHERE usuario_id = $1
            AND deleted_at IS NULL
          LIMIT 1`,
        [usuarioId],
      );
      return resultado.rows[0]?.cod_alumno ?? null;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al obtener cod_alumno: ${(error as Error).message}`);
    }
  }
}
