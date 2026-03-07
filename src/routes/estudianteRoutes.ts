// src/routes/estudianteRoutes.ts
// Rutas del módulo estudiante:
//   GET  /api/estudiantes/perfil                 → Info académica para formulario
//   GET  /api/grupos                             → Dropdowns grupos disponibles
//   POST /api/estudiantes/solicitudes/:id/adjunto → Subir documento adjunto (Base64)

import { Router }                from 'express';
import { ControladorEstudiante } from '../controllers/EstudianteController';
import {
  verificarToken,
  verificarRol,
  RolUsuario,
}                                from '../middlewares/authMiddleware';

const enrutadorEstudiante = Router();
const controladorEst      = new ControladorEstudiante();

// ─────────────────────────────────────────────────────────────────────────────
// PERFIL ACADÉMICO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/estudiantes/perfil:
 *   get:
 *     summary: Obtener perfil académico del estudiante
 *     description: |
 *       Devuelve los datos académicos del estudiante autenticado para
 *       **pre-cargar automáticamente** la sección "Información Académica"
 *       del formulario de solicitud.
 *
 *       El front debe llamar este endpoint **antes de mostrar el formulario**
 *       y usar la respuesta para rellenar los campos de solo lectura:
 *       - `nombre_completo` → Campo "Nombre Completo"
 *       - `cod_alumno` → Campo "Código Estudiantil"
 *       - `nombre_programa` → Campo "Programa Académico"
 *       - `semestre` → Campo "Semestre Actual"
 *
 *       También devuelve `jornada`, `creditos_inscritos` y `estado_academico`
 *       que el front puede usar para mostrar alertas contextuales.
 *     tags:
 *       - Estudiantes
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil académico obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaExito'
 *             example:
 *               ok: true
 *               mensaje: "Perfil académico obtenido exitosamente"
 *               datos:
 *                 cod_alumno: "2023-1025043"
 *                 nombre_completo: "Andrés Felipe Rodríguez"
 *                 email_institucional: "a.rodriguez@proyectonovedades.edu.co"
 *                 semestre: 7
 *                 nombre_programa: "Ingeniería de Sistemas"
 *                 jornada: "manana"
 *                 creditos_inscritos: 9
 *                 creditos_max_permitidos: 20
 *                 estado_academico: "normal"
 *                 matricula_activa: true
 *               codigo_estado: 200
 *       401:
 *         description: Token ausente o inválido
 *       403:
 *         description: primer_login pendiente — debe cambiar contraseña primero
 *       404:
 *         description: Perfil académico no encontrado
 *         content:
 *           application/json:
 *             example:
 *               ok: false
 *               mensaje: "No se encontró el perfil académico. Contacte a la secretaría para vincular su cuenta."
 *               datos: null
 *               codigo_estado: 404
 */
enrutadorEstudiante.get(
  '/perfil',
  verificarToken,
  verificarRol(RolUsuario.ESTUDIANTE),
  controladorEst.obtenerPerfil,
);

// ─────────────────────────────────────────────────────────────────────────────
// ADJUNTO DE DOCUMENTOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/estudiantes/solicitudes/{id}/adjunto:
 *   post:
 *     summary: Adjuntar documento a una solicitud (Base64)
 *     description: |
 *       Recibe un archivo codificado en **Base64** y lo asocia a una solicitud existente.
 *
 *       ### Reglas de validación:
 *       - **Tipos permitidos:** PDF, JPG, PNG (MIME: application/pdf, image/jpeg, image/png)
 *       - **Tamaño máximo:** 5MB por archivo
 *       - El campo `archivo_base64` debe incluir el prefijo completo:
 *         `data:application/pdf;base64,` / `data:image/jpeg;base64,` / `data:image/png;base64,`
 *
 *       ### Cómo usar desde el front:
 *       ```javascript
 *       const reader = new FileReader();
 *       reader.readAsDataURL(file);
 *       reader.onload = () => {
 *         body.archivo_base64 = reader.result; // ya incluye el prefijo
 *       };
 *       ```
 *
 *       ### Flujo típico:
 *       1. Estudiante crea la solicitud → recibe `id` en la respuesta
 *       2. Estudiante llama este endpoint con el `id` de la solicitud
 *       3. El sistema guarda el archivo en `/uploads/solicitudes/{id}/`
 *       4. Se registra en la tabla `documentos_adjuntos` y devuelve la URL
 *     tags:
 *       - Estudiantes
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la solicitud a la que se adjunta el documento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdjuntoBase64Body'
 *           examples:
 *             adjuntoPDF:
 *               summary: Adjuntar PDF
 *               value:
 *                 nombre_archivo: "Horario_Actual_2026.pdf"
 *                 archivo_base64: "data:application/pdf;base64,JVBERi0xLjQKJ..."
 *             adjuntoIMG:
 *               summary: Adjuntar imagen JPG
 *               value:
 *                 nombre_archivo: "Certificado_Medico.jpg"
 *                 archivo_base64: "data:image/jpeg;base64,/9j/4AAQSkZJRgAB..."
 *     responses:
 *       201:
 *         description: Documento adjunto guardado correctamente
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               mensaje: "Documento adjunto guardado correctamente"
 *               datos:
 *                 id: 1
 *                 url: "/uploads/solicitudes/5/1709834521000_Horario_Actual_2026.pdf"
 *                 nombre: "1709834521000_Horario_Actual_2026.pdf"
 *               codigo_estado: 201
 *       400:
 *         description: Campos obligatorios faltantes o ID inválido
 *       401:
 *         description: Token ausente o inválido
 *       403:
 *         description: Sin permisos o primer_login pendiente
 *       422:
 *         description: Tipo de archivo no permitido o supera 5MB
 *         content:
 *           application/json:
 *             examples:
 *               tipoInvalido:
 *                 value:
 *                   ok: false
 *                   mensaje: "Tipo de archivo no permitido. Se aceptan: PDF, JPG, PNG"
 *                   datos: null
 *                   codigo_estado: 422
 *               tamanioExcedido:
 *                 value:
 *                   ok: false
 *                   mensaje: "El archivo supera el límite de 5MB. Tamaño actual: 6.23MB"
 *                   datos: null
 *                   codigo_estado: 422
 */
enrutadorEstudiante.post(
  '/solicitudes/:id/adjunto',
  verificarToken,
  verificarRol(RolUsuario.ESTUDIANTE, RolUsuario.ADMIN),
  controladorEst.subirAdjunto,
);

export default enrutadorEstudiante;

