// src/services/SolicitudService.ts
// Motor de validaciones y lógica de negocio para solicitudes de novedad.
// Implementa HU_DB §5 completa con validacion_json obligatorio.

import { RepositorioSolicitud }            from '../repositories/solicitud.repository';
import { RepositorioUsuario }              from '../repositories/usuario.repository';
import { TDatosSolicitud, TActualizarEstado } from '../schemas/solicitud.schema';
import { ErrorNegocio }                    from '../middlewares/errorHandler';

/** Resultado de una validación individual para el validacion_json */
type CheckValidacion = {
  nombre:    string;
  resultado: boolean;
  detalle:   string;
};

/** Objeto completo que se guarda en validacion_json (HU_DB §4.7 / §5) */
type ResultadoValidacion = {
  timestamp:      string;
  tipo_solicitud: string;
  aprobado:       boolean;
  validaciones:   CheckValidacion[];
};

export class ServicioSolicitud {

  private readonly repoSolicitud: RepositorioSolicitud;
  private readonly repoUsuario:   RepositorioUsuario;

  constructor() {
    this.repoSolicitud = new RepositorioSolicitud();
    this.repoUsuario   = new RepositorioUsuario();
  }

  /**
   * Crea una nueva solicitud de novedad académica.
   * Ejecuta TODAS las validaciones del tipo correspondiente (HU_DB §5)
   * y guarda el resultado en validacion_json antes de persistir.
   *
   * @param datos             - Datos de la solicitud validados por Zod
   * @param idUsuario         - ID del usuario autenticado (para created_by)
   * @param estudianteSeq     - ID secuencial del estudiante (ROW_NUMBER en BD)
   * @param codAlumno         - Código del alumno (PK en tabla solicitudes)
   * @returns {Promise<object>} La solicitud creada con validacion_json
   * @throws {ErrorNegocio} Si alguna validación de negocio falla
   */
  async crearSolicitud(
    datos:          TDatosSolicitud,
    idUsuario:      number,
    estudianteSeq:  number,
    codAlumno:      string,
  ): Promise<object> {
    const perfil = await this.repoUsuario.buscarEstudiantePorUsuarioId(idUsuario);
    if (!perfil) {
      throw new ErrorNegocio('No se encontró el perfil académico del estudiante', 404);
    }

    // Validar límite de 3 solicitudes activas por periodo (HU_DB §5)
    const totalSolicitudes = await this.repoSolicitud.contarSolicitudesActivas(
      codAlumno,
      datos.periodo_academico,
    );
    if (totalSolicitudes >= 3) {
      throw new ErrorNegocio(
        `Ha alcanzado el máximo de 3 solicitudes activas para el periodo ${datos.periodo_academico}`,
        422,
      );
    }

    let validacionJson: ResultadoValidacion;

    switch (datos.tipo_solicitud) {
      case 'cambio_curso':
        validacionJson = await this.validarCambioCurso(
          estudianteSeq,
          datos.grupo_actual_id!,
          datos.grupo_nuevo_id!,
          datos.periodo_academico,
          perfil.estado_academico,
        );
        break;

      case 'cambio_jornada':
        validacionJson = await this.validarCambioJornada(
          estudianteSeq,
          perfil.jornada,
          datos.jornada_nueva!,
          datos.periodo_academico,
        );
        break;

      case 'adicion_curso':
        validacionJson = await this.validarAdicionCurso(
          estudianteSeq,
          datos.grupo_nuevo_id!,
          datos.periodo_academico,
          perfil.creditos_inscritos,
          perfil.creditos_max_permitidos,
        );
        break;

      case 'curso_dirigido':
        validacionJson = await this.validarCursoDirigido(
          estudianteSeq,
          datos.grupo_nuevo_id!,
          perfil.estado_academico,
          datos.periodo_academico,
        );
        break;

      default:
        throw new ErrorNegocio('Tipo de solicitud no reconocido', 400);
    }

    if (!validacionJson.aprobado) {
      const fallidas = validacionJson.validaciones
        .filter(v => !v.resultado)
        .map(v => v.detalle)
        .join(' | ');
      throw new ErrorNegocio(`Solicitud rechazada por validaciones: ${fallidas}`, 422);
    }

    return this.repoSolicitud.crearSolicitud({
      codAlumno:        codAlumno,
      tipoSolicitud:    datos.tipo_solicitud,
      grupoActualId:    datos.grupo_actual_id ?? null,
      grupoNuevoId:     datos.grupo_nuevo_id  ?? null,
      jornadaActual:    datos.jornada_actual  ?? null,
      jornadaNueva:     datos.jornada_nueva   ?? null,
      justificacion:    datos.justificacion,
      periodoAcademico: datos.periodo_academico,
      validacionJson:   validacionJson,
      createdBy:        idUsuario,
    });
  }

