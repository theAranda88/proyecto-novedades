// src/config/swagger.ts
// Configuración central de Swagger UI y JSDoc para la documentación de la API

import swaggerJSDoc  from 'swagger-jsdoc';
import swaggerUi     from 'swagger-ui-express';
import { Express }   from 'express';

/**
 * Opciones de configuración para swagger-jsdoc.
 * Define la información general de la API y los archivos
 * donde se encuentran los comentarios JSDoc con anotaciones OpenAPI.
 */
const opcionesSwaggerJSDoc: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'Proyecto Novedades — API',
      version:     '1.0.0',
      description: `Sistema de gestión de novedades académicas — Proyecto Novedades (HU_DB v1.0).

**Stack:** Node.js · Express · TypeScript · PostgreSQL

**Autenticación:** Bearer JWT — Ejecuta \`POST /api/auth/login\` para obtener el token, luego haz clic en **Authorize** e ingresa: \`Bearer <tu_token>\`

---

### Roles del sistema

| Rol | Descripción |
|---|---|
| **estudiante** | Radica solicitudes de novedad. Requiere matricula_activa = TRUE |
| **secretaria** | Atiende, aprueba o rechaza solicitudes |
| **admin** | Acceso total + gestión de usuarios |

---

### Flujo de autenticación (HU_001)

1. \`POST /api/auth/login\` con \`codigo_estudiantil\` + \`password\`
2. Si \`primer_login = true\`: usar el token en \`POST /api/auth/change-password\` para cambiar contraseña temporal
3. Si \`primer_login = false\`: usar el token en todos los demás endpoints

---

### Motor de validaciones (HU_DB §5)

Al crear una solicitud se ejecutan validaciones automáticas y se guarda \`validacion_json\`:

| Tipo | Validaciones |
|---|---|
| **adicion_curso** | Créditos max, cupos, cruce horario, no aprobada previa |
| **cambio_curso** | Inscripción activa, no reprobada, estado_academico, cupos, cruce horario |
| **cambio_jornada** | Jornada diferente, grupos con cupos en nueva jornada |
| **curso_dirigido** | Reprobada previa, numero_intentos ≥ 1, estado_academico |

---

### Formato de respuesta uniforme

\`\`\`json
{
  "ok": true | false,
  "mensaje": "Descripción del resultado",
  "datos": { ... } | null,
  "codigo_estado": 200
}
\`\`\``,
      contact: {
        name:  'Equipo Proyecto Novedades',
        email: 'soporte@proyectonovedades.edu.co',
      },
    },
    servers: [
      {
        url:         'http://localhost:3000',
        description: 'Servidor de Desarrollo',
      },
      {
        url:         'https://api.proyectonovedades.edu.co',
        description: ' Servidor de Producción',
      },
    ],
    // Esquema de seguridad JWT para el botón "Authorize" de Swagger UI
    components: {
      securitySchemes: {
        BearerAuth: {
          type:         'http',
          scheme:       'bearer',
          bearerFormat: 'JWT',
          description:  'Ingresa el token JWT obtenido del endpoint /api/auth/login',
        },
      },
      // Esquemas de respuesta reutilizables en toda la documentación
      schemas: {
        RespuestaExito: {
          type: 'object',
          properties: {
            ok:            { type: 'boolean', example: true },
            mensaje:       { type: 'string',  example: 'Operación realizada exitosamente' },
            datos:         { type: 'object',  nullable: true },
            codigo_estado: { type: 'integer', example: 200 },
          },
        },
        RespuestaError: {
          type: 'object',
          properties: {
            ok:            { type: 'boolean', example: false },
            mensaje:       { type: 'string',  example: 'Descripción del error' },
            datos:         { type: 'object',  nullable: true, example: null },
            codigo_estado: { type: 'integer', example: 400 },
          },
        },
        TokenRespuesta: {
          type: 'object',
          properties: {
            token:              { type: 'string',  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            id_usuario:         { type: 'integer', example: 3 },
            nombre_completo:    { type: 'string',  example: 'Carlos Andres Perez Lopez' },
            rol:                { type: 'string',  enum: ['estudiante', 'secretaria', 'admin'], example: 'estudiante' },
            primer_login:       { type: 'boolean', example: false, description: 'Si true debe ir a /change-password' },
            codigo_estudiantil: { type: 'string',  example: '2024001' },
            expira_en:          { type: 'string',  example: '8h' },
          },
        },
        LoginBody: {
          type: 'object',
          required: ['codigo_estudiantil', 'password'],
          properties: {
            codigo_estudiantil: {
              type:        'string',
              example:     '2024001',
              description: 'Código estudiantil institucional',
            },
            password: {
              type:        'string',
              format:      'password',
              minLength:   8,
              example:     'Password123',
              description: 'Contraseña del usuario (mínimo 8 caracteres)',
            },
          },
        },
        CambioPasswordBody: {
          type: 'object',
          required: ['password_actual', 'password_nueva'],
          properties: {
            password_actual: {
              type:      'string',
              format:    'password',
              example:   'Password123',
              description: 'Contraseña temporal asignada por el admin',
            },
            password_nueva: {
              type:      'string',
              format:    'password',
              example:   'NuevaContrasena456',
              description: 'Nueva contraseña (mín. 8 chars, 1 número, 1 letra)',
            },
          },
        },
        ValidacionJson: {
          type: 'object',
          properties: {
            timestamp:      { type: 'string', format: 'date-time' },
            tipo_solicitud: { type: 'string' },
            aprobado:       { type: 'boolean' },
            validaciones: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nombre:    { type: 'string' },
                  resultado: { type: 'boolean' },
                  detalle:   { type: 'string' },
                },
              },
            },
          },
        },
        CrearSolicitudBody: {
          type: 'object',
          required: ['tipo_solicitud', 'justificacion', 'periodo_academico'],
          properties: {
            tipo_solicitud: {
              type: 'string',
              enum: ['cambio_curso', 'cambio_jornada', 'curso_dirigido', 'adicion_curso'],
            },
            grupo_actual_id: { type: 'integer', example: 3 },
            grupo_nuevo_id:  { type: 'integer', example: 4 },
            jornada_actual:  { type: 'string', enum: ['manana','tarde','noche'] },
            jornada_nueva:   { type: 'string', enum: ['manana','tarde','noche'] },
            justificacion: {
              type:      'string',
              minLength: 50,
              example:   'Solicito adición del curso porque complementa mi formación y tengo disponibilidad horaria.',
            },
            periodo_academico: { type: 'string', example: '2026-1' },
          },
        },
        ActualizarEstadoBody: {
          type: 'object',
          required: ['estado'],
          properties: {
            estado: {
              type: 'string',
              enum: ['en_revision', 'aprobada', 'rechazada'],
            },
            observaciones: {
              type:      'string',
              maxLength: 1000,
              example:   'Solicitud válida. Se procede con la adición del curso.',
            },
          },
        },
        // ─── Schemas de dominio para las validaciones del sistema ───────────
        RolSistema: {
          type: 'string',
          enum: ['ESTUDIANTE', 'SECRETARIA', 'ADMIN'],
          description: `Roles del sistema y sus permisos:
- **ESTUDIANTE** — Radica solicitudes de novedad. Requiere matrícula activa
- **SECRETARIA** — Atiende y responde solicitudes (Aprueba / Rechaza / Observa)
- **ADMIN** — Acceso total + gestión de usuarios y secretarias`,
        },
        EstadoSolicitud: {
          type: 'string',
          enum: ['PENDIENTE', 'APROBADA', 'RECHAZADA'],
          description: 'Estado de una solicitud de novedad académica',
        },
        TipoNovedad: {
          type: 'string',
          enum: ['ADICION', 'CAMBIO_JORNADA', 'CURSO_DIRIGIDO'],
          description: `Tipos de novedad académica soportados:
- **ADICION** — Agregar una nueva sección al horario del estudiante
- **CAMBIO_JORNADA** — Cambiar de jornada/grupo en un curso ya matriculado
- **CURSO_DIRIGIDO** — Solicitud de curso en modalidad dirigida`,
        },
      },
    },
    // Seguridad global — aplica BearerAuth a todos los endpoints por defecto
    security: [{ BearerAuth: [] }],
    // Agrupación de endpoints por módulo
    tags: [
      {
        name:        'Health',
        description: 'Estado y disponibilidad del servidor. Ruta pública sin autenticación.',
      },
      {
        name:        'Autenticacion',
        description: `Endpoints de inicio de sesión y gestión de tokens JWT. **Rutas públicas — no requieren token.**

**Usuarios de prueba (codigo_estudiantil / contraseña):**
| Código | Contraseña | Rol | Estado |
|---|---|---|---|
| 2024001 | Password123 | estudiante | activo |
| 2024002 | Password123 | estudiante | activo |
| 2023010 | Password123 | estudiante | matricula inactiva |
| SEC001  | Password123 | secretaria | activo |
| ADMIN001| Password123 | admin      | activo |`,
      },
      {
        name:        'Solicitudes',
        description: `Gestión de novedades académicas según HU_DB §5.

**Acceso por rol:**
- **estudiante** — Crea y consulta sus propias solicitudes
- **secretaria** — Ve todas, aprueba/rechaza/observa
- **admin** — Acceso total

**Validaciones automáticas (motor de validaciones HU_DB §5):**
- **CAMBIO_CURSO**: inscripción activa, estado no reprobada, estado_academico normal, cupos, cruce horario
- **CAMBIO_JORNADA**: jornada diferente, grupos con cupos en nueva jornada
- **ADICION_CURSO**: creditos_max, cupos, cruce horario, materia no aprobada previamente
- **CURSO_DIRIGIDO**: reprobada previa, numero_intentos >= 1, estado_academico habilitado

El campo \`validacion_json\` registra el snapshot de cada chequeo ejecutado.`,
      },
      {
        name:        'Estudiantes',
        description: 'Consulta y gestión de datos académicos de estudiantes. Solo **admin**.',
      },
      {
        name:        'Usuarios',
        description: 'Gestión de usuarios del sistema (crear secretarias, activar/desactivar). Solo **admin**.',
      },
    ],
  },
  // Archivos donde swagger-jsdoc buscará los comentarios @swagger / @openapi
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
  ],
};

