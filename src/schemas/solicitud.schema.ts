// src/schemas/solicitud.schema.ts
// Esquemas de validación Zod para los endpoints de solicitudes de novedad

import { z } from 'zod';

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

  justificacion: z
    .string({ error: 'La justificación es obligatoria' })
    .min(50, 'La justificación debe tener mínimo 50 caracteres')
    .max(2000, 'La justificación no puede superar 2000 caracteres'),

  periodo_academico: z
    .string({ error: 'El periodo académico es obligatorio' })
    .regex(/^\d{4}-[1-3]$/, 'Formato inválido. Use: AAAA-N (ej: 2026-1)'),
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
);

/**
 * Esquema para PATCH /api/solicitudes/:id/estado
 * Solo SECRETARIA y ADMIN pueden actualizar el estado.
 */
export const esquemaActualizarEstado = z.object({
  estado: z.enum(['en_revision', 'aprobada', 'rechazada'], {
    error: 'Estado inválido. Use: en_revision, aprobada o rechazada',
  }),
  observaciones: z
    .string()
    .max(1000, 'Las observaciones no pueden superar 1000 caracteres')
    .optional(),
});

export type TDatosSolicitud       = z.infer<typeof esquemaSolicitud>;
export type TActualizarEstado     = z.infer<typeof esquemaActualizarEstado>;