  /**
   * Ejecuta todas las validaciones para CAMBIO_CURSO (HU_DB §5.1).
   * Verifica en orden: inscripción activa → estado materia → estado académico
   * → cupos disponibles → cruce de horario.
   *
   * @regla HU_DB §5.1 — Cambio de Curso
   * @param estudianteId   - ID del estudiante
   * @param grupoActualId  - ID del grupo actual
   * @param grupoNuevoId   - ID del grupo solicitado
   * @param periodo        - Periodo académico
   * @param estadoAcademico - Estado académico del estudiante (normal/bajo_rendimiento/suspendido)
   * @returns {Promise<ResultadoValidacion>} Objeto con todos los chequeos
   */
  private async validarCambioCurso(
    estudianteId:   number,
    grupoActualId:  number,
    grupoNuevoId:   number,
    periodo:        string,
    estadoAcademico: string,
  ): Promise<ResultadoValidacion> {
    const validaciones: CheckValidacion[] = [];

    // Chequeo 1: El estudiante debe estar inscrito en el grupo actual
    const inscrito = await this.repoSolicitud.estaInscrito(estudianteId, grupoActualId, periodo);
    validaciones.push({
      nombre:    'inscripcion_activa',
      resultado: inscrito,
      detalle:   inscrito
        ? 'Estudiante inscrito en el grupo actual'
        : `No está inscrito en el grupo ${grupoActualId} para el periodo ${periodo}`,
    });

    // Chequeo 2: La materia no debe tener estado 'reprobada' en el periodo actual
    const grupoActual = await this.repoSolicitud.buscarGrupoPorId(grupoActualId);
    let noReprobadaActual = true;
    if (grupoActual) {
      const historial = await this.repoSolicitud.buscarHistorialPorCurso(estudianteId, grupoActual.curso_id);
      const enPeriodo = historial.find(h => h.estado === 'reprobada');
      noReprobadaActual = !enPeriodo;
    }
    validaciones.push({
      nombre:    'estado_materia_no_reprobada',
      resultado: noReprobadaActual,
      detalle:   noReprobadaActual
        ? 'La materia no está reprobada en el periodo actual'
        : 'No se permite cambio de curso en una materia con estado reprobada',
    });

    // Chequeo 3: Estado académico del estudiante debe ser 'normal'
    const estadoNormal = estadoAcademico === 'normal';
    validaciones.push({
      nombre:    'estado_academico_normal',
      resultado: estadoNormal,
      detalle:   estadoNormal
        ? 'Estado académico normal'
        : `Estado académico ${estadoAcademico} no permite solicitud de cambio de curso`,
    });

    // Chequeo 4: Cupos disponibles en el grupo nuevo
    const grupoNuevo = await this.repoSolicitud.buscarGrupoPorId(grupoNuevoId);
    const hayCupos = grupoNuevo
      ? grupoNuevo.cupos_ocupados < grupoNuevo.cupo_maximo
      : false;
    validaciones.push({
      nombre:    'cupos_disponibles',
      resultado: hayCupos,
      detalle:   hayCupos
        ? `Cupos disponibles: ${grupoNuevo ? grupoNuevo.cupo_maximo - grupoNuevo.cupos_ocupados : 0}`
        : 'No hay cupos disponibles en el grupo solicitado',
    });

    // Chequeo 5: No debe haber cruce de horario (Teorema de Allen, HU_DB §5.1)
    let sinCruce = true;
    if (grupoNuevo) {
      const horariosActuales = await this.repoSolicitud.listarHorariosInscripciones(estudianteId, periodo);
      // Excluir el grupo actual (se está reemplazando)
      const horariosRelevantes = horariosActuales.filter(h => h.grupo_id !== grupoActualId);
      sinCruce = !horariosRelevantes.some(h =>
        this.existeCruceHorario(
          h.dia_semana, h.hora_inicio, h.hora_fin,
          grupoNuevo.dia_semana, grupoNuevo.hora_inicio, grupoNuevo.hora_fin,
        ),
      );
    }
    validaciones.push({
      nombre:    'sin_cruce_horario',
      resultado: sinCruce,
      detalle:   sinCruce
        ? 'Sin cruce de horario con materias inscritas'
        : 'El horario del grupo solicitado se cruza con una materia ya inscrita',
    });

    return this.construirResultado('cambio_curso', validaciones);
  }

