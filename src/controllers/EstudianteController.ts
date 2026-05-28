// src/controllers/EstudianteController.ts
// Controlador HTTP para endpoints del estudiante:
// - Perfil académico (pre-carga del formulario)
// - Grupos disponibles (dropdowns del formulario)
// - Adjunto de documentos

import { Request, Response, NextFunction } from 'express';
import { ServicioEstudiante }              from '../services/EstudianteService';
import { RespuestaUtil }                   from '../utils/RespuestaUtil';

export class ControladorEstudiante {

  private readonly servicioEstudiante: ServicioEstudiante;

  constructor() {
    this.servicioEstudiante = new ServicioEstudiante();
    this.obtenerPerfil      = this.obtenerPerfil.bind(this);
    this.obtenerMateriasMatriculadas = this.obtenerMateriasMatriculadas.bind(this);
    this.listarGrupos       = this.listarGrupos.bind(this);
    this.subirAdjunto       = this.subirAdjunto.bind(this);
  }

  /**
   * GET /api/estudiantes/perfil
   * Devuelve el perfil académico completo del estudiante autenticado.
   * El front usa esta respuesta para pre-cargar la sección
   * "Información Académica" del formulario (nombre, código, programa, semestre).
   *
   * @acceso ESTUDIANTE
   */
  async obtenerPerfil(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usuario = req.usuario!;
      const perfil  = await this.servicioEstudiante.obtenerPerfil(usuario.id_usuario);

      RespuestaUtil.exito(
        res,
        'Perfil académico obtenido exitosamente',
        perfil,
        200,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/estudiantes/materias
   * GET /api/estudiantes/materias-matriculadas
   * Devuelve la carga académica vigente del estudiante autenticado.
   *
   * @acceso ESTUDIANTE
   */
  async obtenerMateriasMatriculadas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usuario  = req.usuario!;

      if (
        req.params['codigo_estudiantil']
        && usuario.codigo_estudiantil
        && req.params['codigo_estudiantil'] !== usuario.codigo_estudiantil
      ) {
        RespuestaUtil.error(
          res,
          'El código estudiantil solicitado no coincide con el usuario autenticado',
          403,
        );
        return;
      }

      const materias = await this.servicioEstudiante.obtenerMateriasMatriculadas(usuario.id_usuario);

      RespuestaUtil.exito(
        res,
        materias.length > 0
          ? `${materias.length} materia(s) matriculada(s) encontradas`
          : 'El estudiante no tiene materias matriculadas en este momento',
        materias,
        200,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/grupos?periodo=2026-1&curso_id=1&jornada=manana
   * Lista los grupos de curso disponibles (cupos > 0) para poblar
   * los dropdowns "Curso Actual" y "Nuevo Curso Solicitado" del formulario.
   *
   * Query params:
   * - periodo (requerido): Periodo académico en formato AAAA-N
   * - curso_id (opcional): Filtrar por ID de curso
   * - jornada (opcional): Filtrar por jornada (manana/tarde/noche)
   *
   * @acceso ESTUDIANTE, SECRETARIA, ADMIN
   */
  async listarGrupos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const periodo = req.query.periodo as string;

      if (!periodo) {
        RespuestaUtil.error(
          res,
          'El parámetro "periodo" es obligatorio. Ej: ?periodo=2026-1',
          400,
        );
        return;
      }

      const cursoId = req.query.curso_id
        ? parseInt(req.query.curso_id as string, 10)
        : undefined;

      if (req.query.curso_id && (isNaN(cursoId!) || cursoId! <= 0)) {
        RespuestaUtil.error(res, 'El parámetro "curso_id" debe ser un número entero positivo', 400);
        return;
      }

      const jornada = req.query.jornada as string | undefined;

      const grupos = await this.servicioEstudiante.listarGrupos(periodo, cursoId, jornada);

      RespuestaUtil.exito(
        res,
        grupos.length > 0
          ? `${grupos.length} grupo(s) disponible(s) para el periodo ${periodo}`
          : `No hay grupos disponibles con los filtros indicados para el periodo ${periodo}`,
        grupos,
        200,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/estudiantes/solicitudes/:id/adjunto
   * Recibe un archivo en Base64 y lo asocia a una solicitud existente.
   * Valida: tipo MIME (PDF/JPG/PNG), tamaño máximo 5MB.
   *
   * Body esperado:
   * {
   *   "nombre_archivo": "Horario_Actual_2026.pdf",
   *   "archivo_base64": "data:application/pdf;base64,JVBERi0xLjQ..."
   * }
   *
   * @acceso ESTUDIANTE
   */
  async subirAdjunto(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const solicitudId = parseInt(String(req.params['id']), 10);
      if (isNaN(solicitudId) || solicitudId <= 0) {
        RespuestaUtil.error(res, 'ID de solicitud inválido', 400);
        return;
      }

      const { nombre_archivo, archivo_base64 } = req.body as {
        nombre_archivo: string;
        archivo_base64: string;
      };

      if (!nombre_archivo) {
        RespuestaUtil.error(res, 'El campo "nombre_archivo" es obligatorio', 400);
        return;
      }

      if (!archivo_base64) {
        RespuestaUtil.error(res, 'El campo "archivo_base64" es obligatorio', 400);
        return;
      }

      const usuario   = req.usuario!;
      const resultado = await this.servicioEstudiante.procesarAdjunto(
        solicitudId,
        nombre_archivo,
        archivo_base64,
        usuario.id_usuario,
      );

      RespuestaUtil.exito(
        res,
        'Documento adjunto guardado correctamente',
        resultado,
        201,
      );
    } catch (error) {
      next(error);
    }
  }
}

