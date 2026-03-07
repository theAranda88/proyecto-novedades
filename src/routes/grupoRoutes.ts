// src/routes/grupoRoutes.ts
// Ruta GET /api/grupos — Catálogo de grupos disponibles para dropdowns del formulario.
// Accesible por ESTUDIANTE, SECRETARIA y ADMIN (todos necesitan ver los grupos).

import { Router }                from 'express';
import { ControladorEstudiante } from '../controllers/EstudianteController';
import {
  verificarToken,
  verificarRol,
  RolUsuario,
}                                from '../middlewares/authMiddleware';

const enrutadorGrupos = Router();
const controladorEst  = new ControladorEstudiante();

/**
 * @swagger
 * /api/grupos:
 *   get:
 *     summary: Listar grupos de curso disponibles
 *     description: |
 *       Devuelve los grupos de curso con cupos disponibles.
 *       Se usa para poblar los dropdowns del formulario de solicitud:
 *       - **"Curso Actual"** — en Cambio de Curso
 *       - **"Nuevo Curso Solicitado"** — en Cambio de Curso, Adición, Curso Dirigido
 *
 *       ### Filtros disponibles:
 *       | Parámetro | Tipo | Requerido | Descripción |
 *       |---|---|---|---|
 *       | `periodo` | string | ✅ Sí | Periodo académico (ej: `2026-1`) |
 *       | `curso_id` | number | No | Filtrar por ID de curso específico |
 *       | `jornada` | string | No | Filtrar por jornada: `manana`, `tarde`, `noche` |
 *
 *       ### Ejemplo de uso en el front:
 *       ```
 *       // Al cargar el formulario → traer todos los grupos del periodo
 *       GET /api/grupos?periodo=2026-1
 *
 *       // Al seleccionar "Cambio de Curso" y un curso específico
 *       GET /api/grupos?periodo=2026-1&curso_id=1
 *       ```
 *
 *       La respuesta incluye `cupos_disponibles` calculado como
 *       `cupo_maximo - cupos_ocupados` para mostrar disponibilidad en tiempo real.
 *     tags:
 *       - Estudiantes
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodo
 *         required: true
 *         schema:
 *           type: string
 *           example: "2026-1"
 *         description: Periodo académico en formato AAAA-N
 *       - in: query
 *         name: curso_id
 *         required: false
 *         schema:
 *           type: integer
 *           example: 1
 *         description: ID del curso para filtrar grupos de esa materia
 *       - in: query
 *         name: jornada
 *         required: false
 *         schema:
 *           type: string
 *           enum: [manana, tarde, noche]
 *         description: Filtrar por jornada
 *     responses:
 *       200:
 *         description: Lista de grupos disponibles
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaExito'
 *             example:
 *               ok: true
 *               mensaje: "8 grupo(s) disponible(s) para el periodo 2026-1"
 *               datos:
 *                 - id: 1
 *                   codigo_grupo: "G-01"
 *                   nombre_curso: "Cálculo Diferencial"
 *                   cod_curso: "MAT101"
 *                   jornada: "manana"
 *                   dia_semana: "lunes"
 *                   hora_inicio: "07:00:00"
 *                   hora_fin: "09:00:00"
 *                   docente: "Dr. Ramon Suarez"
 *                   aula: "Aula-201"
 *                   cupo_maximo: 35
 *                   cupos_ocupados: 9
 *                   cupos_disponibles: 26
 *                   periodo: "2026-1"
 *                 - id: 2
 *                   codigo_grupo: "G-02"
 *                   nombre_curso: "Cálculo Diferencial"
 *                   cod_curso: "MAT101"
 *                   jornada: "manana"
 *                   dia_semana: "miercoles"
 *                   hora_inicio: "07:00:00"
 *                   hora_fin: "09:00:00"
 *                   docente: "Dr. Ramon Suarez"
 *                   aula: "Aula-201"
 *                   cupo_maximo: 35
 *                   cupos_ocupados: 9
 *                   cupos_disponibles: 26
 *                   periodo: "2026-1"
 *               codigo_estado: 200
 *       400:
 *         description: Parámetro "periodo" faltante o formato inválido
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: 'El parámetro "periodo" es obligatorio. Ej: ?periodo=2026-1'
 *               datos: null
 *               codigo_estado: 400
 *       401:
 *         description: Token ausente o inválido
 *       403:
 *         description: primer_login pendiente
 */
enrutadorGrupos.get(
  '/',
  verificarToken,
  verificarRol(RolUsuario.ESTUDIANTE, RolUsuario.SECRETARIA, RolUsuario.ADMIN),
  controladorEst.listarGrupos,
);

export default enrutadorGrupos;