  /**
   * Ejecuta todas las validaciones para CAMBIO_JORNADA (HU_DB §5.2).
   * Verifica: jornada diferente → grupos disponibles → cupos en nueva jornada.
   *
   * @regla HU_DB §5.2 — Cambio de Jornada
   * @param estudianteId - ID del estudiante
   * @param jornadaActual - Jornada actual del estudiante
   * @param jornadaNueva  - Jornada solicitada
   * @param periodo       - Periodo académico
   * @returns {Promise<ResultadoValidacion>} Objeto con todos los chequeos
   */
  private async validarCambioJornada(
    estudianteId: number,
    jornadaActual: string,
    jornadaNueva:  string,
    periodo:       string,
  ): Promise<ResultadoValidacion> {
    const validaciones: CheckValidacion[] = [];

    // Chequeo 1: La jornada nueva debe ser diferente a la actual
    const jornadaDiferente = jornadaActual !== jornadaNueva;
    validaciones.push({
      nombre:    'jornada_diferente',
      resultado: jornadaDiferente,
      detalle:   jornadaDiferente
        ? `Cambio de jornada de ${jornadaActual} a ${jornadaNueva} es válido`
        : `La jornada solicitada (${jornadaNueva}) es igual a la actual`,
    });

    // Chequeo 2 y 3: Existen grupos en la nueva jornada con cupos disponibles
    const gruposDisponibles = await this.repoSolicitud.existenGruposEnJornada(
      estudianteId,
      jornadaNueva,
      periodo,
    );
    validaciones.push({
      nombre:    'grupos_jornada_disponibles',
      resultado: gruposDisponibles,
      detalle:   gruposDisponibles
        ? `Existen grupos con cupos disponibles en jornada ${jornadaNueva}`
        : `No hay grupos disponibles con cupos en jornada ${jornadaNueva} para todas las materias inscritas`,
    });

    return this.construirResultado('cambio_jornada', validaciones);
  }

