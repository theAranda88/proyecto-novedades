// src/routes/solicitudRoutes.ts
// Rutas para solicitudes de novedad académica — HU_DB §5

import { Router }                    from 'express';
import { ControladorSolicitud }       from '../controllers/SolicitudController';
import {
  verificarToken,
  verificarRol,
  validarEsquema,
  RolUsuario,
}                                    from '../middlewares/authMiddleware';
import {
  esquemaSolicitud,
  esquemaActualizarEstado,
}                                    from '../schemas/solicitud.schema';

const enrutadorSolicitudes  = Router();
const controladorSolicitud  = new ControladorSolicitud();

/**
 * @swagger
 * /api/solicitudes:
 *   post:
 *     summary: Crear solicitud de novedad académica
 *     description: |
 *       Registra una nueva solicitud de novedad tras ejecutar el motor de validaciones.
 *       El campo `validacion_json` se genera automáticamente con el detalle de todos los chequeos.
 *
 *       ### Validaciones por tipo (HU_DB §5):
 *
 *       **CAMBIO_CURSO:**
 *       1. Estudiante inscrito en el grupo actual
 *       2. Materia no reprobada en el periodo actual
 *       3. Estado académico = normal
 *       4. Cupos disponibles en el grupo nuevo
 *       5. Sin cruce de horario
 *
 *       **CAMBIO_JORNADA:**
 *       1. Jornada nueva diferente a la actual
 *       2. Existen grupos con cupos en la nueva jornada para todas las materias
 *
 *       **ADICION_CURSO:**
 *       1. Créditos inscritos + nuevos ≤ creditos_max_permitidos
 *       2. Cupos disponibles en el grupo
 *       3. Sin cruce de horario
 *       4. Materia no aprobada previamente
 *
 *       **CURSO_DIRIGIDO:**
 *       1. Materia reprobada en historial académico
 *       2. numero_intentos ≥ 1
 *       3. Estado académico no suspendido
 *     tags:
 *       - Solicitudes
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrearSolicitudBody'
 *           examples:
 *             adicionCurso:
 *               summary: Adicion de Curso
 *               value:
 *                 tipo_solicitud: "adicion_curso"
 *                 grupo_nuevo_id: 1
 *                 justificacion: "Solicito adición del curso Cálculo Diferencial ya que complementa mi formación actual y tengo disponibilidad horaria."
 *                 periodo_academico: "2026-1"
 *             cambioCurso:
 *               summary: Cambio de Curso (grupo)
 *               value:
 *                 tipo_solicitud: "cambio_curso"
 *                 grupo_actual_id: 3
 *                 grupo_nuevo_id: 4
 *                 justificacion: "Solicito cambio de grupo por incompatibilidad de horario con mi trabajo de tiempo parcial."
 *                 periodo_academico: "2026-1"
 *             cursoDirigido:
 *               summary: Curso Dirigido
 *               value:
 *                 tipo_solicitud: "curso_dirigido"
 *                 grupo_nuevo_id: 1
 *                 justificacion: "Solicito modalidad de curso dirigido para Cálculo Diferencial tras haberlo reprobado en el semestre anterior."
 *                 periodo_academico: "2026-1"
 *     responses:
 *       201:
 *         description: Solicitud creada con validacion_json
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               mensaje: "Solicitud de novedad registrada exitosamente"
 *               datos:
 *                 id: 1
 *                 codigo_solicitud: "REQ-2026-001"
 *                 estado: "pendiente"
 *                 tipo_solicitud: "adicion_curso"
 *                 validacion_json:
 *                   timestamp: "2026-03-01T10:30:00Z"
 *                   tipo_solicitud: "adicion_curso"
 *                   aprobado: true
 *                   validaciones:
 *                     - nombre: "creditos_max_permitidos"
 *                       resultado: true
 *                       detalle: "Créditos tras adición: 12 / 20"
 *                     - nombre: "cupos_disponibles"
 *                       resultado: true
 *                       detalle: "Cupos disponibles: 26"
 *               codigo_estado: 201
 *       401:
 *         description: Token ausente o inválido
 *       403:
 *         description: Sin permisos o primer_login pendiente
 *       404:
 *         description: Perfil académico no encontrado
 *       422:
 *         description: Validaciones de negocio fallidas o datos inválidos
 */
