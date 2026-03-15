// src/schemas/usuario.schema.ts
// Esquemas de validación Zod para gestión de usuarios

import { z } from 'zod';

/**
 * Roles válidos en el sistema (corresponden al ENUM rol_sistema en BD)
 */
export const rolesValidos = ['ESTUDIANTE', 'SECRETARIA', 'ADMIN'] as const;
export type RolUsuarioEnum = typeof rolesValidos[number];

/**
 * Esquema para POST /api/usuarios/crear (creación de nuevos usuarios)
 * Validaciones:
 *   - nombre_completo: 3-200 caracteres
 *   - email_institucional: email válido único
 *   - codigo_estudiantil: 1-20 caracteres, único
 *   - rol: uno de ['ESTUDIANTE', 'SECRETARIA', 'ADMIN']
 *
 * Campos adicionales (SOLO si rol = ESTUDIANTE):
 *   - programa_id: ID del programa académico (1=Ing. Sistemas, 2=Ing. Industrial, 3=Admin Empresas)
 *   - semestre_actual: Semestre actual (1-12)
 *   - jornada: Jornada horaria (manana|tarde|noche)
 *   - matricula_activa: Si puede acceder al sistema (default: true)
 *
 * NOTA: La contraseña se genera automáticamente y no se proporciona en el request.
 *       El usuario debe cambiarla en el primer login (primer_login = TRUE).
 */
export const esquemaCrearUsuario = z.object({
  nombre_completo: z
    .string({ error: 'El nombre completo es obligatorio' })
    .min(3, 'El nombre debe tener mínimo 3 caracteres')
    .max(200, 'El nombre no puede superar 200 caracteres')
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, 'El nombre solo puede contener letras y espacios'),

  email_institucional: z
    .string({ error: 'El email es obligatorio' })
    .email('Debe proporcionar un email válido')
    .max(150, 'El email no puede superar 150 caracteres'),

  codigo_estudiantil: z
    .string({ error: 'El código estudiantil es obligatorio' })
    .min(1, 'El código no puede estar vacío')
    .max(20, 'El código no puede superar 20 caracteres'),

  rol: z
    .enum(rolesValidos, {
      error: `El rol debe ser uno de: ${rolesValidos.join(', ')}`,
    }),

  // Campos obligatorios SOLO cuando rol = ESTUDIANTE (HU_DB §4.2)
  programa_id: z
    .number({ error: 'El ID del programa debe ser un número' })
    .int('Debe ser un número entero')
    .positive('Debe ser mayor a cero')
    .optional()
    .describe('ID del programa académico (1=Ing.Sistemas, 2=Ing.Industrial, 3=Admin.Empresas)'),

  semestre_actual: z
    .number({ error: 'El semestre debe ser un número' })
    .int('Debe ser un número entero')
    .min(1, 'El semestre debe estar entre 1 y 12')
    .max(12, 'El semestre debe estar entre 1 y 12')
    .optional()
    .describe('Semestre académico actual del estudiante'),

  jornada: z
    .enum(['manana', 'tarde', 'noche'], {
      error: 'La jornada debe ser: manana, tarde o noche',
    })
    .optional()
    .describe('Jornada horaria del estudiante'),

  matricula_activa: z
    .boolean()
    .default(true)
    .optional()
    .describe('Si el estudiante tiene matrícula activa para acceder al sistema'),

}).refine(
  (datos) => {
    // Si rol es ESTUDIANTE, programa_id, semestre_actual y jornada son obligatorios
    if (datos.rol === 'ESTUDIANTE') {
      return datos.programa_id !== undefined
          && datos.semestre_actual !== undefined
          && datos.jornada !== undefined;
    }
    return true;
  },
  {
    message: 'Para crear ESTUDIANTE son obligatorios: programa_id, semestre_actual, jornada',
    path: ['rol'],
  },
);

export type TCrearUsuario = z.infer<typeof esquemaCrearUsuario>;

/**
 * Esquema para validar permisos de creación según el rol del usuario autenticado
 * (se usa internamente, no en el request)
 */
export const esquemaPermisosCreacion = z.object({
  rol_usuario_autenticado: z.enum(rolesValidos),
  rol_usuario_a_crear:     z.enum(rolesValidos),
});

export type TPermisosCreacion = z.infer<typeof esquemaPermisosCreacion>;