  /**
   * Ejecuta todas las validaciones para ADICION_CURSO (HU_DB §5.3).
   * Verifica: límite créditos → cupos → cruce horario → no aprobada previamente.
   *
   * @regla HU_DB §5.3 — Adición de Curso
   * @param estudianteId          - ID del estudiante
   * @param grupoNuevoId          - ID del grupo a adicionar
   * @param periodo               - Periodo académico
   * @param creditosInscritos     - Créditos actualmente inscritos
   * @param creditosMaxPermitidos - Límite de créditos del estudiante
   * @returns {Promise<ResultadoValidacion>} Objeto con todos los chequeos
   */
  private async validarAdicionCurso(
    estudianteId:          number,
    grupoNuevoId:          number,
    periodo:               string,
    creditosInscritos:     number,
    creditosMaxPermitidos: number,
  ): Promise<ResultadoValidacion> {
    const validaciones: CheckValidacion[] = [];

    const grupoNuevo = await this.repoSolicitud.buscarGrupoPorId(grupoNuevoId);

    // Chequeo 1: Créditos inscritos + créditos del nuevo curso ≤ creditos_max_permitidos
    const creditosNuevoCurso = grupoNuevo?.creditos ?? 0;
    const totalCreditosTras  = creditosInscritos + creditosNuevoCurso;
    const dentroDelLimite    = totalCreditosTras <= creditosMaxPermitidos;
    validaciones.push({
      nombre:    'creditos_max_permitidos',
      resultado: dentroDelLimite,
      detalle:   dentroDelLimite
        ? `Créditos tras adición: ${totalCreditosTras} / ${creditosMaxPermitidos}`
        : `Excede límite de créditos: ${totalCreditosTras} > ${creditosMaxPermitidos}`,
    });

    // Chequeo 2: Cupos disponibles en el grupo nuevo
    const hayCupos = grupoNuevo
      ? grupoNuevo.cupos_ocupados < grupoNuevo.cupo_maximo
      : false;
    validaciones.push({
      nombre:    'cupos_disponibles',
      resultado: hayCupos,
      detalle:   hayCupos
        ? `Cupos disponibles: ${grupoNuevo ? grupoNuevo.cupo_maximo - grupoNuevo.cupos_ocupados : 0}`
        : 'No hay cupos disponibles en el grupo solicitado',
    });

    // Chequeo 3: Sin cruce de horario (Teorema de Allen)
    let sinCruce = true;
    if (grupoNuevo) {
      const horariosActuales = await this.repoSolicitud.listarHorariosInscripciones(estudianteId, periodo);
      sinCruce = !horariosActuales.some(h =>
        this.existeCruceHorario(
          h.dia_semana, h.hora_inicio, h.hora_fin,
          grupoNuevo.dia_semana, grupoNuevo.hora_inicio, grupoNuevo.hora_fin,
        ),
      );
    }
    validaciones.push({
      nombre:    'sin_cruce_horario',
      resultado: sinCruce,
      detalle:   sinCruce
        ? 'Sin cruce de horario con materias inscritas'
        : 'El horario del grupo solicitado se cruza con una materia ya inscrita',
    });

    // Chequeo 4: El estudiante no debe haber aprobado ya esta materia
    let noAprobadaPrevia = true;
    if (grupoNuevo) {
      const historial = await this.repoSolicitud.buscarHistorialPorCurso(
        estudianteId,
        grupoNuevo.curso_id,
      );
      noAprobadaPrevia = !historial.some(h => h.estado === 'aprobada');
    }
    validaciones.push({
      nombre:    'materia_no_aprobada_previamente',
      resultado: noAprobadaPrevia,
      detalle:   noAprobadaPrevia
        ? 'La materia no ha sido aprobada previamente'
        : 'La materia ya fue aprobada en un periodo anterior',
    });

    return this.construirResultado('adicion_curso', validaciones);
  }

