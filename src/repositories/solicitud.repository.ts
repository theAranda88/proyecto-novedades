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

      // Mapear tipo_solicitud al formato del CHECK constraint original si aplica
      // La tabla tiene: ADICION, CAMBIO_JORNADA, CURSO_DIRIGIDO + nuevos (sin restricción)
      const tipoMapeado = datos.tipoSolicitud;

      // Buscar id_seccion_destino desde el grupo_nuevo_id si aplica
      let idSeccionDestino = 1; // fallback — la columna es NOT NULL en el esquema original
      if (datos.grupoNuevoId) {
        // Intentar mapear grupos_curso.id → secciones.id_seccion por compatibilidad
        idSeccionDestino = datos.grupoNuevoId;
      }

      const resultado = await pool.query<FilaSolicitud>(
        `INSERT INTO solicitudes
            (cod_alumno, tipo_novedad, id_seccion_destino, id_seccion_origen,
             motivo_novedad, justificacion_detallada,
             periodo_academico, estado_solicitud,
             codigo_solicitud, validacion_json, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDIENTE', $8, $9, $10)
         RETURNING id_solicitud AS id, codigo_solicitud,
                   estado_solicitud AS estado,
                   tipo_novedad     AS tipo_solicitud,
                   validacion_json, fecha_creacion AS created_at`,
        [
          datos.codAlumno,
          tipoMapeado.toUpperCase().replace('ADICION_CURSO','ADICION').replace('CAMBIO_CURSO','CAMBIO_JORNADA'),
          idSeccionDestino,
          datos.grupoActualId,
          `${datos.tipoSolicitud} - periodo ${datos.periodoAcademico}`,
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
}

