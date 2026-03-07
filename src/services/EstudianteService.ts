// src/services/EstudianteService.ts
// Lógica de negocio para perfil del estudiante y gestión de documentos adjuntos.
// Implementa la pre-carga del formulario de solicitud y el procesamiento de archivos.

import * as fs   from 'fs';
import * as path from 'path';
import { RepositorioEstudiante } from '../repositories/estudiante.repository';
import { ErrorNegocio }          from '../middlewares/errorHandler';

/** Tipos MIME permitidos para documentos adjuntos (HU §4.8) */
const TIPOS_MIME_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const;

/** Tamaño máximo por archivo: 5 MB en bytes */
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5 MB

/** Prefijos Base64 permitidos y su tipo MIME correspondiente */
const PREFIJOS_BASE64: Record<string, string> = {
  'data:application/pdf;base64,': 'application/pdf',
  'data:image/jpeg;base64,':      'image/jpeg',
  'data:image/jpg;base64,':       'image/jpg',
  'data:image/png;base64,':       'image/png',
};

export class ServicioEstudiante {

  private readonly repoEstudiante: RepositorioEstudiante;

  constructor() {
    this.repoEstudiante = new RepositorioEstudiante();
  }

  /**
   * Obtiene el perfil académico completo del estudiante para pre-cargar
   * la sección "Información Académica" del formulario de solicitud.
   *
   * Retorna: nombre_completo, cod_alumno, nombre_programa, semestre,
   * jornada, creditos_inscritos, creditos_max_permitidos, estado_academico.
   *
   * @param usuarioId - id_usuario del token JWT del estudiante
   * @returns {Promise<object>} Perfil completo del estudiante
   * @throws {ErrorNegocio} HTTP 404 si no tiene perfil académico registrado
   */
  async obtenerPerfil(usuarioId: number): Promise<object> {
    const perfil = await this.repoEstudiante.buscarPerfilCompleto(usuarioId);
    if (!perfil) {
      throw new ErrorNegocio(
        'No se encontró el perfil académico. Contacte a la secretaría para vincular su cuenta.',
        404,
      );
    }
    return perfil;
  }

  /**
   * Lista los grupos de curso disponibles (cupos > 0) para el periodo indicado.
   * El front usa este endpoint para poblar los dropdowns del formulario:
   * - "Curso Actual" (cambio_curso)
   * - "Nuevo Curso Solicitado" (cambio_curso, adicion_curso, curso_dirigido)
   *
   * @param periodo  - Periodo académico (ej: 2026-1)
   * @param cursoId  - Filtrar por ID de curso (opcional)
   * @param jornada  - Filtrar por jornada (opcional)
   * @returns {Promise<object[]>} Lista de grupos disponibles
   * @throws {ErrorNegocio} HTTP 400 si el formato del periodo es inválido
   */
  async listarGrupos(
    periodo:  string,
    cursoId?: number,
    jornada?: string,
  ): Promise<object[]> {
    const formatoPeriodo = /^\d{4}-[1-3]$/;
    if (!formatoPeriodo.test(periodo)) {
      throw new ErrorNegocio(
        'Formato de periodo inválido. Use: AAAA-N (ej: 2026-1)',
        400,
      );
    }

    return this.repoEstudiante.listarGruposDisponibles(periodo, cursoId, jornada);
  }

