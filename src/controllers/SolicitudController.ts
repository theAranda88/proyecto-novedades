// src/controllers/SolicitudController.ts
// Controlador HTTP para solicitudes de novedad académica

import { Request, Response, NextFunction } from 'express';
import { ServicioSolicitud }                from '../services/SolicitudService';
import { ServicioEstudiante }               from '../services/EstudianteService';
import { RepositorioUsuario }               from '../repositories/usuario.repository';
import { RespuestaUtil }                    from '../utils/RespuestaUtil';
import { TDatosSolicitud, TActualizarEstado } from '../schemas/solicitud.schema';
import { ErrorNegocio }                     from '../middlewares/errorHandler';
import { pool }                             from '../config/database';

export class ControladorSolicitud {

  private readonly servicioSolicitud: ServicioSolicitud;
  private readonly servicioEstudiante: ServicioEstudiante;
  private readonly repoUsuario:       RepositorioUsuario;

  constructor() {
    this.servicioSolicitud   = new ServicioSolicitud();
    this.servicioEstudiante  = new ServicioEstudiante();
    this.repoUsuario         = new RepositorioUsuario();
    this.crear               = this.crear.bind(this);
    this.listarMias          = this.listarMias.bind(this);
    this.listarTodas         = this.listarTodas.bind(this);
    this.actualizarEstado    = this.actualizarEstado.bind(this);
    this.obtenerPorId        = this.obtenerPorId.bind(this);
    this.listarConFiltros    = this.listarConFiltros.bind(this);
    this.obtenerDetalle      = this.obtenerDetalle.bind(this);
  }

  /**
   * POST /api/solicitudes
   * Crea una nueva solicitud de novedad tras ejecutar todas las
   * validaciones del motor (HU_DB §5). Solo ESTUDIANTE puede crearlas.
   * El validacion_json se genera y persiste automáticamente.
   *
   * Si el body incluye `adjunto_base64` y `nombre_adjunto`, el sistema
   * procesa el archivo (PDF/JPG/PNG máx 5MB) y lo asocia a la solicitud.
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
      ) as { id: number; [key: string]: unknown };

      // Procesar adjunto Base64 si viene en el body (opcional)
      let adjunto: object | null = null;
      if (datos.adjunto_base64 && datos.nombre_adjunto) {
        adjunto = await this.servicioEstudiante.procesarAdjunto(
          solicitud.id,
          datos.nombre_adjunto,
          datos.adjunto_base64,
          usuario.id_usuario,
        );
      }

      RespuestaUtil.exito(
        res,
        'Solicitud enviada correctamente. Quedará en revisión por la secretaría académica',
        { ...solicitud, adjunto },
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
   * GET /api/solicitudes/:id
   * Obtiene los detalles completos de una solicitud específica.
   * El estudiante solo puede ver sus propias solicitudes.
   * SECRETARIA y ADMIN pueden ver cualquier solicitud.
   *
   * @acceso ESTUDIANTE (su propia solicitud), SECRETARIA, ADMIN
   */
  async obtenerPorId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const usuario = req.usuario!;
      const solicitudId = Number(id);

      if (isNaN(solicitudId)) {
        RespuestaUtil.error(res, 'ID de solicitud inválido', 400);
        return;
      }

      // Obtener la solicitud
      const solicitud = await this.servicioSolicitud.obtenerSolicitudPorId(solicitudId);

      if (!solicitud) {
        RespuestaUtil.error(res, 'Solicitud no encontrada', 404);
        return;
      }

      // Validar permiso: ESTUDIANTE solo ve sus propias solicitudes
      if (usuario.rol.toUpperCase() === 'ESTUDIANTE') {
        const { codAlumno } = await this.obtenerDatosEstudiante(usuario.id_usuario);
        if ((solicitud as any).cod_alumno !== codAlumno) {
          RespuestaUtil.error(res, 'No tiene permisos para ver esta solicitud', 403);
          return;
        }
      }

      RespuestaUtil.exito(res, 'Solicitud obtenida exitosamente', solicitud, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/solicitudes/panel
   * Lista solicitudes con filtros, búsqueda y paginación para el panel de Secretaría.
   * Solo SECRETARIA y ADMIN pueden acceder.
   *
   * Query params:
   * - estado: Filtro por estado (pendiente, en_revision, aprobada, rechazada)
   * - programa_id: Filtro por programa
   * - busqueda: Busca por nombre, código, ID solicitud
   * - pagina: Número de página (default: 1)
   * - tamanio: Registros por página (default: 10, max: 50)
   * - ordenar: Campo para ordenar (default: created_at)
   * - direccion: ASC o DESC (default: DESC)
   *
   * @acceso SECRETARIA, ADMIN
   */
  async listarConFiltros(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const estado = req.query.estado as string | undefined;
      const programaId = req.query.programa_id ? Number(req.query.programa_id) : undefined;
      const busqueda = req.query.busqueda as string | undefined;
      const pagina = req.query.pagina ? Number(req.query.pagina) : 1;
      const tamanio = req.query.tamanio ? Number(req.query.tamanio) : 10;
      const ordenar = req.query.ordenar as string | undefined;
      const direccion = req.query.direccion as string | undefined;

      const resultado = await this.servicioSolicitud.listarSolicitudesConFiltros({
        estado,
        programaId,
        busqueda,
        pagina,
        tamanio,
        ordenar,
        direccion,
      });

      RespuestaUtil.exito(
        res,
        'Solicitudes obtenidas correctamente',
        {
          ...resultado,
          mostrando: `${(resultado.pagina - 1) * resultado.tamanio + 1}-${Math.min(resultado.pagina * resultado.tamanio, resultado.total)} de ${resultado.total}`,
        },
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

  /**
   * GET /api/solicitudes/:id/detalle
   * Retorna el detalle completo de una solicitud para la pantalla "Detalle de Solicitud".
   *
   * Incluye en una sola respuesta:
   *  - Datos del estudiante (nombre, código, programa, semestre, PAPA, correo)
   *  - Datos de la solicitud (tipo, justificación, grupos actual/solicitado)
   *  - Documentos adjuntos[]
   *  - Historial de cambios[]
   *
   * Control de acceso:
   *  - SECRETARIA / ADMIN → cualquier solicitud
   *  - ESTUDIANTE → solo sus propias solicitudes
   *
   * @acceso ESTUDIANTE (propias) | SECRETARIA | ADMIN
   */
  async obtenerDetalle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idSolicitud = Number(req.params.id);

      if (isNaN(idSolicitud) || idSolicitud <= 0) {
        RespuestaUtil.error(res, 'ID de solicitud inválido — debe ser un número entero positivo', 400);
        return;
      }

      const detalle = await this.servicioSolicitud.obtenerDetalle(
        idSolicitud,
        req.usuario!.id_usuario,
        req.usuario!.rol,
      );

      RespuestaUtil.exito(res, 'Detalle de solicitud obtenido correctamente', detalle, 200);
    } catch (error) {
      next(error);
    }
  }
}