enrutadorSolicitudes.post(
  '/',
  verificarToken,
  verificarRol(RolUsuario.ESTUDIANTE, RolUsuario.ADMIN),
  validarEsquema(esquemaSolicitud),
  controladorSolicitud.crear,
);

/**
 * @swagger
 * /api/solicitudes/mias:
 *   get:
 *     summary: Listar mis solicitudes
 *     description: |
 *       Devuelve las solicitudes del estudiante autenticado.
 *       Soporta filtros por query string:
 *       - `?estado=pendiente` — Filtrar por estado
 *       - `?periodo=2026-1` — Filtrar por periodo académico
 *     tags:
 *       - Solicitudes
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [pendiente, en_revision, aprobada, rechazada]
 *         description: Filtrar por estado de la solicitud
 *       - in: query
 *         name: periodo
 *         schema:
 *           type: string
 *           example: "2026-1"
 *         description: Filtrar por periodo académico
 *     responses:
 *       200:
 *         description: Lista de solicitudes del estudiante
 *       401:
 *         description: Token ausente o inválido
 *       403:
 *         description: Sin permisos o primer_login pendiente
 */
enrutadorSolicitudes.get(
  '/mias',
  verificarToken,
  verificarRol(RolUsuario.ESTUDIANTE),
  controladorSolicitud.listarMias,
);

/**
 * @swagger
 * /api/solicitudes:
 *   get:
 *     summary: Listar todas las solicitudes (Secretaria / Admin)
 *     description: |
 *       Devuelve todas las solicitudes del sistema para revisión.
 *       Exclusivo para **SECRETARIA** y **ADMIN**.
 *       Soporta filtros: `?estado`, `?periodo`, `?tipo_solicitud`.
 *     tags:
 *       - Solicitudes
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [pendiente, en_revision, aprobada, rechazada]
 *       - in: query
 *         name: periodo
 *         schema:
 *           type: string
 *           example: "2026-1"
 *       - in: query
 *         name: tipo_solicitud
 *         schema:
 *           type: string
 *           enum: [cambio_curso, cambio_jornada, curso_dirigido, adicion_curso]
 *     responses:
 *       200:
 *         description: Lista completa de solicitudes con datos del estudiante
 *       401:
 *         description: Token ausente o inválido
 *       403:
 *         description: Sin permisos (requiere secretaria o admin)
 */
enrutadorSolicitudes.get(
  '/',
  verificarToken,
  verificarRol(RolUsuario.SECRETARIA, RolUsuario.ADMIN),
  controladorSolicitud.listarTodas,
);

/**
 * @swagger
 * /api/solicitudes/{id}/estado:
 *   patch:
 *     summary: Actualizar estado de una solicitud
 *     description: |
 *       Permite a la **SECRETARIA** o **ADMIN** cambiar el estado de una solicitud.
 *       Al aprobar/rechazar se registra: `aprobada_por`, `fecha_resolucion` y `observaciones`.
 *     tags:
 *       - Solicitudes
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la solicitud
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ActualizarEstadoBody'
 *           examples:
 *             aprobar:
 *               summary: Aprobar solicitud
 *               value:
 *                 estado: "aprobada"
 *                 observaciones: "Solicitud válida. Se procede a la adición del curso."
 *             rechazar:
 *               summary: Rechazar solicitud
 *               value:
 *                 estado: "rechazada"
 *                 observaciones: "No hay cupos disponibles en el grupo solicitado."
 *             enRevision:
 *               summary: Poner en revisión
 *               value:
 *                 estado: "en_revision"
 *     responses:
 *       200:
 *         description: Estado actualizado exitosamente
 *       401:
 *         description: Token ausente o inválido
 *       403:
 *         description: Sin permisos (requiere secretaria o admin)
 *       422:
 *         description: Estado inválido
 */
enrutadorSolicitudes.patch(
  '/:id/estado',
  verificarToken,
  verificarRol(RolUsuario.SECRETARIA, RolUsuario.ADMIN),
  validarEsquema(esquemaActualizarEstado),
  controladorSolicitud.actualizarEstado,
);

export default enrutadorSolicitudes;