  /**
   * Procesa y guarda un documento adjunto enviado en Base64.
   * Valida tipo MIME, tamaño (máx 5MB) y guarda el archivo en disco /uploads/.
   * Registra el documento en la tabla documentos_adjuntos.
   *
   * Flujo:
   * 1. Detectar el tipo MIME desde el prefijo del string Base64
   * 2. Decodificar y calcular el tamaño en bytes
   * 3. Validar que no supere 5MB
   * 4. Guardar el archivo en /uploads/solicitudes/
   * 5. Registrar en la BD (tabla documentos_adjuntos)
   *
   * @param solicitudId   - ID de la solicitud a la que pertenece el adjunto
   * @param nombreArchivo - Nombre original del archivo (ej: "Horario_2026.pdf")
   * @param base64Data    - Contenido del archivo en Base64 (con prefijo data:tipo;base64,)
   * @param creadoPor     - id_usuario del estudiante que adjunta
   * @returns {Promise<{ id: number; url: string; nombre: string }>}
   * @throws {ErrorNegocio} HTTP 422 si el tipo o tamaño no es válido
   */
  async procesarAdjunto(
    solicitudId:   number,
    nombreArchivo: string,
    base64Data:    string,
    creadoPor:     number,
  ): Promise<{ id: number; url: string; nombre: string }> {

    // 1. Detectar tipo MIME desde el prefijo Base64
    const tipoMime = this.detectarTipoMime(base64Data);
    if (!tipoMime) {
      throw new ErrorNegocio(
        `Tipo de archivo no permitido. Se aceptan: PDF, JPG, PNG`,
        422,
      );
    }

    // 2. Extraer el contenido Base64 puro (sin el prefijo data:...)
    const base64Puro = base64Data.split(',')[1];
    if (!base64Puro) {
      throw new ErrorNegocio('Formato de archivo Base64 inválido', 422);
    }

    // 3. Decodificar y calcular tamaño en bytes
    const buffer = Buffer.from(base64Puro, 'base64');
    if (buffer.byteLength > TAMANO_MAXIMO_BYTES) {
      const tamanoMB = (buffer.byteLength / (1024 * 1024)).toFixed(2);
      throw new ErrorNegocio(
        `El archivo supera el límite de 5MB. Tamaño actual: ${tamanoMB}MB`,
        422,
      );
    }

    // 4. Guardar en disco — /uploads/solicitudes/<solicitudId>/
    const rutaDirectorio = path.join(process.cwd(), 'uploads', 'solicitudes', String(solicitudId));
    if (!fs.existsSync(rutaDirectorio)) {
      fs.mkdirSync(rutaDirectorio, { recursive: true });
    }

    // Sanear el nombre del archivo y agregar timestamp para evitar colisiones
    const nombreSaneado  = this.sanearNombreArchivo(nombreArchivo);
    const nombreFinal    = `${Date.now()}_${nombreSaneado}`;
    const rutaCompleta   = path.join(rutaDirectorio, nombreFinal);

    fs.writeFileSync(rutaCompleta, buffer);

    // URL relativa que el front puede usar para descargar
    const urlRelativa = `/uploads/solicitudes/${solicitudId}/${nombreFinal}`;

    // 5. Registrar en BD
    const idDocumento = await this.repoEstudiante.guardarDocumentoAdjunto({
      solicitudId,
      nombreArchivo: nombreFinal,
      tipoMime,
      tamanioBytes:  buffer.byteLength,
      urlStorage:    urlRelativa,
      creadoPor,
    });

    return { id: idDocumento, url: urlRelativa, nombre: nombreFinal };
  }

  /**
   * Detecta el tipo MIME a partir del prefijo del string Base64.
   * Solo acepta tipos definidos en PREFIJOS_BASE64.
   *
   * @param base64Data - String Base64 con prefijo
   * @returns {string | null} Tipo MIME o null si no es válido
   */
  private detectarTipoMime(base64Data: string): string | null {
    for (const [prefijo, tipo] of Object.entries(PREFIJOS_BASE64)) {
      if (base64Data.startsWith(prefijo)) {
        return tipo;
      }
    }
    return null;
  }

  /**
   * Sanea el nombre de un archivo eliminando caracteres peligrosos.
   * Previene path traversal y caracteres inválidos en el sistema de archivos.
   *
   * @param nombre - Nombre original del archivo
   * @returns {string} Nombre saneado
   */
  private sanearNombreArchivo(nombre: string): string {
    return nombre
      .replace(/[^a-zA-Z0-9._\-]/g, '_')  // solo alfanumérico, punto, guiones
      .replace(/\.{2,}/g, '.')              // evitar path traversal (..)
      .substring(0, 100);                   // máximo 100 caracteres
  }
}

