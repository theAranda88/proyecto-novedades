// src/schemas/auth.schema.ts
// Esquemas de validación Zod para los endpoints de autenticación

import { z } from 'zod';

/**
 * Esquema de validación para el body del endpoint POST /api/auth/login.
 * Valida que el email tenga formato institucional y que la contraseña
 * cumpla el mínimo de seguridad antes de llegar al controlador.
 *
 * @validacion email_institucional — formato email válido, máx 150 caracteres
 * @validacion password            — mínimo 6 caracteres
 */
export const esquemaLogin = z.object({
  email_institucional: z
    .string({ error: 'El email institucional es obligatorio' })
    .email('El formato del email institucional no es válido')
    .max(150, 'El email no puede superar los 150 caracteres'),

  password: z
    .string({ error: 'La contraseña es obligatoria' })
    .min(6, 'La contraseña debe tener mínimo 6 caracteres'),
});

/** Tipo inferido del esquema de login para uso en TypeScript */
export type TDatosLogin = z.infer<typeof esquemaLogin>;