/**
 * Especificación OpenAPI generada a partir de los comentarios JSDoc
 * distribuidos en los archivos de rutas y controladores.
 */
export const especificacionSwagger = swaggerJSDoc(opcionesSwaggerJSDoc);

/**
 * Registra Swagger UI como middleware en la aplicación Express.
 * La documentación queda disponible en: http://localhost:3000/api/docs
 *
 * @param app - Instancia de la aplicación Express
 */
export function configurarSwagger(app: Express): void {
  // Opciones de visualización de Swagger UI
  const opcionesUI: swaggerUi.SwaggerUiOptions = {
    customSiteTitle: 'Proyecto Novedades — Docs',
    customCss: `
      .swagger-ui .topbar { background-color: #1a1a2e; }
      .swagger-ui .topbar-wrapper .link span { display: none; }
      .swagger-ui .topbar-wrapper::after {
        content: ' Proyecto Novedades — API Docs';
        color: white;
        font-size: 1.2rem;
        font-weight: bold;
        margin-left: 1rem;
      }
    `,
    swaggerOptions: {
      persistAuthorization: true,       // Mantiene el token al recargar la página
      displayRequestDuration: true,     // Muestra el tiempo de respuesta
      filter:                 true,     // Habilita filtro de búsqueda de endpoints
      docExpansion:           'list',   // Muestra los endpoints en lista (no expandidos)
      defaultModelsExpandDepth: 2,
    },
  };

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(especificacionSwagger, opcionesUI),
  );

  // Endpoint que expone el JSON de la especificación OpenAPI
  app.get('/api/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(especificacionSwagger);
  });

  console.log(` Swagger UI disponible en: http://localhost:${process.env.PORT ?? 3000}/api/docs`);
}

