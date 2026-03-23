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

  /**
   * Verifica si un email ya existe en la tabla usuarios.
   * Considera soft delete (deleted_at IS NULL).
   *
   * @param email - Email institucional
   * @returns {Promise<boolean>} true si existe, false en caso contrario
   */
  async existeEmail(email: string): Promise<boolean> {
    try {
      const resultado = await pool.query<{ existe: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM usuarios
           WHERE email_institucional = $1
             AND deleted_at IS NULL
         ) AS existe`,
        [email],
      );
      return resultado.rows[0]?.existe ?? false;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al verificar email: ${(error as Error).message}`);
    }
  }

  /**
   * Verifica si un código estudiantil ya existe en la tabla usuarios.
   * Considera soft delete (deleted_at IS NULL).
   *
   * @param codigoEstudiantil - Código institucional
   * @returns {Promise<boolean>} true si existe, false en caso contrario
   */
  async existeCodigoEstudiantil(codigoEstudiantil: string): Promise<boolean> {
    try {
      const resultado = await pool.query<{ existe: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM usuarios
           WHERE codigo_estudiantil = $1
             AND deleted_at IS NULL
         ) AS existe`,
        [codigoEstudiantil],
      );
      return resultado.rows[0]?.existe ?? false;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al verificar código estudiantil: ${(error as Error).message}`);
    }
  }

  /**
   * Obtiene un usuario por su ID.
   * Incluye información del rol para validaciones de autorización.
   *
   * @param idUsuario - id_usuario
   * @returns {Promise<FilaUsuario | null>} Usuario o null si no existe
   */
  async obtenerPorId(idUsuario: number): Promise<FilaUsuario | null> {
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
          WHERE id_usuario = $1
            AND deleted_at IS NULL
          LIMIT 1`,
        [idUsuario],
      );
      return resultado.rows[0] ?? null;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al obtener usuario por ID: ${(error as Error).message}`);
    }
  }

  /**
   * Crea un nuevo usuario en la tabla usuarios.
   * Establece automáticamente primer_login = TRUE (cambio obligatorio de password).
   * El password se genera con hash bcrypt cost ≥ 12.
   *
   * Usado para crear SECRETARIA y ADMIN (sin perfil de estudiante).
   *
   * @param nombreCompleto      - Nombre del usuario
   * @param emailInstitucional  - Email único
   * @param codigoEstudiantil   - Código único
   * @param rol                 - Rol del usuario (ESTUDIANTE, SECRETARIA, ADMIN)
   * @param passwordHash        - Hash bcrypt de la contraseña temporal
   * @param idUsuarioAutor      - ID del usuario que crea (para auditoría)
   * @returns {Promise<number>} ID del usuario creado (id_usuario)
   * @throws {ErrorBaseDatos} Si falla la inserción
   */
  async crearUsuario(
    nombreCompleto:      string,
    emailInstitucional:  string,
    codigoEstudiantil:   string,
    rol:                 string,
    passwordHash:        string,
    idUsuarioAutor:      number,
  ): Promise<number> {
    try {
      const rolEnum = rol.toUpperCase();
      const resultado = await pool.query<{ id_usuario: number }>(
        `INSERT INTO usuarios
            (nombre_completo, email_institucional, codigo_estudiantil, 
             password_hash, rol, primer_login, activo, 
             created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::rol_sistema, TRUE, TRUE, $6, NOW(), NOW())
         RETURNING id_usuario`,
        [nombreCompleto, emailInstitucional, codigoEstudiantil, passwordHash, rolEnum, idUsuarioAutor],
      );
      return resultado.rows[0]?.id_usuario ?? 0;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al crear usuario: ${(error as Error).message}`);
    }
  }

  /**
   * Crea un usuario + perfil de estudiante en una TRANSACCIÓN.
   * Si falla, revierte ambos cambios automáticamente.
   * Cumple HU_001 + HU_DB §4.2
   *
   * @param nombreCompleto      - Nombre del usuario
   * @param emailInstitucional  - Email único
   * @param codigoEstudiantil   - Código único
   * @param rol                 - Rol del usuario
   * @param passwordHash        - Hash bcrypt
   * @param idUsuarioAutor      - ID del usuario que crea
   * @param programaId          - ID del programa (si rol = ESTUDIANTE)
   * @param semestreActual      - Semestre (si rol = ESTUDIANTE)
   * @param jornada             - Jornada (si rol = ESTUDIANTE)
   * @param matriculaActiva     - Matrícula activa (si rol = ESTUDIANTE)
   * @param creditosMaxPermitidos - Límite de créditos
   * @param estadoAcademico    - Estado inicial
   * @returns {Promise<{idUsuario: number, idEstudiante?: number}>}
   * @throws {ErrorBaseDatos} Si falla la transacción
   */
  async crearUsuarioConPerfilEstudiante(
    nombreCompleto:         string,
    emailInstitucional:     string,
    codigoEstudiantil:      string,
    rol:                    string,
    passwordHash:           string,
    idUsuarioAutor:         number,
    programaId?:            number,
    semestreActual?:        number,
    jornada?:               string,
    matriculaActiva:        boolean = true,
    creditosMaxPermitidos:  number = 20,
    estadoAcademico:        string = 'normal',
  ): Promise<{ idUsuario: number; idEstudiante?: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Crear usuario
      const rolEnum = rol.toUpperCase();
      const resUsuario = await client.query<{ id_usuario: number }>(
        `INSERT INTO usuarios
            (nombre_completo, email_institucional, codigo_estudiantil, 
             password_hash, rol, primer_login, activo, 
             created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::rol_sistema, TRUE, TRUE, $6, NOW(), NOW())
         RETURNING id_usuario`,
        [nombreCompleto, emailInstitucional, codigoEstudiantil, passwordHash, rolEnum, idUsuarioAutor],
      );

      const idUsuarioCreado = resUsuario.rows[0]?.id_usuario ?? 0;
      if (!idUsuarioCreado) {
        throw new ErrorBaseDatos('Error al crear usuario');
      }

      // 2. Si es ESTUDIANTE, crear perfil académico en la misma transacción
      if (rol.toUpperCase() === 'ESTUDIANTE' && programaId && semestreActual && jornada) {
        const docAlumno = `DOC_${codigoEstudiantil}`;
        const codAlumno = `ALU_${codigoEstudiantil}`;

        const resEstudiante = await client.query<{ id: number }>(
          `INSERT INTO estudiantes
              (usuario_id, cod_alumno, nombre_completo, doc_alumno, codigo_estudiantil, 
               programa_id, semestre_actual, jornada,
               matricula_activa, creditos_inscritos, creditos_max_permitidos,
               estado_academico, promedio_acumulado,
               created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, 0.00, NOW(), NOW())
           RETURNING id`,
          [
            idUsuarioCreado,
            codAlumno,
            nombreCompleto,
            docAlumno,
            codigoEstudiantil,
            programaId,
            semestreActual,
            jornada,
            matriculaActiva,
            creditosMaxPermitidos,
            estadoAcademico,
          ],
        );

        const idEstudianteCreado = resEstudiante.rows[0]?.id ?? 0;
        if (!idEstudianteCreado) {
          throw new ErrorBaseDatos('Error al crear perfil de estudiante');
        }

        await client.query('COMMIT');
        return { idUsuario: idUsuarioCreado, idEstudiante: idEstudianteCreado };
      }

      // Si NO es ESTUDIANTE, solo retornar usuario
      await client.query('COMMIT');
      return { idUsuario: idUsuarioCreado };
    } catch (error) {
      await client.query('ROLLBACK');
      throw new ErrorBaseDatos(`Error en transacción: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Crea un perfil académico de estudiante en la tabla `estudiantes`.
   * Se llama DESPUÉS de crearUsuario() cuando rol = ESTUDIANTE.
   * Vincula el usuario con su programa, semestre, jornada e inicializa créditos.
   *
   * Cumple HU_DB §4.2 — Tabla estudiantes con todos los campos requeridos.
   *
   * @param usuarioId               - ID del usuario creado (foreign key)
   * @param nombreCompleto          - Nombre del estudiante (para auditoria)
   * @param codigoEstudiantil       - Código estudiantil (duplicado para compatibilidad)
   * @param programaId              - ID del programa (1=Ing.Sistemas, 2=Ing.Industrial, 3=Admin)
   * @param semestreActual          - Semestre actual del estudiante (1-12)
   * @param jornada                 - Jornada (manana|tarde|noche)
   * @param matriculaActiva         - Si tiene matrícula activa (default: true)
   * @param creditosMaxPermitidos   - Límite de créditos (según programa)
   * @param estadoAcademico        - Estado inicial (default: 'normal')
   * @returns {Promise<number>} ID del estudiante creado (estudiantes.id)
   * @throws {ErrorBaseDatos} Si falla la inserción
   */
  async crearEstudiante(
    usuarioId:              number,
    nombreCompleto:         string,
    codigoEstudiantil:      string,
    programaId:             number,
    semestreActual:         number,
    jornada:                string,
    matriculaActiva:        boolean = true,
    creditosMaxPermitidos:  number = 20,
    estadoAcademico:        string = 'normal',
  ): Promise<number> {
    try {
      // Generar doc_alumno automático (prefijo + codigo)
      // Ej: "2025009" → "DOC_2025009"
      const docAlumno = `DOC_${codigoEstudiantil}`;

      // Generar cod_alumno automático (similar a codigo pero con prefijo ALU)
      // Ej: "2025009" → "ALU_2025009"
      const codAlumno = `ALU_${codigoEstudiantil}`;

      const resultado = await pool.query<{ id: number }>(
        `INSERT INTO estudiantes
            (usuario_id, cod_alumno, nombre_completo, doc_alumno, codigo_estudiantil, 
             programa_id, semestre_actual, jornada,
             matricula_activa, creditos_inscritos, creditos_max_permitidos,
             estado_academico, promedio_acumulado,
             created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, 0.00, NOW(), NOW())
         RETURNING id`,
        [
          usuarioId,
          codAlumno,
          nombreCompleto,
          docAlumno,
          codigoEstudiantil,
          programaId,
          semestreActual,
          jornada,
          matriculaActiva,
          creditosMaxPermitidos,
          estadoAcademico,
        ],
      );
      return resultado.rows[0]?.id ?? 0;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al crear perfil de estudiante: ${(error as Error).message}`);
    }
  }
}

// ============================================================================
// NUEVOS MÉTODOS PARA GESTIÓN DE USUARIOS (ServicioGestionUsuarios)
// ============================================================================

export class RepositorioGestionUsuarios {

  /**
   * Lista usuarios con filtros y paginación.
   * Aplica soft delete (deleted_at IS NULL) y filtra por rol/activo.
   *
   * @param filtros - { rol?, activo?, pagina, limite }
   * @returns {Promise<{ usuarios: any[], total: number }>
   */
  async listarConFiltros(filtros: {
    rol?: string;
    activo?: boolean;
    pagina: number;
    limite: number;
  }): Promise<{ usuarios: any[]; total: number }> {
    try {
      let query = `
        SELECT u.id_usuario,
               u.nombre_completo,
               u.email_institucional,
               u.codigo_estudiantil,
               u.rol,
               u.activo,
               u.primer_login,
               u.created_at,
               u.updated_at,
               e.programa_id,
               e.jornada,
               e.matricula_activa
          FROM usuarios u
          LEFT JOIN estudiantes e ON u.id_usuario = e.usuario_id
         WHERE u.deleted_at IS NULL
      `;

      const params: any[] = [];
      let paramCount = 1;

      if (filtros.rol) {
        query += ` AND LOWER(u.rol::TEXT) = $${paramCount}`;
        params.push(filtros.rol.toLowerCase());
        paramCount++;
      }

      if (filtros.activo !== undefined) {
        query += ` AND u.activo = $${paramCount}`;
        params.push(filtros.activo);
        paramCount++;
      }

      // Contar total
      const countQuery = query.replace(
        /SELECT.*?FROM/,
        'SELECT COUNT(*) AS total FROM'
      );
      const countResult = await pool.query<{ total: number }>(countQuery, params);
      const total = parseInt(<string><unknown>countResult.rows[0]?.total ?? '0');

      // Paginar
      const offset = (filtros.pagina - 1) * filtros.limite;
      query += ` ORDER BY u.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(filtros.limite as any, offset as any);

      const resultado = await pool.query(query, params as any[]);
      return { usuarios: resultado.rows, total };
    } catch (error) {
      throw new ErrorBaseDatos(`Error al listar usuarios: ${(error as Error).message}`);
    }
  }

  /**
   * Obtiene un usuario completo por ID.
   * Incluye datos de estudiante si aplica.
   */
  async obtenerPorId(idUsuario: number): Promise<any> {
    try {
      const resultado = await pool.query(
        `SELECT u.id_usuario,
                u.nombre_completo,
                u.email_institucional,
                u.codigo_estudiantil,
                u.rol,
                u.activo,
                u.primer_login,
                u.intentos_fallidos,
                u.bloqueado_hasta,
                u.created_at,
                u.updated_at,
                e.programa_id,
                e.jornada,
                e.matricula_activa,
                e.estado_academico,
                e.creditos_inscritos,
                e.creditos_max_permitidos
           FROM usuarios u
           LEFT JOIN estudiantes e ON u.id_usuario = e.usuario_id
          WHERE u.id_usuario = $1
            AND u.deleted_at IS NULL
          LIMIT 1`,
        [idUsuario],
      );
      return resultado.rows[0] ?? null;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al obtener usuario: ${(error as Error).message}`);
    }
  }

  /**
   * Busca usuarios por nombre, email o código estudiantil.
   */
  async buscar(termino: string, limite: number = 20): Promise<any[]> {
    try {
      const busqueda = `%${termino}%`;
      const resultado = await pool.query(
        `SELECT u.id_usuario,
                u.nombre_completo,
                u.email_institucional,
                u.codigo_estudiantil,
                u.rol,
                u.activo,
                e.programa_id,
                e.jornada
           FROM usuarios u
           LEFT JOIN estudiantes e ON u.id_usuario = e.usuario_id
          WHERE u.deleted_at IS NULL
            AND (u.nombre_completo ILIKE $1
              OR u.email_institucional ILIKE $1
              OR u.codigo_estudiantil ILIKE $1)
          LIMIT $2`,
        [busqueda, limite],
      );
      return resultado.rows;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al buscar usuarios: ${(error as Error).message}`);
    }
  }

  /**
   * Actualiza datos básicos de un usuario (nombre, email).
   * Registra auditoría de cambios.
   */
  async actualizar(
    idUsuario: number,
    datos: { nombre_completo?: string; email_institucional?: string },
    idAuditoria: number,
  ): Promise<void> {
    try {
      const actualizaciones: string[] = [];
      const valores: any[] = [idUsuario];
      let paramCount = 2;

      if (datos.nombre_completo) {
        actualizaciones.push(`nombre_completo = $${paramCount}`);
        valores.push(datos.nombre_completo);
        paramCount++;
      }

      if (datos.email_institucional) {
        actualizaciones.push(`email_institucional = $${paramCount}`);
        valores.push(datos.email_institucional);
        paramCount++;
      }

      if (actualizaciones.length === 0) return;

      actualizaciones.push(`updated_at = NOW()`);

      await pool.query(
        `UPDATE usuarios
            SET ${actualizaciones.join(', ')}
          WHERE id_usuario = $1`,
        valores,
      );

      // Registrar en auditoría
      await this.registrarAuditoria(
        'USUARIO_ACTUALIZADO',
        idAuditoria,
        idUsuario,
        datos,
      );
    } catch (error) {
      throw new ErrorBaseDatos(`Error al actualizar usuario: ${(error as Error).message}`);
    }
  }

  /**
   * Desactiva un usuario (soft delete).
   * Establece activo = false y registra en auditoría.
   */
  async desactivar(idUsuario: number, idAuditoria: number): Promise<void> {
    try {
      await pool.query(
        `UPDATE usuarios
            SET activo = false,
                updated_at = NOW()
          WHERE id_usuario = $1`,
        [idUsuario],
      );

      await this.registrarAuditoria(
        'USUARIO_DESACTIVADO',
        idAuditoria,
        idUsuario,
        { activo: false },
      );
    } catch (error) {
      throw new ErrorBaseDatos(`Error al desactivar usuario: ${(error as Error).message}`);
    }
  }

  /**
   * Reactiva un usuario (si fue desactivado).
   */
  async reactivar(idUsuario: number, idAuditoria: number): Promise<void> {
    try {
      await pool.query(
        `UPDATE usuarios
            SET activo = true,
                updated_at = NOW()
          WHERE id_usuario = $1`,
        [idUsuario],
      );

      await this.registrarAuditoria(
        'USUARIO_REACTIVADO',
        idAuditoria,
        idUsuario,
        { activo: true },
      );
    } catch (error) {
      throw new ErrorBaseDatos(`Error al reactivar usuario: ${(error as Error).message}`);
    }
  }

  /**
   * Actualiza el estado de matrícula de un estudiante.
   */
  async actualizarEstadoMatricula(
    idUsuario: number,
    matriculaActiva: boolean,
    idAuditoria: number,
  ): Promise<void> {
    try {
      await pool.query(
        `UPDATE estudiantes
            SET matricula_activa = $1,
                updated_at = NOW()
          WHERE usuario_id = $2`,
        [matriculaActiva, idUsuario],
      );

      await this.registrarAuditoria(
        'ESTADO_MATRICULA_ACTUALIZADO',
        idAuditoria,
        idUsuario,
        { matricula_activa: matriculaActiva },
      );
    } catch (error) {
      throw new ErrorBaseDatos(`Error al actualizar estado de matrícula: ${(error as Error).message}`);
    }
  }

  /**
   * Registra eventos de auditoría en tabla (si existe).
   * Por ahora: compatible con tabla auditoria_usuarios si existe.
   */
  private async registrarAuditoria(
    tipo: string,
    idUsuarioAudit: number,
    idUsuarioAfectado: number,
    datosAntes: any,
  ): Promise<void> {
    try {
      // Verificar si tabla existe
      const checkTable = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'auditoria_usuarios'
        )
      `);

      if (checkTable.rows[0].exists) {
        await pool.query(
          `INSERT INTO auditoria_usuarios
              (tipo_evento, usuario_id_auditor, usuario_id_afectado, datos_antes, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [tipo, idUsuarioAudit, idUsuarioAfectado, JSON.stringify(datosAntes)],
        );
      }
    } catch (error) {
      // Log silencioso si falla auditoría (no rompe la operación principal)
      console.warn(`Advertencia: Error al registrar auditoría: ${(error as Error).message}`);
    }
  }
}
