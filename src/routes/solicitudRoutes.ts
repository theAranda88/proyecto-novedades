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
 * /api/solicitudes/{id}:
 *   get:
 *     summary: Obtener detalles de una solicitud específica
 *     description: |
 *       Obtiene todos los detalles de una solicitud por su ID.
 *
 *       **Permisos:**
 *       - **ESTUDIANTE**: Solo puede ver sus propias solicitudes
 *       - **SECRETARIA/ADMIN**: Pueden ver cualquier solicitud
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
 *         description: ID de la solicitud (número)
 *     responses:
 *       200:
 *         description: Solicitud obtenida exitosamente
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               mensaje: "Solicitud obtenida exitosamente"
 *               datos:
 *                 id: 1
 *                 codigo_solicitud: "REQ-2024-001"
 *                 cod_alumno: "2024001"
 *                 tipo_solicitud: "CAMBIO_JORNADA"
 *                 estado: "EN_REVISION"
 *                 periodo_academico: "2026-1"
 *                 justificacion: "Necesito cambiar de jornada..."
 *                 validacion_json: { timestamp: "...", aprobado: true }
 *                 created_at: "2023-10-15T10:30:00Z"
 *       404:
 *         description: Solicitud no encontrada
 *       403:
 *         description: Sin permisos para ver esta solicitud (estudiante viendo solicitud de otro)
 *       401:
 *         description: Token ausente o inválido
 */
