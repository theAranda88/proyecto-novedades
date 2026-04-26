// src/schemas/solicitud.schema.ts
// Esquemas de validación Zod para los endpoints de solicitudes de novedad

import { z } from 'zod';

/** Prefijos Base64 permitidos para validar el tipo de archivo adjunto */
const PREFIJOS_BASE64_VALIDOS = [
  'data:application/pdf;base64,',
  'data:image/jpeg;base64,',
  'data:image/jpg;base64,',
  'data:image/png;base64,',
];

/**
 * Esquema base para POST /api/solicitudes
 * Valida el tipo de solicitud y los campos requeridos según HU_DB §5.
 * La validación de negocio (cupos, cruces, créditos) ocurre en el service.
 */
export const esquemaSolicitud = z.object({
  tipo_solicitud: z.enum(
    ['cambio_curso', 'cambio_jornada', 'curso_dirigido', 'adicion_curso'],
    { error: 'Tipo de solicitud inválido' },
  ),

  grupo_actual_id: z
    .number({ error: 'El ID del grupo actual debe ser un número' })
    .int('Debe ser un número entero')
    .positive('Debe ser mayor a cero')
    .optional(),

  grupo_nuevo_id: z
    .number({ error: 'El ID del grupo nuevo debe ser un número' })
    .int('Debe ser un número entero')
    .positive('Debe ser mayor a cero')
    .optional(),

  jornada_actual: z
    .enum(['manana', 'tarde', 'noche'], { error: 'Jornada actual inválida' })
    .optional(),

  jornada_nueva: z
    .enum(['manana', 'tarde', 'noche'], { error: 'Jornada nueva inválida' })
    .optional(),

  curso_id: z
    .number({ error: 'El ID del curso debe ser un número' })
    .int('Debe ser un número entero')
    .positive('Debe ser mayor a cero')
    .optional(),

  justificacion: z
    .string({ error: 'La justificación es obligatoria' })
    .min(50, 'La justificación debe tener mínimo 50 caracteres')
    .max(2000, 'La justificación no puede superar 2000 caracteres'),

  periodo_academico: z
    .string({ error: 'El periodo académico es obligatorio' })
    .regex(/^\d{4}-[1-3]$/, 'Formato inválido. Use: AAAA-N (ej: 2026-1)'),

  /**
   * Archivo adjunto opcional en Base64.
   * El front convierte el archivo con FileReader.readAsDataURL() y envía el resultado.
   * Debe incluir el prefijo: data:application/pdf;base64,... / data:image/jpeg;base64,...
   * La validación de tamaño máximo (5MB) se realiza en el service.
   */
  adjunto_base64: z
    .string()
    .refine(
      (val) => PREFIJOS_BASE64_VALIDOS.some((prefijo) => val.startsWith(prefijo)),
      { message: 'El adjunto debe ser PDF, JPG o PNG en formato Base64 (data:tipo;base64,...)' },
    )
    .optional(),

  /**
   * Nombre original del archivo adjunto (ej: "Horario_2026.pdf").
   * Requerido si se envía adjunto_base64.
   */
  nombre_adjunto: z
    .string()
    .max(255, 'El nombre del archivo no puede superar 255 caracteres')
    .optional(),
}).refine(
  (datos) => {
    // CAMBIO_CURSO y ADICION_CURSO requieren grupo_nuevo_id
    if (['cambio_curso', 'adicion_curso'].includes(datos.tipo_solicitud)) {
      return datos.grupo_nuevo_id !== undefined;
    }
    // CAMBIO_JORNADA requiere jornada_nueva
    if (datos.tipo_solicitud === 'cambio_jornada') {
      return datos.jornada_nueva !== undefined;
    }
    // CURSO_DIRIGIDO requiere grupo_nuevo_id
    if (datos.tipo_solicitud === 'curso_dirigido') {
      return datos.grupo_nuevo_id !== undefined;
    }
    return true;
  },
  {
    message: 'Faltan campos requeridos para el tipo de solicitud seleccionado',
    path:    ['tipo_solicitud'],
  },
).refine(
  (datos) => {
    // Si se envía adjunto_base64, nombre_adjunto es obligatorio
    if (datos.adjunto_base64 && !datos.nombre_adjunto) {
      return false;
    }
    return true;
  },
  {
    message: 'El campo "nombre_adjunto" es obligatorio cuando se adjunta un archivo',
    path:    ['nombre_adjunto'],
  },
);

/**
 * Esquema para PATCH /api/solicitudes/:id/estado
 * Solo SECRETARIA y ADMIN pueden actualizar el estado.
 *
 * Regla: observaciones es OBLIGATORIO cuando estado = aprobada | rechazada
 * (campo "Observaciones y Comentarios *" del Panel de Resolución)
 */
export const esquemaActualizarEstado = z.object({
  estado: z.enum(['en_revision', 'aprobada', 'rechazada'], {
    error: 'Estado inválido. Use: en_revision, aprobada o rechazada',
  }),
  observaciones: z
    .string()
    .min(10, 'Las observaciones deben tener al menos 10 caracteres')
    .max(1000, 'Las observaciones no pueden superar 1000 caracteres')
    .optional(),
}).refine(
  (datos) => {
    // Cuando se aprueba o rechaza, las observaciones son OBLIGATORIAS
    if (['aprobada', 'rechazada'].includes(datos.estado)) {
      return datos.observaciones !== undefined && datos.observaciones.trim().length >= 10;
    }
    return true;
  },
  {
    message: 'Las observaciones son obligatorias al aprobar o rechazar una solicitud (mínimo 10 caracteres)',
    path: ['observaciones'],
  },
);

export type TDatosSolicitud       = z.infer<typeof esquemaSolicitud>;
export type TActualizarEstado     = z.infer<typeof esquemaActualizarEstado>;

