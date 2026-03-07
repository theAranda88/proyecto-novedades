// src/repositories/estudiante.repository.ts
// Acceso a datos del perfil académico del estudiante y catálogo de grupos.

import { pool }           from '../config/database';
import { ErrorBaseDatos } from '../middlewares/errorHandler';

/** Perfil académico completo del estudiante para pre-cargar el formulario */
type FilaPerfilEstudiante = {
  cod_alumno:              string;
  nombre_completo:         string;
  email_institucional:     string;
  semestre:                number;
  nombre_programa:         string;
  jornada:                 string;
  creditos_inscritos:      number;
  creditos_max_permitidos: number;
  estado_academico:        string;
  matricula_activa:        boolean;
};

/** Grupo de curso para poblar los dropdowns del formulario */
type FilaGrupoCurso = {
  id:                number;
  codigo_grupo:      string;
  nombre_curso:      string;
  cod_curso:         string;
  jornada:           string;
  dia_semana:        string;
  hora_inicio:       string;
  hora_fin:          string;
  docente:           string;
  aula:              string | null;
  cupo_maximo:       number;
  cupos_ocupados:    number;
  cupos_disponibles: number;
  periodo:           string;
};

export class RepositorioEstudiante {

  /**
   * Obtiene el perfil académico completo del estudiante autenticado.
   * Hace JOIN con la tabla programas para incluir nombre_programa.
   * Aplica soft delete (deleted_at IS NULL).
   *
   * Se usa para pre-cargar la sección "Información Académica" del formulario
   * sin que el estudiante tenga que ingresar sus datos manualmente.
   *
   * @param usuarioId - id_usuario del token JWT
   * @returns {Promise<FilaPerfilEstudiante | null>} Perfil o null si no existe
   * @throws {ErrorBaseDatos} Si falla la consulta SQL
   */
  async buscarPerfilCompleto(usuarioId: number): Promise<FilaPerfilEstudiante | null> {
    try {
      const resultado = await pool.query<FilaPerfilEstudiante>(
        `SELECT
            e.cod_alumno,
            e.nombre_completo,
            e.email_institucional,
            e.semestre,
            COALESCE(p.nombre_programa, 'Sin programa asignado') AS nombre_programa,
            COALESCE(e.jornada, 'manana')                        AS jornada,
            COALESCE(e.creditos_inscritos, 0)                    AS creditos_inscritos,
            COALESCE(e.creditos_max_permitidos, 20)              AS creditos_max_permitidos,
            COALESCE(e.estado_academico, 'normal')               AS estado_academico,
            e.matricula_activa
           FROM estudiantes e
      LEFT JOIN programas p ON p.id_programa = e.id_programa
          WHERE e.usuario_id = $1
            AND e.deleted_at IS NULL
          LIMIT 1`,
        [usuarioId],
      );
      return resultado.rows[0] ?? null;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al obtener perfil del estudiante: ${(error as Error).message}`);
    }
  }

  /**
   * Lista los grupos de curso disponibles con cupos > 0.
   * Se usa para poblar los dropdowns "Curso actual" y "Nuevo curso solicitado"
   * del formulario de solicitud.
   *
   * Filtros opcionales:
   * - periodo:  Filtra por periodo académico (ej: 2026-1)
   * - curso_id: Filtra por ID de curso específico
   * - jornada:  Filtra por jornada (manana, tarde, noche)
   *
   * @param periodo  - Periodo académico (requerido)
   * @param cursoId  - ID del curso (opcional)
   * @param jornada  - Jornada (opcional)
   * @returns {Promise<FilaGrupoCurso[]>} Lista de grupos disponibles
   * @throws {ErrorBaseDatos} Si falla la consulta SQL
   */
  async listarGruposDisponibles(
    periodo:  string,
    cursoId?: number,
    jornada?: string,
  ): Promise<FilaGrupoCurso[]> {
    try {
      const params: (string | number)[] = [periodo];
      const condiciones: string[] = [
        'g.periodo = $1',
        'g.activo  = TRUE',
      ];

      if (cursoId) {
        params.push(cursoId);
        condiciones.push(`g.curso_id = $${params.length}`);
      }

      if (jornada) {
        params.push(jornada);
        condiciones.push(`g.jornada = $${params.length}`);
      }

      const resultado = await pool.query<FilaGrupoCurso>(
        `SELECT
            g.id,
            g.codigo_grupo,
            c.nombre_curso,
            c.cod_curso,
            g.jornada,
            g.dia_semana,
            g.hora_inicio::TEXT AS hora_inicio,
            g.hora_fin::TEXT    AS hora_fin,
            g.docente,
            g.aula,
            g.cupo_maximo,
            g.cupos_ocupados,
            (g.cupo_maximo - g.cupos_ocupados) AS cupos_disponibles,
            g.periodo
           FROM grupos_curso g
           JOIN cursos c ON c.id = g.curso_id
          WHERE ${condiciones.join(' AND ')}
          ORDER BY c.nombre_curso, g.jornada, g.codigo_grupo`,
        params,
      );
      return resultado.rows;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al listar grupos disponibles: ${(error as Error).message}`);
    }
  }

  /**
   * Guarda el registro de un documento adjunto en la tabla documentos_adjuntos.
   * Se llama después de guardar el archivo en disco desde el service.
   *
   * @param datos - Datos del documento a registrar
   * @returns {Promise<number>} ID del documento creado
   * @throws {ErrorBaseDatos} Si falla la inserción
   */
  async guardarDocumentoAdjunto(datos: {
    solicitudId:   number;
    nombreArchivo: string;
    tipoMime:      string;
    tamanioBytes:  number;
    urlStorage:    string;
    creadoPor:     number;
  }): Promise<number> {
    try {
      const resultado = await pool.query<{ id: number }>(
        `INSERT INTO documentos_adjuntos
            (solicitud_id, nombre_archivo, tipo_mime, tamanio_bytes, url_storage, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          datos.solicitudId,
          datos.nombreArchivo,
          datos.tipoMime,
          datos.tamanioBytes,
          datos.urlStorage,
          datos.creadoPor,
        ],
      );
      return resultado.rows[0].id;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al guardar documento adjunto: ${(error as Error).message}`);
    }
  }

  /**
   * Lista los documentos adjuntos de una solicitud.
   *
   * @param solicitudId - ID de la solicitud
   * @returns {Promise<object[]>} Lista de documentos
   * @throws {ErrorBaseDatos} Si falla la consulta
   */
  async listarAdjuntosPorSolicitud(solicitudId: number): Promise<object[]> {
    try {
      const resultado = await pool.query(
        `SELECT id, nombre_archivo, tipo_mime, tamanio_bytes, url_storage, created_at
           FROM documentos_adjuntos
          WHERE solicitud_id = $1
          ORDER BY created_at ASC`,
        [solicitudId],
      );
      return resultado.rows;
    } catch (error) {
      throw new ErrorBaseDatos(`Error al listar adjuntos: ${(error as Error).message}`);
    }
  }
}