  /**
   * Ejecuta todas las validaciones para CURSO_DIRIGIDO (HU_DB §5.4).
   *
   * Un curso dirigido es aquel que NO se oferta en el semestre actual en la jornada
   * regular del estudiante. Es simplemente una modalidad especial cuando un curso no tiene
   * oferta regular en un período específico.
   *
   * Validaciones:
   * - El grupo es la única opción disponible (no hay oferta regular)
   * - Máximo 3 estudiantes inscritos
   * - Sin cruce de horario con otras materias
   * - Estado académico habilitado (no suspendido)
   *
   * @regla HU_DB §5.4 — Curso Dirigido (Modalidad Especial)
   * @param estudianteId   - ID del estudiante
   * @param grupoNuevoId   - ID del grupo dirigido solicitado
   * @param estadoAcademico - Estado académico del estudiante (normal/bajo_rendimiento/suspendido)
   * @param periodo        - Período académico en el que se solicita
   * @returns {Promise<ResultadoValidacion>} Objeto con todos los chequeos
   */
  private async validarCursoDirigido(
    estudianteId:    number,
    grupoNuevoId:    number,
    estadoAcademico: string,
    periodo:         string,
  ): Promise<ResultadoValidacion> {
    const validaciones: CheckValidacion[] = [];

    const grupoNuevo = await this.repoSolicitud.buscarGrupoPorId(grupoNuevoId);

    // Chequeo 1: El curso NO debe ofertarse en la jornada regular del estudiante en este período
    // Es decir, este grupo es la ÚNICA opción disponible para el curso en el período
    let esUnicaOpcion = false;
    if (grupoNuevo) {
      const otrosGrupos = await this.repoSolicitud.buscarGruposPorCursoYPeriodo(
        grupoNuevo.curso_id,
        grupoNuevo.periodo,
      );
      // Solo existe este grupo = es modalidad dirigida (no hay oferta regular)
      esUnicaOpcion = otrosGrupos.length <= 1;
    }
    validaciones.push({
      nombre:    'curso_no_ofertado_regular',
      resultado: esUnicaOpcion,
      detalle:   esUnicaOpcion
        ? 'El curso no se oferta en la jornada regular del semestre actual'
        : 'El curso tiene oferta regular disponible en este período (no aplica modalidad dirigida)',
    });

    // Chequeo 2: Máximo 3 estudiantes inscritos en el grupo dirigido
    let cuposDisponibles = false;
    let cuposOcupados = 0;
    if (grupoNuevo) {
      cuposOcupados = grupoNuevo.cupos_ocupados || 0;
      cuposDisponibles = cuposOcupados < 3; // Máximo 3 estudiantes en curso dirigido
    }
    validaciones.push({
      nombre:    'cupos_grupo_dirigido',
      resultado: cuposDisponibles,
      detalle:   cuposDisponibles
        ? `Cupos disponibles en grupo dirigido: ${3 - cuposOcupados} / 3`
        : `Grupo dirigido lleno: ${cuposOcupados} / 3 estudiantes inscritos`,
    });

    // Chequeo 3: Sin cruce de horario con otras materias inscritas
    let sinCruce = true;
    if (grupoNuevo) {
      const horariosActuales = await this.repoSolicitud.listarHorariosInscripciones(
        estudianteId,
        periodo,
      );
      sinCruce = !horariosActuales.some(h =>
        this.existeCruceHorario(
          h.dia_semana, h.hora_inicio, h.hora_fin,
          grupoNuevo.dia_semana, grupoNuevo.hora_inicio, grupoNuevo.hora_fin,
        ),
      );
    }
    validaciones.push({
      nombre:    'sin_cruce_horario',
      resultado: sinCruce,
      detalle:   sinCruce
        ? 'Sin cruce de horario con materias inscritas'
        : 'El horario del grupo dirigido se cruza con una materia ya inscrita',
    });

    // Chequeo 4: Estado académico habilitado para curso dirigido
    const estadoHabilitado = estadoAcademico !== 'suspendido';
    validaciones.push({
      nombre:    'estado_academico_habilitado',
      resultado: estadoHabilitado,
      detalle:   estadoHabilitado
        ? `Estado académico ${estadoAcademico} permite solicitud de curso dirigido`
        : 'Estado académico suspendido no permite solicitud de curso dirigido',
    });

    return this.construirResultado('curso_dirigido', validaciones);
  }

