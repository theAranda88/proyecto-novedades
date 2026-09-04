// src/schemas/auth.schema.ts
// Esquemas de validación Zod para todos los endpoints de autenticación

import { z } from 'zod';

/**
 * Esquema para POST /api/auth/login
 * Valida correo institucional y password (mín. 8 chars).
 */
export const esquemaLogin = z.object({
  correo: z
    .string({ error: 'El correo es obligatorio' })
    .trim()
    .min(1, 'El correo no puede estar vacío')
    .max(150, 'El correo no puede superar 150 caracteres')
    .email('Debe proporcionar un correo válido')
    .transform((valor) => valor.toLowerCase()),

  password: z
    .string({ error: 'La contraseña es obligatoria' })
    .min(8, 'La contraseña debe tener mínimo 8 caracteres'),
});

/**
 * Esquema para POST /api/auth/google
 * El ID token lo emite Google Identity Services en el cliente (Angular).
 */
export const esquemaLoginGoogle = z.object({
  id_token: z
    .string({ error: 'El token de Google es obligatorio' })
    .min(20, 'El token de Google no es válido'),
});

/**
 * Esquema para POST /api/auth/change-password (HU_001 §CA-03)
 * Exige contraseña nueva con mínimo 8 chars y al menos 1 número.
 */
export const esquemaCambioPassword = z.object({
  password_actual: z
    .string({ error: 'La contraseña actual es obligatoria' })
    .min(8, 'La contraseña actual debe tener mínimo 8 caracteres'),

  password_nueva: z
    .string({ error: 'La nueva contraseña es obligatoria' })
    .min(8, 'La nueva contraseña debe tener mínimo 8 caracteres')
    .regex(/\d/, 'La nueva contraseña debe incluir al menos un número')
    .regex(/[a-zA-Z]/, 'La nueva contraseña debe incluir al menos una letra'),
});

/**
 * Esquema para POST /api/auth/forgot-password (HU_001 §CA-05)
 * Solo requiere el correo institucional para iniciar recuperación.
 */
export const esquemaRecuperarPassword = z.object({
  correo: z
    .string({ error: 'El correo es obligatorio' })
    .trim()
    .min(1, 'El correo no puede estar vacío')
    .max(150, 'El correo no puede superar 150 caracteres')
    .email('Debe proporcionar un correo válido')
    .transform((valor) => valor.toLowerCase()),
});

export type TDatosLogin             = z.infer<typeof esquemaLogin>;
export type TDatosLoginGoogle       = z.infer<typeof esquemaLoginGoogle>;
export type TDatosCambioPassword    = z.infer<typeof esquemaCambioPassword>;
export type TDatosRecuperarPassword = z.infer<typeof esquemaRecuperarPassword>;
