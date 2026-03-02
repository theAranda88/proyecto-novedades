// src/controllers/SolicitudController.ts
// Controlador HTTP para solicitudes de novedad académica

import { Request, Response, NextFunction } from 'express';
import { ServicioSolicitud }                from '../services/SolicitudService';
import { RepositorioUsuario }               from '../repositories/usuario.repository';
import { RespuestaUtil }                    from '../utils/RespuestaUtil';
import { TDatosSolicitud, TActualizarEstado } from '../schemas/solicitud.schema';
import { ErrorNegocio }                     from '../middlewares/errorHandler';
import { pool }                             from '../config/database';

export class ControladorSolicitud {

  private readonly servicioSolicitud: ServicioSolicitud;
  private readonly repoUsuario:       RepositorioUsuario;

  constructor() {
    this.servicioSolicitud   = new ServicioSolicitud();
    this.repoUsuario         = new RepositorioUsuario();
    this.crear               = this.crear.bind(this);
    this.listarMias          = this.listarMias.bind(this);
    this.listarTodas         = this.listarTodas.bind(this);
    this.actualizarEstado    = this.actualizarEstado.bind(this);
  }

  /**
   * POST /api/solicitudes
   * Crea una nueva solicitud de novedad tras ejecutar todas las
   * validaciones del motor (HU_DB §5). Solo ESTUDIANTE puede crearlas.
   * El validacion_json se genera y persiste automáticamente.
   *
   * @acceso ESTUDIANTE
   */
  async crear(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const datos   = req.body as TDatosSolicitud;
      const usuario = req.usuario!;

      // Obtener cod_alumno y id secuencial del estudiante
      const { codAlumno, estudianteSeq } = await this.obtenerDatosEstudiante(usuario.id_usuario);

      const solicitud = await this.servicioSolicitud.crearSolicitud(
        datos,
        usuario.id_usuario,
        estudianteSeq,
        codAlumno,
      );

      RespuestaUtil.exito(
        res,
        'Solicitud de novedad registrada exitosamente. Quedará en revisión por la secretaria académica',
        solicitud,
        201,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/solicitudes/mias
   * Lista las solicitudes del estudiante autenticado.
   * Soporta filtros por ?estado y ?periodo.
   *
   * @acceso ESTUDIANTE
   */
  async listarMias(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usuario  = req.usuario!;
      const estado   = req.query.estado  as string | undefined;
      const periodo  = req.query.periodo as string | undefined;

      const codAlumno = await this.repoUsuario.obtenerCodAlumnoPorUsuarioId(usuario.id_usuario);
      if (!codAlumno) {
        throw new ErrorNegocio('No se encontró el perfil académico del estudiante autenticado', 404);
      }

      const solicitudes = await this.servicioSolicitud.listarSolicitudesEstudiante(
        codAlumno,
        estado,
        periodo,
      );

      RespuestaUtil.exito(res, 'Solicitudes obtenidas exitosamente', solicitudes, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/solicitudes
   * Lista TODAS las solicitudes del sistema.
   * Soporta filtros: ?estado, ?periodo, ?tipo_solicitud.
   *
   * @acceso SECRETARIA, ADMIN
   */
  async listarTodas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const estado        = req.query.estado         as string | undefined;
      const periodo       = req.query.periodo        as string | undefined;
      const tipoSolicitud = req.query.tipo_solicitud as string | undefined;

      const solicitudes = await this.servicioSolicitud.listarTodasLasSolicitudes(
        estado,
        periodo,
        tipoSolicitud,
      );

      RespuestaUtil.exito(res, 'Solicitudes obtenidas exitosamente', solicitudes, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/solicitudes/:id/estado
   * Actualiza el estado de una solicitud (en_revision, aprobada, rechazada).
   * Registra observaciones y la identidad de quien resolvió.
   *
   * @acceso SECRETARIA, ADMIN
   */
  async actualizarEstado(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const solicitudId = Number(req.params['id']);
      if (!Number.isInteger(solicitudId) || solicitudId <= 0) {
        RespuestaUtil.error(res, 'ID de solicitud inválido', 400);
        return;
      }

      const datos       = req.body as TActualizarEstado;
      const aprobadaPor = req.usuario!.id_usuario;

      await this.servicioSolicitud.actualizarEstadoSolicitud(solicitudId, datos, aprobadaPor);

      RespuestaUtil.exito(
        res,
        `Estado de la solicitud actualizado a: ${datos.estado}`,
        null,
        200,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene cod_alumno y el ID secuencial numérico del estudiante
   * a partir del id_usuario. El ID secuencial (ROW_NUMBER) se usa
   * en inscripciones_activas e historial_v2.
   *
   * @param idUsuario - ID del usuario autenticado
   * @returns {{ codAlumno: string, estudianteSeq: number }}
   * @throws {ErrorNegocio} Si no tiene perfil de estudiante
   */
  private async obtenerDatosEstudiante(
    idUsuario: number,
  ): Promise<{ codAlumno: string; estudianteSeq: number }> {
    const resultado = await pool.query<{ cod_alumno: string; seq: number }>(
      `SELECT cod_alumno,
              ROW_NUMBER() OVER (ORDER BY cod_alumno) AS seq
         FROM estudiantes
        WHERE usuario_id = $1
          AND deleted_at IS NULL
        LIMIT 1`,
      [idUsuario],
    );

    if (!resultado.rows[0]) {
      throw new ErrorNegocio(
        'No se encontró el perfil académico del estudiante autenticado',
        404,
      );
    }

    return {
      codAlumno:    resultado.rows[0].cod_alumno,
      estudianteSeq: Number(resultado.rows[0].seq),
    };
  }
}

