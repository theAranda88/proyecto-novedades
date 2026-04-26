// src/services/SolicitudService.ts
// Motor de validaciones y lógica de negocio para solicitudes de novedad.
// Implementa HU_DB §5 completa con validacion_json obligatorio.

import { RepositorioSolicitud }            from '../repositories/solicitud.repository';
import { RepositorioUsuario }              from '../repositories/usuario.repository';
import { TDatosSolicitud, TActualizarEstado } from '../schemas/solicitud.schema';
import { ErrorNegocio }                    from '../middlewares/errorHandler';
import { ServicioNotificacion, TipoNotificacion } from './NotificacionService';
import { pool }                             from '../config/database';

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
  private readonly repoUsuario: RepositorioUsuario;
  private readonly servicioNotificacion: ServicioNotificacion;

  constructor() {
    this.repoSolicitud = new RepositorioSolicitud();
    this.repoUsuario = new RepositorioUsuario();
    this.servicioNotificacion = new ServicioNotificacion();
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
      datos: TDatosSolicitud,
      idUsuario: number,
      estudianteSeq: number,
      codAlumno: string,
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
      codAlumno: codAlumno,
      tipoSolicitud: datos.tipo_solicitud,
      grupoActualId: datos.grupo_actual_id ?? null,
      grupoNuevoId: datos.grupo_nuevo_id ?? null,
      jornadaActual: datos.jornada_actual ?? null,
      jornadaNueva: datos.jornada_nueva ?? null,
      justificacion: datos.justificacion,
      periodoAcademico: datos.periodo_academico,
      validacionJson: validacionJson,
      createdBy: idUsuario,
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
      estudianteId: number,
      grupoActualId: number,
      grupoNuevoId: number,
      periodo: string,
      estadoAcademico: string,
  ): Promise<ResultadoValidacion> {
    const validaciones: CheckValidacion[] = [];

    // Chequeo 1: El estudiante debe estar inscrito en el grupo actual
    const inscrito = await this.repoSolicitud.estaInscrito(estudianteId, grupoActualId, periodo);
    validaciones.push({
      nombre: 'inscripcion_activa',
      resultado: inscrito,
      detalle: inscrito
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
      nombre: 'estado_materia_no_reprobada',
      resultado: noReprobadaActual,
      detalle: noReprobadaActual
          ? 'La materia no está reprobada en el periodo actual'
          : 'No se permite cambio de curso en una materia con estado reprobada',
    });

    // Chequeo 3: Estado académico del estudiante debe ser 'normal'
    const estadoNormal = estadoAcademico === 'normal';
    validaciones.push({
      nombre: 'estado_academico_normal',
      resultado: estadoNormal,
      detalle: estadoNormal
          ? 'Estado académico normal'
          : `Estado académico ${estadoAcademico} no permite solicitud de cambio de curso`,
    });

    // Chequeo 4: Cupos disponibles en el grupo nuevo
    const grupoNuevo = await this.repoSolicitud.buscarGrupoPorId(grupoNuevoId);
    const hayCupos = grupoNuevo
        ? grupoNuevo.cupos_ocupados < grupoNuevo.cupo_maximo
        : false;
    validaciones.push({
      nombre: 'cupos_disponibles',
      resultado: hayCupos,
      detalle: hayCupos
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
      nombre: 'sin_cruce_horario',
      resultado: sinCruce,
      detalle: sinCruce
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
      jornadaNueva: string,
      periodo: string,
  ): Promise<ResultadoValidacion> {
    const validaciones: CheckValidacion[] = [];

    // Chequeo 1: La jornada nueva debe ser diferente a la actual
    const jornadaDiferente = jornadaActual !== jornadaNueva;
    validaciones.push({
      nombre: 'jornada_diferente',
      resultado: jornadaDiferente,
      detalle: jornadaDiferente
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
      nombre: 'grupos_jornada_disponibles',
      resultado: gruposDisponibles,
      detalle: gruposDisponibles
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
      estudianteId: number,
      grupoNuevoId: number,
      periodo: string,
      creditosInscritos: number,
      creditosMaxPermitidos: number,
  ): Promise<ResultadoValidacion> {
    const validaciones: CheckValidacion[] = [];

    const grupoNuevo = await this.repoSolicitud.buscarGrupoPorId(grupoNuevoId);

    // Chequeo 1: Créditos inscritos + créditos del nuevo curso ≤ creditos_max_permitidos
    const creditosNuevoCurso = grupoNuevo?.creditos ?? 0;
    const totalCreditosTras = creditosInscritos + creditosNuevoCurso;
    const dentroDelLimite = totalCreditosTras <= creditosMaxPermitidos;
    validaciones.push({
      nombre: 'creditos_max_permitidos',
      resultado: dentroDelLimite,
      detalle: dentroDelLimite
          ? `Créditos tras adición: ${totalCreditosTras} / ${creditosMaxPermitidos}`
          : `Excede límite de créditos: ${totalCreditosTras} > ${creditosMaxPermitidos}`,
    });

    // Chequeo 2: Cupos disponibles en el grupo nuevo
    const hayCupos = grupoNuevo
        ? grupoNuevo.cupos_ocupados < grupoNuevo.cupo_maximo
        : false;
    validaciones.push({
      nombre: 'cupos_disponibles',
      resultado: hayCupos,
      detalle: hayCupos
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
      nombre: 'sin_cruce_horario',
      resultado: sinCruce,
      detalle: sinCruce
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
      nombre: 'materia_no_aprobada_previamente',
      resultado: noAprobadaPrevia,
      detalle: noAprobadaPrevia
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
      estudianteId: number,
      grupoNuevoId: number,
      estadoAcademico: string,
      periodo: string,
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
      nombre: 'curso_no_ofertado_regular',
      resultado: esUnicaOpcion,
      detalle: esUnicaOpcion
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
      nombre: 'cupos_grupo_dirigido',
      resultado: cuposDisponibles,
      detalle: cuposDisponibles
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
      nombre: 'sin_cruce_horario',
      resultado: sinCruce,
      detalle: sinCruce
          ? 'Sin cruce de horario con materias inscritas'
          : 'El horario del grupo dirigido se cruza con una materia ya inscrita',
    });

    // Chequeo 4: Estado académico habilitado para curso dirigido
    const estadoHabilitado = estadoAcademico !== 'suspendido';
    validaciones.push({
      nombre: 'estado_academico_habilitado',
      resultado: estadoHabilitado,
      detalle: estadoHabilitado
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
      diaExistente: string,
      inicioExistente: string,
      finExistente: string,
      diaNuevo: string,
      inicioNuevo: string,
      finNuevo: string,
  ): boolean {
    if (diaExistente !== diaNuevo) return false;

    // Convertir HH:MM a minutos desde medianoche para comparación numérica
    const aMinutos = (hora: string): number => {
      const [h, m] = hora.split(':').map(Number);
      return h * 60 + m;
    };

    const inicioE = aMinutos(inicioExistente);
    const finE = aMinutos(finExistente);
    const inicioN = aMinutos(inicioNuevo);
    const finN = aMinutos(finNuevo);

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
      validaciones: CheckValidacion[],
  ): ResultadoValidacion {
    return {
      timestamp: new Date().toISOString(),
      tipo_solicitud: tipoSolicitud,
      aprobado: validaciones.every(v => v.resultado),
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
      estado?: string,
      periodo?: string,
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
      estado?: string,
      periodo?: string,
      tipoSolicitud?: string,
  ): Promise<object[]> {
    return this.repoSolicitud.listarTodas(estado, periodo, tipoSolicitud);
  }

  /**
   * Actualiza el estado de una solicitud de forma TRANSACCIONAL.
   * Exclusivo para SECRETARIA y ADMIN.
   *
   * **Transacción (ACID):**
   * 1. Iniciar transacción
   * 2. Validar que la solicitud existe y estado es válido para transición
   * 3. Obtener ID del estudiante (usuario_id) de la solicitud
   * 4. Actualizar estado, aprobada_por, fecha_resolucion, updated_by, updated_at
   * 5. Crear notificación al estudiante
   * 6. Si todo OK → COMMIT; si error → ROLLBACK
   *
   * **Validaciones de transición de estado:**
   * - pendiente → en_revision, aprobada, rechazada ✅
   * - en_revision → aprobada, rechazada ✅
   * - aprobada/rechazada → No permitido (terminal) ❌
   *
   * @param solicitudId   - ID de la solicitud
   * @param datos         - Nuevo estado y observaciones validados por Zod
   * @param aprobadaPor   - ID del usuario que resuelve (SECRETARIA o ADMIN)
   * @throws {ErrorNegocio} Si transición no es válida o error en transacción
   */
  async actualizarEstadoSolicitud(
    solicitudId: number,
    datos: TActualizarEstado,
    aprobadaPor: number,
  ): Promise<void> {
    const cliente = await pool.connect();
    try {
      // Iniciar transacción
      await cliente.query('BEGIN');

      // Paso 1: Obtener solicitud actual
       // Columnas reales: id_solicitud, estado_solicitud, cod_alumno (no estudiante_id)
      const consultaSolicitud = await cliente.query(
        `SELECT s.id_solicitud AS id, s.estado_solicitud AS estado,
                u.id_usuario AS usuario_id
           FROM solicitudes s
           LEFT JOIN estudiantes e ON e.cod_alumno = s.cod_alumno
           LEFT JOIN usuarios u ON u.id_usuario = e.usuario_id
          WHERE s.id_solicitud = $1 AND s.deleted_at IS NULL`,
        [solicitudId],
      );

      if (!consultaSolicitud.rows[0]) {
        throw new ErrorNegocio('Solicitud no encontrada', 404);
      }

      const { estado: estadoActual, usuario_id: usuarioId } = consultaSolicitud.rows[0];

      // Paso 2: Validar transición de estado
      this.validarTransicionEstado(estadoActual, datos.estado);

      // Paso 3: Actualizar solicitud (dentro de transacción)
      // Columnas reales en BD: estado_solicitud, justificacion_detallada, updated_by, updated_at
      // - observaciones → justificacion_detallada (campo existente en BD)
      // - aprobada_por y fecha_resolucion NO existen → se usa updated_by / updated_at
      const ahora = new Date();
      await cliente.query(
        `UPDATE solicitudes
            SET estado_solicitud      = $1,
                justificacion_detallada = CASE
                  WHEN $2::TEXT IS NOT NULL THEN $2::TEXT
                  ELSE justificacion_detallada
                END,
                updated_by             = $3,
                updated_at             = $4
          WHERE id_solicitud = $5 AND deleted_at IS NULL`,
        [
          datos.estado.toUpperCase(),
          datos.observaciones ?? null,
          aprobadaPor,
          ahora,
          solicitudId,
        ],
      );

      // Paso 4: Crear notificación al estudiante (dentro de transacción)
      const tipoNotificacion = this.mapearEstadoATipoNotificacion(datos.estado);
      await cliente.query(
        `INSERT INTO notificaciones
            (usuario_id, solicitud_id, titulo, mensaje, leido, created_at)
         VALUES ($1, $2, $3, $4, FALSE, NOW())`,
        [
          usuarioId,
          solicitudId,
          this.generarTituloNotificacion(datos.estado),
          this.generarMensajeNotificacion(datos.estado, datos.observaciones),
        ],
      );

      // Commit si todo fue OK
      await cliente.query('COMMIT');
    } catch (error) {
      // Rollback automático en caso de error
      await cliente.query('ROLLBACK');

      if (error instanceof ErrorNegocio) {
        throw error;
      }
      throw new ErrorNegocio(
        `Error al actualizar estado de solicitud: ${(error as Error).message}`,
        500,
      );
    } finally {
      cliente.release();
    }
  }

  /**
   * Valida que la transición de estado sea permitida según las reglas de negocio.
   *
   * **Regla de transición válida:**
   * - pendiente → {en_revision, aprobada, rechazada}
   * - en_revision → {aprobada, rechazada}
   * - aprobada → TERMINAL (no permitido)
   * - rechazada → TERMINAL (no permitido)
   *
   * @private
   * @throws {ErrorNegocio} Si la transición no es válida
   */
  private validarTransicionEstado(estadoActual: string, estadoNuevo: string): void {
    const transicionesValidas: Record<string, string[]> = {
      pendiente:   ['en_revision', 'aprobada', 'rechazada'],
      en_revision: ['aprobada', 'rechazada'],
      aprobada:    [],   // Terminal
      rechazada:   [],   // Terminal
    };

    // La BD guarda en MAYÚSCULAS (PENDIENTE, APROBADA…) — normalizar para comparar
    const actualNorm = estadoActual.toLowerCase();
    const nuevoNorm  = estadoNuevo.toLowerCase();
    const permitidas = transicionesValidas[actualNorm] ?? [];

    if (!permitidas.includes(nuevoNorm)) {
      throw new ErrorNegocio(
        `Transición no permitida: ${estadoActual} → ${estadoNuevo}. ` +
        `Estados terminales (aprobada, rechazada) no pueden cambiar.`,
        422,
      );
    }
  }

  /**
   * Mapea un estado de solicitud a tipo de notificación.
   * @private
   */
  private mapearEstadoATipoNotificacion(estado: string): TipoNotificacion {
    switch (estado) {
      case 'aprobada':
        return 'solicitud_aprobada';
      case 'rechazada':
        return 'solicitud_rechazada';
      case 'en_revision':
        return 'solicitud_revision';
      default:
        return 'solicitud_revision';
    }
  }

  /**
   * Genera el título de una notificación según el estado.
   * @private
   */
  private generarTituloNotificacion(estado: string): string {
    switch (estado) {
      case 'aprobada':
        return 'Solicitud Aprobada';
      case 'rechazada':
        return 'Solicitud Rechazada';
      case 'en_revision':
        return 'Solicitud en Revisión';
      default:
        return 'Actualización de Solicitud';
    }
  }

  /**
   * Genera el mensaje de una notificación según el estado.
   * @private
   */
  private generarMensajeNotificacion(estado: string, observaciones?: string | null): string {
    switch (estado) {
      case 'aprobada':
        return 'Tu solicitud de novedad académica ha sido APROBADA. Puedes proceder con los trámites correspondientes.';
      case 'rechazada':
        return `Tu solicitud de novedad académica ha sido RECHAZADA.${observaciones ? ` Motivo: ${observaciones}` : ''}`;
      case 'en_revision':
        return 'Tu solicitud de novedad académica está siendo revisada por la Secretaría Académica.';
      default:
        return 'Tu solicitud ha sido actualizada.';
    }
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

  /**
   * Lista solicitudes del sistema con filtros, búsqueda y paginación.
   * Para el panel de Secretaría (SECRETARIA y ADMIN únicamente).
   *
   * @param opciones - Filtros y paginación
   * @returns {Promise<{ datos: any[], total: number, pagina: number, tamanio: number, total_paginas: number }>}
   */
  async listarSolicitudesConFiltros(opciones: {
    estado?: string;
    programaId?: number;
    busqueda?: string;
    pagina?: number;
    tamanio?: number;
    ordenar?: string;
    direccion?: string;
  }): Promise<{
    datos: any[];
    total: number;
    pagina: number;
    tamanio: number;
    total_paginas: number;
  }> {
    // Validar y establecer valores por defecto
    const pagina = Math.max(1, opciones.pagina ?? 1);
    const tamanio = Math.min(50, Math.max(1, opciones.tamanio ?? 10));

    const { datos, total } = await this.repoSolicitud.listarSolicitudesConFiltros({
      estado: opciones.estado,
      programaId: opciones.programaId,
      busqueda: opciones.busqueda,
      pagina,
      tamanio,
      ordenar: opciones.ordenar,
      direccion: opciones.direccion,
    });

    const totalPaginas = Math.ceil(total / tamanio);

    return {
      datos,
      total,
      pagina,
      tamanio,
      total_paginas: totalPaginas,
    };
  }

  /**
   * Obtiene el detalle completo de una solicitud para la pantalla "Detalle de Solicitud".
   *
   * Retorna en una sola llamada:
   *  - Datos del estudiante (nombre, código, programa, semestre, PAPA, correo, jornada)
   *  - Datos de la solicitud (tipo, justificación, motivo, grupos, validacion_json)
   *  - Documentos adjuntos[]  (tabla documentos_adjuntos)
   *  - Historial de cambios[] (construido desde notificaciones)
   *
   * Control de acceso:
   *  - SECRETARIA / ADMIN → puede ver cualquier solicitud
   *  - ESTUDIANTE → solo puede ver sus propias solicitudes (403 si intenta ver otra)
   *
   * @param idSolicitud - id_solicitud (PK tabla solicitudes)
   * @param idUsuario   - id_usuario del token JWT
   * @param rol         - rol del usuario autenticado
   * @returns Objeto estructurado para la pantalla de detalle
   * @throws {ErrorNegocio} 404 si no existe, 403 si no tiene permiso
   */
  async obtenerDetalle(
    idSolicitud: number,
    idUsuario: number,
    rol: string,
  ): Promise<object> {
    const detalle = await this.repoSolicitud.obtenerDetalleSolicitud(idSolicitud);

    if (!detalle) {
      throw new ErrorNegocio(`No existe la solicitud con ID ${idSolicitud}`, 404);
    }

    // Control de acceso: ESTUDIANTE solo puede ver sus propias solicitudes
    if (rol === 'estudiante') {
      // Obtener el codigo_estudiantil del usuario autenticado
      const usuario = await this.repoUsuario.obtenerPorId(idUsuario);
      const codigoDelToken = usuario?.codigo_estudiantil ?? '';
      const codigoDeLaSolicitud = detalle.estudiante?.codigo_estudiantil ?? '';

      if (codigoDelToken !== codigoDeLaSolicitud) {
        throw new ErrorNegocio('No tiene permiso para ver esta solicitud', 403);
      }
    }

    return detalle;
  }
}

