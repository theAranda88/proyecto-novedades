// src/repositories/solicitud.repository.ts
// Acceso a datos de solicitudes, grupos_curso, historial_v2 e inscripciones_activas.

import { pool }           from '../config/database';
import { ErrorBaseDatos } from '../middlewares/errorHandler';

type FilaGrupoCurso = {
  id:             number;
  curso_id:       number;
  codigo_grupo:   string;
  jornada:        string;
  dia_semana:     string;
  hora_inicio:    string;
  hora_fin:       string;
  cupo_maximo:    number;
  cupos_ocupados: number;
  periodo:        string;
  activo:         boolean;
  creditos:       number;
  nombre_curso:   string;
};

type FilaHorario = {
  grupo_id:    number;
  dia_semana:  string;
  hora_inicio: string;
  hora_fin:    string;
  curso_id:    number;
};

type FilaHistorial = {
  id:              number;
  curso_id:        number;
  estado:          string;
  numero_intentos: number;
  nota_final:      number | null;
};

type FilaSolicitud = {
  id:               number;
  codigo_solicitud: string;
  estado:           string;
  tipo_solicitud:   string;
  validacion_json:  object;
  created_at:       Date;
};

export class RepositorioSolicitud {

  /**
   * Obtiene todos los datos de un grupo de curso incluyendo créditos.
   *
   * @param grupoId - ID del grupo en tabla grupos_curso
   * @returns {Promise<FilaGrupoCurso | null>}
   */
  async buscarGrupoPorId(grupoId: number): Promise<FilaGrupoCurso | null> {
    try {
      const resultado = await pool.query<FilaGrupoCurso>(
        `SELECT g.id, g.curso_id, g.codigo_grupo, g.jornada, g.dia_semana,
                g.hora_inicio::TEXT AS hora_inicio, g.hora_fin::TEXT AS hora_fin,
                g.cupo_maximo, g.cupos_ocupados, g.periodo, g.activo,
                COALESCE(c.creditos, 3) AS creditos,
                c.nombre_curso          AS nombre_curso
           FROM grupos_curso g
           JOIN cursos c ON c.id = g.curso_id
          WHERE g.id = $1`,
        [grupoId],
      );
      return resultado.rows[0] ?? null;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al buscar grupo: ${(error as Error).message}`);
    }
  }

  /**
   * Obtiene los bloques horarios de las inscripciones activas de un estudiante.
   * Se usa para detectar cruces de horario (HU_DB §5.1, §5.3).
   * Usa ROW_NUMBER para obtener el id_estudiante_seq numérico.
   *
   * @param estudianteSeq - ID secuencial del estudiante (ROW_NUMBER)
   * @param periodo       - Periodo académico
   * @returns {Promise<FilaHorario[]>}
   */
  async listarHorariosInscripciones(
    estudianteSeq: number,
    periodo:       string,
  ): Promise<FilaHorario[]> {
    try {
      const resultado = await pool.query<FilaHorario>(
        `SELECT g.id AS grupo_id, g.dia_semana,
                g.hora_inicio::TEXT AS hora_inicio,
                g.hora_fin::TEXT    AS hora_fin,
                g.curso_id
           FROM inscripciones_activas ia
           JOIN grupos_curso g ON g.id = ia.grupo_id
          WHERE ia.estudiante_id = $1
            AND ia.periodo       = $2`,
        [estudianteSeq, periodo],
      );
      return resultado.rows;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al listar horarios: ${(error as Error).message}`);
    }
  }

  /**
   * Busca el historial académico de un estudiante para un curso (tabla historial_v2).
   *
   * @param estudianteSeq - ID secuencial del estudiante
   * @param cursoId       - ID del curso
   * @returns {Promise<FilaHistorial[]>}
   */
  async buscarHistorialPorCurso(
    estudianteSeq: number,
    cursoId:       number,
  ): Promise<FilaHistorial[]> {
    try {
      const resultado = await pool.query<FilaHistorial>(
        `SELECT id, curso_id, estado, numero_intentos, nota_final
           FROM historial_v2
          WHERE estudiante_id = $1
            AND curso_id      = $2
          ORDER BY id DESC`,
        [estudianteSeq, cursoId],
      );
      return resultado.rows;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al buscar historial: ${(error as Error).message}`);
    }
  }

  /**
   * Verifica si un estudiante está inscrito activamente en un grupo.
   *
   * @param estudianteSeq - ID secuencial del estudiante
   * @param grupoId       - ID del grupo
   * @param periodo       - Periodo académico
   * @returns {Promise<boolean>}
   */
  async estaInscrito(
    estudianteSeq: number,
    grupoId:       number,
    periodo:       string,
  ): Promise<boolean> {
    try {
      const resultado = await pool.query<{ existe: boolean }>(
        `SELECT EXISTS(
            SELECT 1 FROM inscripciones_activas
             WHERE estudiante_id = $1
               AND grupo_id      = $2
               AND periodo       = $3
         ) AS existe`,
        [estudianteSeq, grupoId, periodo],
      );
      return resultado.rows[0]?.existe ?? false;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al verificar inscripción: ${(error as Error).message}`);
    }
  }

  /**
   * Calcula los créditos inscritos del estudiante en un periodo.
   *
   * @param estudianteSeq - ID secuencial del estudiante
   * @param periodo       - Periodo académico
   * @returns {Promise<number>} Total de créditos inscritos
   */
  async calcularCreditosInscritos(estudianteSeq: number, periodo: string): Promise<number> {
    try {
      const resultado = await pool.query<{ total_creditos: number }>(
        `SELECT COALESCE(SUM(COALESCE(c.creditos, 3)), 0) AS total_creditos
           FROM inscripciones_activas ia
           JOIN grupos_curso gc ON gc.id = ia.grupo_id
           JOIN cursos c ON c.id = gc.curso_id
          WHERE ia.estudiante_id = $1
            AND ia.periodo       = $2`,
        [estudianteSeq, periodo],
      );
      return Number(resultado.rows[0]?.total_creditos ?? 0);
    } catch (error) {
      throw new ErrorBaseDatos(`Error al calcular créditos: ${(error as Error).message}`);
    }
  }

  /**
   * Verifica si existen grupos con cupos en una nueva jornada para
   * todas las materias inscritas actualmente del estudiante.
   * Usado en validación CAMBIO_JORNADA (HU_DB §5.2).
   *
   * @param estudianteSeq - ID secuencial del estudiante
   * @param jornadaNueva  - Jornada solicitada
   * @param periodo       - Periodo académico
   * @returns {Promise<boolean>}
   */
  async existenGruposEnJornada(
    estudianteSeq: number,
    jornadaNueva:  string,
    periodo:       string,
  ): Promise<boolean> {
    try {
      const resultado = await pool.query<{ todas_disponibles: boolean }>(
        `SELECT NOT EXISTS (
             SELECT DISTINCT gc_actual.curso_id
               FROM inscripciones_activas ia
               JOIN grupos_curso gc_actual ON gc_actual.id = ia.grupo_id
              WHERE ia.estudiante_id = $1
                AND ia.periodo       = $3
                AND NOT EXISTS (
                    SELECT 1 FROM grupos_curso gc_nueva
                     WHERE gc_nueva.curso_id = gc_actual.curso_id
                       AND gc_nueva.jornada  = $2
                       AND gc_nueva.periodo  = $3
                       AND gc_nueva.activo   = TRUE
                       AND gc_nueva.cupos_ocupados < gc_nueva.cupo_maximo
                )
         ) AS todas_disponibles`,
        [estudianteSeq, jornadaNueva, periodo],
      );
      return resultado.rows[0]?.todas_disponibles ?? false;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al verificar grupos en jornada: ${(error as Error).message}`);
    }
  }

  /**
   * Cuenta las solicitudes activas de un estudiante en un periodo.
   * Aplica soft delete (deleted_at IS NULL).
   * Usa cod_alumno de la tabla solicitudes (esquema original).
   *
   * @param codAlumno        - Código del alumno (cod_alumno en tabla solicitudes)
   * @param periodoAcademico - Periodo académico
   * @returns {Promise<number>}
   */
  async contarSolicitudesActivas(
    codAlumno:        string,
    periodoAcademico: string,
  ): Promise<number> {
    try {
      const resultado = await pool.query<{ total: number }>(
        `SELECT COUNT(*) AS total
           FROM solicitudes
          WHERE cod_alumno       = $1
            AND periodo_academico = $2
            AND estado_solicitud  IN ('PENDIENTE', 'APROBADA')
            AND deleted_at        IS NULL`,
        [codAlumno, periodoAcademico],
      );
      return Number(resultado.rows[0]?.total ?? 0);
    } catch (error) {
      throw new ErrorBaseDatos(`Error al contar solicitudes: ${(error as Error).message}`);
    }
  }

  /**
   * Persiste una nueva solicitud con su validacion_json.
   * Usa la tabla solicitudes con el esquema original + columnas nuevas de mig004.
   *
   * @param datos - Campos de la solicitud
   * @returns {Promise<FilaSolicitud>} La solicitud creada
   */
  async crearSolicitud(datos: {
    codAlumno:        string;
    tipoSolicitud:    string;
    grupoNuevoId:     number | null;
    grupoActualId:    number | null;
    jornadaActual:    string | null;
    jornadaNueva:     string | null;
    justificacion:    string;
    periodoAcademico: string;
    validacionJson:   object;
    createdBy:        number;
  }): Promise<FilaSolicitud> {
    try {
      const anio     = new Date().getFullYear();
      const { rows: [{ siguiente }] } = await pool.query<{ siguiente: number }>(
        `SELECT COALESCE(MAX(
            CAST(SPLIT_PART(codigo_solicitud, '-', 3) AS INT)
         ), 0) + 1 AS siguiente
           FROM solicitudes
          WHERE codigo_solicitud LIKE $1`,
        [`REQ-${anio}-%`],
      );
      const codigoSolicitud = `REQ-${anio}-${String(siguiente).padStart(3, '0')}`;

      // Mapear tipo_solicitud interno → valor del CHECK constraint de BD
      const mapaTipos: Record<string, string> = {
        adicion_curso:  'ADICION_CURSO',
        cambio_curso:   'CAMBIO_CURSO',
        cambio_jornada: 'CAMBIO_JORNADA',
        curso_dirigido: 'CURSO_DIRIGIDO',
      };
      const tipoMapeado = mapaTipos[datos.tipoSolicitud] ?? datos.tipoSolicitud.toUpperCase();

      // Descripción del motivo para la columna motivo_novedad
      const motivoDescripcion = `${tipoMapeado} - Periodo ${datos.periodoAcademico}`;

      const resultado = await pool.query<FilaSolicitud>(
        `INSERT INTO solicitudes
            (cod_alumno, tipo_novedad,
             id_seccion_destino, id_seccion_origen,
             grupo_nuevo_id, grupo_actual_id,
             motivo_novedad, justificacion_detallada,
             periodo_academico, estado_solicitud,
             codigo_solicitud, validacion_json, created_by)
         VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, $7, 'PENDIENTE', $8, $9, $10)
         RETURNING id_solicitud AS id, codigo_solicitud,
                   estado_solicitud AS estado,
                   tipo_novedad     AS tipo_solicitud,
                   validacion_json, fecha_creacion AS created_at`,
        [
          datos.codAlumno,
          tipoMapeado,
          datos.grupoNuevoId,
          datos.grupoActualId,
          motivoDescripcion,
          datos.justificacion,
          datos.periodoAcademico,
          codigoSolicitud,
          JSON.stringify(datos.validacionJson),
          datos.createdBy,
        ],
      );
      return resultado.rows[0];
    } catch (error) {
      throw new ErrorBaseDatos(`Error al crear solicitud: ${(error as Error).message}`);
    }
  }

  /**
   * Lista las solicitudes de un estudiante con filtros opcionales.
   * Aplica soft delete (deleted_at IS NULL).
   *
   * @param codAlumno - Código del alumno
   * @param estado    - Filtro por estado (opcional)
   * @param periodo   - Filtro por periodo (opcional)
   */
  async listarPorEstudiante(
    codAlumno: string,
    estado?:   string,
    periodo?:  string,
  ): Promise<object[]> {
    try {
      const params: (string | undefined)[] = [codAlumno];
      const condiciones = [
        'deleted_at IS NULL',
        'cod_alumno = $1',
      ];
      if (estado) {
        params.push(estado.toUpperCase());
        condiciones.push(`estado_solicitud = $${params.length}`);
      }
      if (periodo) {
        params.push(periodo);
        condiciones.push(`periodo_academico = $${params.length}`);
      }

      const resultado = await pool.query(
        `SELECT id_solicitud AS id, codigo_solicitud, tipo_novedad AS tipo_solicitud,
                estado_solicitud AS estado, justificacion_detallada AS justificacion,
                periodo_academico, validacion_json, fecha_creacion AS created_at
           FROM solicitudes
          WHERE ${condiciones.join(' AND ')}
          ORDER BY fecha_creacion DESC`,
        params,
      );
      return resultado.rows;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al listar solicitudes: ${(error as Error).message}`);
    }
  }

  /**
   * Lista TODAS las solicitudes del sistema con filtros opcionales.
   * Solo SECRETARIA y ADMIN. Aplica soft delete (deleted_at IS NULL).
   *
   * @param estado        - Filtro por estado (opcional)
   * @param periodo       - Filtro por periodo (opcional)
   * @param tipoSolicitud - Filtro por tipo (opcional)
   */
  async listarTodas(
    estado?:        string,
    periodo?:       string,
    tipoSolicitud?: string,
  ): Promise<object[]> {
    try {
      const params: string[] = [];
      const condiciones = ['s.deleted_at IS NULL'];

      if (estado) {
        params.push(estado.toUpperCase());
        condiciones.push(`s.estado_solicitud = $${params.length}`);
      }
      if (periodo) {
        params.push(periodo);
        condiciones.push(`s.periodo_academico = $${params.length}`);
      }
      if (tipoSolicitud) {
        params.push(tipoSolicitud.toUpperCase());
        condiciones.push(`s.tipo_novedad = $${params.length}`);
      }

      const resultado = await pool.query(
        `SELECT s.id_solicitud AS id, s.codigo_solicitud,
                s.tipo_novedad AS tipo_solicitud,
                s.estado_solicitud AS estado,
                s.justificacion_detallada AS justificacion,
                s.periodo_academico, s.validacion_json,
                s.fecha_creacion AS created_at,
                e.nombre_completo AS nombre_estudiante,
                e.cod_alumno AS codigo_estudiantil
           FROM solicitudes s
           JOIN estudiantes e ON e.cod_alumno = s.cod_alumno
          WHERE ${condiciones.join(' AND ')}
          ORDER BY s.fecha_creacion DESC`,
        params,
      );
      return resultado.rows;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al listar todas las solicitudes: ${(error as Error).message}`);
    }
  }

  /**
   * Actualiza el estado de una solicitud.
   *
   * @param solicitudId   - id_solicitud
   * @param estado        - Nuevo estado
   * @param observaciones - Comentario (opcional)
   * @param aprobadaPor   - id_usuario del que resuelve
   */
  async actualizarEstado(
    solicitudId:   number,
    estado:        string,
    observaciones: string | null,
    aprobadaPor:   number,
  ): Promise<void> {
    try {
      const estadoBD = estado.toUpperCase();
      await pool.query(
        `UPDATE solicitudes
            SET estado_solicitud = $1,
                motivo_novedad   = COALESCE($2, motivo_novedad),
                updated_at       = NOW(),
                updated_by       = $3
          WHERE id_solicitud = $4
            AND deleted_at IS NULL`,
        [estadoBD, observaciones, aprobadaPor, solicitudId],
      );
    } catch (error) {
      throw new ErrorBaseDatos(`Error al actualizar estado: ${(error as Error).message}`);
    }
  }

  /**
   * Busca todos los grupos de un curso en un periodo específico.
   * Se usa para determinar si un curso tiene oferta regular o solo dirigida.
   * Un curso es "dirigido" si existe solo un grupo (el grupo solicitado).
   *
   * @param cursoId - ID del curso
   * @param periodo - Periodo académico
   * @returns {Promise<FilaGrupoCurso[]>}
   */
  async buscarGruposPorCursoYPeriodo(cursoId: number, periodo: string): Promise<FilaGrupoCurso[]> {
    try {
      const resultado = await pool.query<FilaGrupoCurso>(
        `SELECT g.id, g.curso_id, g.codigo_grupo, g.jornada, g.dia_semana,
                g.hora_inicio::TEXT AS hora_inicio, g.hora_fin::TEXT AS hora_fin,
                g.cupo_maximo, g.cupos_ocupados, g.periodo, g.activo,
                COALESCE(c.creditos, 3) AS creditos,
                c.nombre_curso          AS nombre_curso
           FROM grupos_curso g
           JOIN cursos c ON c.id = g.curso_id
          WHERE g.curso_id = $1
            AND g.periodo  = $2
            AND g.activo   = TRUE`,
        [cursoId, periodo],
      );
      return resultado.rows;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al buscar grupos por curso y periodo: ${(error as Error).message}`);
    }
  }

  /**
   * Obtiene los detalles completos de una solicitud específica.
   *
   * @param solicitudId - ID de la solicitud
   * @returns {Promise<object | null>} Detalles de la solicitud o null si no existe
   */
  async obtenerPorId(solicitudId: number): Promise<object | null> {
    try {
      const resultado = await pool.query(
        `SELECT id_solicitud        AS id,
                codigo_solicitud,
                cod_alumno,
                tipo_novedad        AS tipo_solicitud,
                estado_solicitud    AS estado,
                periodo_academico,
                motivo_novedad      AS motivo,
                justificacion_detallada AS justificacion,
                validacion_json,
                adjunto_recibo_pago AS adjunto,
                fecha_creacion      AS created_at,
                updated_at
           FROM solicitudes
          WHERE id_solicitud = $1
            AND deleted_at   IS NULL`,
        [solicitudId],
      );
      return resultado.rows[0] ?? null;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al obtener solicitud: ${(error as Error).message}`);
    }
  }

  /**
   * Lista solicitudes con filtros, búsqueda y paginación.
   * Para el panel de Secretaría.
   *
   * @param opciones - { estado?, programaId?, busqueda?, pagina, tamanio, ordenar, direccion }
   * @returns {Promise<{ datos: any[], total: number }>
   */
  async listarSolicitudesConFiltros(opciones: {
    estado?: string;
    programaId?: number;
    busqueda?: string;
    pagina: number;
    tamanio: number;
    ordenar?: string;
    direccion?: string;
  }): Promise<{ datos: any[]; total: number }> {
    try {
      const { estado, programaId, busqueda, pagina, tamanio, ordenar = 'created_at', direccion = 'DESC' } = opciones;

      // Mapa de columnas permitidas para ORDER BY (previene SQL injection y traduce alias)
      const columnaOrden: Record<string, string> = {
        created_at:      'fecha_creacion',
        fecha_creacion:  'fecha_creacion',
        fecha_solicitud: 'fecha_creacion',
        estado:          'estado_solicitud',
        estado_solicitud:'estado_solicitud',
        tipo:            'tipo_novedad',
        tipo_novedad:    'tipo_novedad',
        codigo_solicitud:'codigo_solicitud',
      };
      const columnaOrdenFinal = columnaOrden[ordenar] ?? 'fecha_creacion';

      // Validar offset y limit
      const offset = (pagina - 1) * tamanio;
      const validarDireccion = ['ASC', 'DESC'].includes(direccion.toUpperCase()) ? direccion.toUpperCase() : 'DESC';

      // Construir condiciones WHERE
      const condiciones: string[] = ['s.deleted_at IS NULL'];
      const parametros: any[] = [];
      let numeroParam = 1;

      if (estado) {
        // estado_solicitud en BD está en MAYÚSCULAS (PENDIENTE, APROBADA, RECHAZADA)
        condiciones.push(`s.estado_solicitud = $${numeroParam}`);
        parametros.push(estado.toUpperCase());
        numeroParam++;
      }

      if (programaId) {
        // programa_id vive en la tabla estudiantes
        condiciones.push(`est.programa_id = $${numeroParam}`);
        parametros.push(programaId);
        numeroParam++;
      }

      if (busqueda) {
        condiciones.push(`(
          s.codigo_solicitud ILIKE $${numeroParam}
          OR est.nombre_completo ILIKE $${numeroParam}
          OR u.codigo_estudiantil ILIKE $${numeroParam}
          OR s.tipo_novedad ILIKE $${numeroParam}
        )`);
        parametros.push(`%${busqueda}%`);
        numeroParam++;
      }

      const clausulaWhere = condiciones.join(' AND ');

      // Query para contar total
      // JOIN por cod_alumno (columna real en BD — no existe estudiante_id en solicitudes)
      const queryContar = `
        SELECT COUNT(*) as total
        FROM solicitudes s
        LEFT JOIN estudiantes est ON est.cod_alumno = s.cod_alumno
        LEFT JOIN usuarios u ON u.id_usuario = est.usuario_id
        WHERE ${clausulaWhere}
      `;

      // Query para listar
      const queryListar = `
        SELECT 
          s.id_solicitud                                              AS id,
          s.codigo_solicitud,
          est.nombre_completo,
          u.codigo_estudiantil,
          s.tipo_novedad                                              AS tipo_solicitud,
          prog.nombre_programa                                        AS programa,
          s.fecha_creacion                                            AS fecha_solicitud,
          s.estado_solicitud                                          AS estado,
          EXTRACT(EPOCH FROM (NOW() - s.fecha_creacion)) / 3600      AS tiempo_pendiente,
          usu_aprobador.nombre_completo                               AS aprobada_por
        FROM solicitudes s
        LEFT JOIN estudiantes est        ON est.cod_alumno   = s.cod_alumno
        LEFT JOIN usuarios u             ON u.id_usuario     = est.usuario_id
        LEFT JOIN programas prog         ON prog.id_programa = est.programa_id
        LEFT JOIN usuarios usu_aprobador ON usu_aprobador.id_usuario = s.updated_by
        WHERE ${clausulaWhere}
        ORDER BY s.${columnaOrdenFinal} ${validarDireccion}
        LIMIT $${numeroParam} OFFSET $${numeroParam + 1}
      `;

      parametros.push(tamanio, offset);

      const [resultadoContar, resultadoListar] = await Promise.all([
        pool.query(queryContar, parametros.slice(0, -2)),
        pool.query(queryListar, parametros),
      ]);

      const total = Number(resultadoContar.rows[0]?.total ?? 0);
      const datos = resultadoListar.rows;

      return { datos, total };
    } catch (error) {
      throw new ErrorBaseDatos(`Error al listar solicitudes: ${(error as Error).message}`);
    }
  }

  // ─── DETALLE COMPLETO DE SOLICITUD ──────────────────────────────────────────
  /**
   * Obtiene el detalle completo de una solicitud para la pantalla de detalle.
   *
   * Tablas involucradas (columnas exactas de la BD):
   *  - solicitudes: id_solicitud, cod_alumno, tipo_novedad, motivo_novedad,
   *    justificacion_detallada, estado_solicitud, periodo_academico,
   *    fecha_creacion, codigo_solicitud, validacion_json, grupo_nuevo_id,
   *    grupo_actual_id, updated_at, updated_by
   *  - estudiantes: cod_alumno, codigo_estudiantil, nombre_completo,
   *    correo_institucional, semestre_actual, promedio_acumulado, jornada
   *  - programas: nombre_programa
   *  - usuarios: nombre_completo (del resolutor)
   *  - grupos_curso: jornada, codigo_grupo (grupo actual y nuevo)
   *
   * @param idSolicitud - id_solicitud (PK)
   * @returns objeto con datos completos o null si no existe
   */
  async obtenerDetalleSolicitud(idSolicitud: number): Promise<any | null> {
    try {
      // ── Bloque principal: solicitud + estudiante + programa + resolutor ──────
      const { rows } = await pool.query(`
        SELECT
          -- Solicitud
          s.id_solicitud,
          s.codigo_solicitud,
          s.tipo_novedad,
          s.motivo_novedad,
          s.justificacion_detallada,
          s.estado_solicitud,
          s.periodo_academico,
          s.fecha_creacion,
          s.updated_at,
          s.validacion_json,
          s.grupo_actual_id,
          s.grupo_nuevo_id,
          -- Estudiante
          e.cod_alumno,
          e.codigo_estudiantil,
          e.nombre_completo,
          COALESCE(e.correo_institucional, e.email_institucional) AS correo_institucional,
          e.semestre_actual,
          e.promedio_acumulado,
          e.jornada                  AS jornada_actual_estudiante,
          -- Programa
          p.nombre_programa,
          -- Quien resolvió (updated_by → usuarios)
          ur.nombre_completo         AS resuelta_por_nombre,
          LOWER(ur.rol::TEXT)        AS resuelta_por_rol
        FROM solicitudes s
        JOIN  estudiantes e  ON e.cod_alumno   = s.cod_alumno
        JOIN  programas   p  ON p.id_programa  = e.programa_id
        LEFT JOIN usuarios ur ON ur.id_usuario = s.updated_by
        WHERE s.id_solicitud = $1
          AND s.deleted_at   IS NULL
      `, [idSolicitud]);

      if (!rows[0]) return null;
      const base = rows[0];

      // ── Grupo actual (si aplica) ─────────────────────────────────────────────
      let grupoActual = null;
      if (base.grupo_actual_id) {
        const { rows: [ga] } = await pool.query(`
          SELECT
            gc.id,
            gc.codigo_grupo,
            gc.jornada,
            gc.dia_semana,
            gc.hora_inicio::TEXT AS hora_inicio,
            gc.hora_fin::TEXT    AS hora_fin,
            c.nombre_curso,
            c.cod_curso
          FROM grupos_curso gc
          JOIN cursos c ON c.id = gc.curso_id
          WHERE gc.id = $1
        `, [base.grupo_actual_id]);
        grupoActual = ga ?? null;
      }

      // ── Grupo nuevo / solicitado (si aplica) ─────────────────────────────────
      let grupoNuevo = null;
      if (base.grupo_nuevo_id) {
        const { rows: [gn] } = await pool.query(`
          SELECT
            gc.id,
            gc.codigo_grupo,
            gc.jornada,
            gc.dia_semana,
            gc.hora_inicio::TEXT AS hora_inicio,
            gc.hora_fin::TEXT    AS hora_fin,
            c.nombre_curso,
            c.cod_curso
          FROM grupos_curso gc
          JOIN cursos c ON c.id = gc.curso_id
          WHERE gc.id = $1
        `, [base.grupo_nuevo_id]);
        grupoNuevo = gn ?? null;
      }

      // ── Documentos adjuntos ──────────────────────────────────────────────────
      // Tabla: documentos_adjuntos
      // Columnas: id, solicitud_id, nombre_archivo, tipo_mime, tamanio_bytes,
      //           url_storage, created_at, created_by
      const { rows: documentos } = await pool.query(`
        SELECT
          d.id                AS id_documento,
          d.nombre_archivo,
          d.tipo_mime,
          d.tamanio_bytes,
          d.url_storage       AS url_archivo,
          d.created_at        AS fecha_subida
        FROM documentos_adjuntos d
        WHERE d.solicitud_id = $1
        ORDER BY d.created_at ASC
      `, [idSolicitud]);

      // ── Historial (desde notificaciones — no hay tabla historial_solicitudes) ─
      // Se construye una línea de tiempo sintética:
      //   1) Radicación: fecha_creacion de solicitud
      //   2) Notificaciones asociadas: orden cronológico
      const { rows: notificaciones } = await pool.query(`
        SELECT
          n.id,
          n.titulo,
          n.mensaje,
          n.created_at,
          COALESCE(u.nombre_completo, 'Sistema') AS actor,
          COALESCE(LOWER(u.rol::TEXT), 'sistema') AS rol_actor
        FROM notificaciones n
        LEFT JOIN usuarios u ON u.id_usuario = n.usuario_id
        WHERE n.solicitud_id = $1
        ORDER BY n.created_at ASC
      `, [idSolicitud]);

      // Construir historial: primero la radicación, luego notificaciones
      const historial = [
        {
          id_evento:      0,
          descripcion:    'Solicitud radicada',
          estado_nuevo:   'PENDIENTE',
          estado_anterior: null,
          fecha:          base.fecha_creacion,
          actor:          base.nombre_completo,
          rol_actor:      'estudiante',
        },
        ...notificaciones.map((n: any) => ({
          id_evento:      n.id,
          descripcion:    n.titulo,
          estado_nuevo:   base.estado_solicitud,
          estado_anterior: null,
          fecha:          n.created_at,
          actor:          n.actor,
          rol_actor:      n.rol_actor,
        })),
      ];

      return {
        // ── Encabezado ────────────────────────────────────────────
        id_solicitud:      base.id_solicitud,
        codigo_solicitud:  base.codigo_solicitud,
        estado_solicitud:  base.estado_solicitud,
        periodo_academico: base.periodo_academico,
        fecha_creacion:    base.fecha_creacion,
        ultima_actualizacion: base.updated_at,
        // ── Estudiante ────────────────────────────────────────────
        estudiante: {
          cod_alumno:          base.cod_alumno,
          codigo_estudiantil:  base.codigo_estudiantil,
          nombre_completo:     base.nombre_completo,
          correo_institucional:base.correo_institucional,
          semestre_actual:     base.semestre_actual,
          promedio_acumulado:  base.promedio_acumulado,  // PAPA
          jornada_actual:      base.jornada_actual_estudiante,
          programa:            base.nombre_programa,
        },
        // ── Detalle solicitud ─────────────────────────────────────
        detalle_solicitud: {
          tipo_novedad:           base.tipo_novedad,
          motivo_novedad:         base.motivo_novedad,
          justificacion_detallada: base.justificacion_detallada,
          validacion_json:        base.validacion_json,
          grupo_actual:           grupoActual,
          grupo_solicitado:       grupoNuevo,
          resuelta_por:           base.resuelta_por_nombre ?? null,
          resuelta_por_rol:       base.resuelta_por_rol    ?? null,
        },
        // ── Documentos ────────────────────────────────────────────
        documentos,
        // ── Historial de cambios ──────────────────────────────────
        historial,
      };
    } catch (error) {
      throw new ErrorBaseDatos(
        `Error al obtener detalle de solicitud: ${(error as Error).message}`
      );
    }
  }
}