  /**
   * Verifica si dos bloques horarios se solapan usando el Teorema de Allen.
   * Solapamiento: inicio_nuevo < fin_existente AND fin_nuevo > inicio_existente
   * y el día de la semana coincide.
   *
   * @regla Detección de Cruce de Horarios — HU_DB §5.1, §5.3
   * @param diaExistente   - Día del bloque existente
   * @param inicioExistente - Hora de inicio del bloque existente (HH:MM)
   * @param finExistente   - Hora de fin del bloque existente (HH:MM)
   * @param diaNuevo       - Día del nuevo bloque
   * @param inicioNuevo    - Hora de inicio del nuevo bloque (HH:MM)
   * @param finNuevo       - Hora de fin del nuevo bloque (HH:MM)
   * @returns {boolean} true si existe solapamiento
   */
  private existeCruceHorario(
    diaExistente:    string,
    inicioExistente: string,
    finExistente:    string,
    diaNuevo:        string,
    inicioNuevo:     string,
    finNuevo:        string,
  ): boolean {
    if (diaExistente !== diaNuevo) return false;

    // Convertir HH:MM a minutos desde medianoche para comparación numérica
    const aMinutos = (hora: string): number => {
      const [h, m] = hora.split(':').map(Number);
      return h * 60 + m;
    };

    const inicioE = aMinutos(inicioExistente);
    const finE    = aMinutos(finExistente);
    const inicioN = aMinutos(inicioNuevo);
    const finN    = aMinutos(finNuevo);

    // Teorema de Allen: hay solapamiento si
    return inicioN < finE && finN > inicioE;
  }

  /**
   * Construye el objeto ResultadoValidacion a partir de los chequeos ejecutados.
   * Establece aprobado = true solo si TODOS los chequeos pasaron.
   *
   * @param tipoSolicitud - Tipo de solicitud procesada
   * @param validaciones  - Lista de chequeos realizados
   * @returns {ResultadoValidacion} Objeto listo para guardar en validacion_json
   */
  private construirResultado(
    tipoSolicitud: string,
    validaciones:  CheckValidacion[],
  ): ResultadoValidacion {
    return {
      timestamp:      new Date().toISOString(),
      tipo_solicitud: tipoSolicitud,
      aprobado:       validaciones.every(v => v.resultado),
      validaciones,
    };
  }

  /**
   * Lista las solicitudes de un estudiante por su cod_alumno.
   *
   * @param codAlumno - Código del alumno (PK tabla solicitudes)
   * @param estado    - Filtro por estado (opcional)
   * @param periodo   - Filtro por periodo (opcional)
   */
  async listarSolicitudesEstudiante(
    codAlumno: string,
    estado?:   string,
    periodo?:  string,
  ): Promise<object[]> {
    return this.repoSolicitud.listarPorEstudiante(codAlumno, estado, periodo);
  }

  /**
   * Lista TODAS las solicitudes del sistema.
   * Acceso exclusivo para SECRETARIA y ADMIN.
   *
   * @param estado        - Filtro por estado (opcional)
   * @param periodo       - Filtro por periodo (opcional)
   * @param tipoSolicitud - Filtro por tipo (opcional)
   */
  async listarTodasLasSolicitudes(
    estado?:        string,
    periodo?:       string,
    tipoSolicitud?: string,
  ): Promise<object[]> {
    return this.repoSolicitud.listarTodas(estado, periodo, tipoSolicitud);
  }

  /**
   * Actualiza el estado de una solicitud. Exclusivo para SECRETARIA y ADMIN.
   * Crea notificación al estudiante al cambiar el estado (aprobada/rechazada).
   *
   * @param solicitudId   - ID de la solicitud
   * @param datos         - Nuevo estado y observaciones validados por Zod
   * @param aprobadaPor   - ID del usuario que resuelve (SECRETARIA o ADMIN)
   */
  async actualizarEstadoSolicitud(
    solicitudId:  number,
    datos:        TActualizarEstado,
    aprobadaPor:  number,
  ): Promise<void> {
    await this.repoSolicitud.actualizarEstado(
      solicitudId,
      datos.estado,
      datos.observaciones ?? null,
      aprobadaPor,
    );
  }

  /**
   * Obtiene los detalles completos de una solicitud por su ID.
   *
   * @param solicitudId - ID de la solicitud
   * @returns {Promise<object|null>} Objeto con los detalles de la solicitud o null si no existe
   */
  async obtenerSolicitudPorId(solicitudId: number): Promise<object | null> {
    return this.repoSolicitud.obtenerPorId(solicitudId);
  }
}