// Endpoint: Obtener detalles de una solicitud específica por ID
enrutadorSolicitudes.get(
  '/:id',
  verificarToken,
  controladorSolicitud.obtenerPorId,
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
 *       Al aprobar/rechazar se registra `updated_by` y `updated_at` con el usuario que resolvió.
 *
 *       **Transiciones permitidas:**
 *       - `PENDIENTE` → `en_revision`, `aprobada`, `rechazada`
 *       - `en_revision` → `aprobada`, `rechazada`
 *       - `aprobada` / `rechazada` → ❌ Estados terminales, no se puede cambiar
 *
 *       **Campo `observaciones`:**
 *       - ⚠️ **OBLIGATORIO** cuando `estado = aprobada` o `estado = rechazada` (mínimo 10 chars)
 *       - Opcional cuando `estado = en_revision`
 *       - Se guarda en `justificacion_detallada` y aparece en el historial del detalle
 *
 *       La operación es **transaccional (ACID)**: si falla la notificación, se hace ROLLBACK.
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

/**
 * @swagger
 * /api/solicitudes/panel/listar:
 *   get:
 *     summary: Lista solicitudes para panel de Secretaría (con filtros y paginación)
 *     description: |
 *       Retorna solicitudes con filtros, búsqueda y paginación para el panel de Secretaría.
 *
 *       **Query Parameters:**
 *       - `estado`: Filtro por estado (pendiente, en_revision, aprobada, rechazada)
 *       - `programa_id`: Filtro por programa (ID numérico)
 *       - `busqueda`: Busca por nombre estudiante, código, ID solicitud (case-insensitive)
 *       - `pagina`: Número de página (default: 1)
 *       - `tamanio`: Registros por página (default: 10, max: 50)
 *       - `ordenar`: Campo para ordenar (default: created_at)
 *       - `direccion`: ASC o DESC (default: DESC)
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
 *         required: false
 *       - in: query
 *         name: programa_id
 *         schema:
 *           type: integer
 *         required: false
 *       - in: query
 *         name: busqueda
 *         schema:
 *           type: string
 *         required: false
 *       - in: query
 *         name: pagina
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *       - in: query
 *         name: tamanio
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         required: false
 *       - in: query
 *         name: ordenar
 *         schema:
 *           type: string
 *           default: created_at
 *         required: false
 *       - in: query
 *         name: direccion
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         required: false
 *     responses:
 *       200:
 *         description: Listado de solicitudes obtenido exitosamente
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               mensaje: "Solicitudes obtenidas correctamente"
 *               datos:
 *                 datos:
 *                   - id: 1
 *                     codigo_solicitud: "REQ-2026-001"
 *                     nombre_completo: "Carlos Andres Perez Lopez"
 *                     codigo_estudiantil: "2024001"
 *                     tipo_solicitud: "CAMBIO_CURSO"
 *                     programa: "Ingenieria de Sistemas"
 *                     fecha_solicitud: "2026-03-15T10:30:00Z"
 *                     estado: "PENDIENTE"
 *                     tiempo_pendiente: "48.5"
 *                     aprobada_por: null
 *                 total: 3
 *                 pagina: 1
 *                 tamanio: 10
 *                 total_paginas: 1
 *                 mostrando: "1-3 de 3"
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado (requiere rol SECRETARIA o ADMIN)
 */
enrutadorSolicitudes.get(
  '/panel/listar',
  verificarToken,
  verificarRol(RolUsuario.SECRETARIA, RolUsuario.ADMIN),
  controladorSolicitud.listarConFiltros,
);

/**
 * @swagger
 * /api/solicitudes/{id}/detalle:
 *   get:
 *     summary: Obtener detalle completo de una solicitud
 *     description: |
 *       Retorna en **una sola llamada** todos los datos necesarios para renderizar
 *       la pantalla "Detalle de Solicitud":
 *
 *       | Bloque | Contenido |
 *       |--------|-----------|
 *       | `estudiante` | nombre_completo, codigo_estudiantil, programa, semestre, promedio_acumulado (PAPA), correo, jornada |
 *       | `detalle_solicitud` | tipo_novedad, justificacion_detallada, motivo_novedad, grupo_actual, grupo_solicitado, validacion_json |
 *       | `documentos` | id, nombre_archivo, tipo_mime, tamanio_bytes, url_archivo, fecha_subida |
 *       | `historial` | línea de tiempo: radicación + notificaciones en orden cronológico |
 *
 *       **Control de acceso:**
 *       - `SECRETARIA` / `ADMIN` → puede ver cualquier solicitud
 *       - `ESTUDIANTE` → solo puede ver sus propias solicitudes (403 si intenta ver otra)
 *
 *       **Nota técnica — Historial:**
 *       El historial se construye desde la tabla `notificaciones` (no existe tabla
 *       `historial_solicitudes` en BD). La primera entrada siempre es la radicación.
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
 *           minimum: 1
 *         description: ID numérico de la solicitud (id_solicitud en BD)
 *         example: 1
 *     responses:
 *       200:
 *         description: Detalle completo obtenido exitosamente
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               mensaje: "Detalle de solicitud obtenido correctamente"
 *               datos:
 *                 id_solicitud: "1"
 *                 codigo_solicitud: "REQ-2026-001"
 *                 estado_solicitud: "PENDIENTE"
 *                 periodo_academico: "2026-1"
 *                 fecha_creacion: "2026-03-21T18:25:16.276Z"
 *                 ultima_actualizacion: "2026-03-21T18:25:16.276Z"
 *                 estudiante:
 *                   cod_alumno: "2024001"
 *                   codigo_estudiantil: "2024001"
 *                   nombre_completo: "Carlos Andres Perez Lopez"
 *                   correo_institucional: "c.perez@proyectonovedades.edu.co"
 *                   semestre_actual: 3
 *                   promedio_acumulado: "3.80"
 *                   jornada_actual: "manana"
 *                   programa: "Ingenieria de Sistemas"
 *                 detalle_solicitud:
 *                   tipo_novedad: "CAMBIO_JORNADA"
 *                   motivo_novedad: "CAMBIO_JORNADA - Periodo 2026-1"
 *                   justificacion_detallada: "Necesito cambiar jornada por motivos laborales"
 *                   validacion_json:
 *                     aprobado: true
 *                     tipo_solicitud: "cambio_jornada"
 *                     validaciones: []
 *                   grupo_actual:
 *                     id: 3
 *                     codigo_grupo: "G-01"
 *                     jornada: "manana"
 *                     dia_semana: "lunes"
 *                     hora_inicio: "07:00:00"
 *                     hora_fin: "09:00:00"
 *                     nombre_curso: "Programacion I"
 *                     cod_curso: "PRG201"
 *                   grupo_solicitado:
 *                     id: 5
 *                     codigo_grupo: "G-02"
 *                     jornada: "tarde"
 *                     dia_semana: "lunes"
 *                     hora_inicio: "14:00:00"
 *                     hora_fin: "16:00:00"
 *                     nombre_curso: "Programacion I"
 *                     cod_curso: "PRG201"
 *                   resuelta_por: null
 *                   resuelta_por_rol: null
 *                 documentos: []
 *                 historial:
 *                   - id_evento: 0
 *                     descripcion: "Solicitud radicada"
 *                     estado_nuevo: "PENDIENTE"
 *                     estado_anterior: null
 *                     fecha: "2026-03-21T18:25:16.276Z"
 *                     actor: "Carlos Andres Perez Lopez"
 *                     rol_actor: "estudiante"
 *               codigo_estado: 200
 *       400:
 *         description: ID inválido (no numérico o ≤ 0)
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: "ID de solicitud inválido — debe ser un número entero positivo"
 *               datos: null
 *               codigo_estado: 400
 *       403:
 *         description: Estudiante intentando ver solicitud de otro estudiante
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: "No tiene permiso para ver esta solicitud"
 *               datos: null
 *               codigo_estado: 403
 *       404:
 *         description: Solicitud no encontrada o eliminada (soft delete)
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: "No existe la solicitud con ID 999"
 *               datos: null
 *               codigo_estado: 404
 */
enrutadorSolicitudes.get(
  '/:id/detalle',
  verificarToken,
  verificarRol(RolUsuario.ESTUDIANTE, RolUsuario.SECRETARIA, RolUsuario.ADMIN),
  controladorSolicitud.obtenerDetalle,
);

export default enrutadorSolicitudes;

