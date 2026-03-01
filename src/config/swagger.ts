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
      description: `Sistema de gestión de novedades académicas (Adición, Cambio de Jornada y Curso Dirigido).

**Stack:** Node.js · Express · TypeScript · PostgreSQL

**Autenticación:** Bearer JWT — Ejecuta \`POST /api/auth/login\` para obtener el token, luego haz clic en el botón  **Authorize** e ingresa: \`Bearer <tu_token>\`

---

###  Roles del sistema

| Rol | Descripción |
|---|---|
| **ESTUDIANTE** | Radica solicitudes de novedad. Requiere matrícula activa |
| **SECRETARIA** | Atiende, aprueba o rechaza solicitudes. Agrega observaciones |
| **ADMIN** | Acceso total + gestión de usuarios y secretarias |

---

###  Validaciones del sistema (ejecutadas al crear solicitudes)

Las siguientes reglas se validan automáticamente **en la BD via triggers** y en la capa de servicios:

1. **Matrícula activa** — El estudiante debe tener \`matricula_activa = TRUE\`
2. **Límite de solicitudes** — Máximo **3 solicitudes** por periodo académico
3. **Repitencias** — Máximo **2 reprobaciones** por curso (bloquea adición)
4. **Cupos disponibles** — La sección destino debe tener \`cupos_disponibles > 0\`
5. **Cruce de horario** — No puede haber solapamiento de horario con otras secciones

---

###  Formato de respuesta uniforme

Todos los endpoints devuelven:
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
        //  ACTUALIZADO — refleja la respuesta real del ServicioAutenticacion
        TokenRespuesta: {
          type: 'object',
          properties: {
            token:           { type: 'string',  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            id_usuario:      { type: 'integer', example: 1 },
            nombre_completo: { type: 'string',  example: 'Carlos Andres Perez Lopez' },
            rol:             { type: 'string',  enum: ['ESTUDIANTE', 'SECRETARIA', 'ADMIN'], example: 'ESTUDIANTE' },
            expira_en:       { type: 'string',  example: '2h' },
          },
        },
        LoginBody: {
          type: 'object',
          required: ['email_institucional', 'password'],
          properties: {
            email_institucional: {
              type:        'string',
              format:      'email',
              example:     'c.perez@proyectonovedades.edu.co',
              description: 'Correo electrónico institucional (aplica para ESTUDIANTE, SECRETARIA y ADMIN)',
            },
            password: {
              type:        'string',
              format:      'password',
              minLength:   6,
              example:     'Password123',
              description: 'Contraseña del usuario (mínimo 6 caracteres)',
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
        name:        ' Health',
        description: 'Estado y disponibilidad del servidor. Rutas públicas.',
      },
      {
        name:        ' Autenticación',
        description: `Endpoints de inicio de sesión y gestión de tokens JWT.

**Rutas públicas — no requieren token.**

**Usuarios de prueba:**
| Email | Contraseña | Rol | Estado |
|---|---|---|---|
| c.perez@proyectonovedades.edu.co | Password123 | ESTUDIANTE |  activo |
| l.gomez@proyectonovedades.edu.co | Password123 | ESTUDIANTE |  activo |
| m.torres@proyectonovedades.edu.co | Password123 | ESTUDIANTE |  matrícula inactiva |
| secretaria@proyectonovedades.edu.co | Password123 | SECRETARIA |  activo |
| admin@proyectonovedades.edu.co | Password123 | ADMIN |  activo |`,
      },
      {
        name:        'Solicitudes',
        description: `Gestión de novedades académicas (Adición, Cambio de Jornada, Curso Dirigido).

**Acceso por rol:**
-  **ESTUDIANTE** — Crea y consulta sus propias solicitudes
-  **SECRETARIA** — Ve todas las solicitudes, aprueba/rechaza/observa
-  **ADMIN** — Acceso total

**Validaciones ejecutadas al crear una solicitud (en orden):**
1.  Matrícula activa del estudiante
2.  Máximo 3 solicitudes por periodo académico
3.  Límite de repitencias (máx. 2 reprobaciones por curso)
4.  Cupos disponibles en la sección destino
5.  Sin cruce de horario con secciones ya registradas`,
      },
      {
        name:        ' Estudiantes',
        description: 'Consulta y gestión de datos académicos de estudiantes. Solo **ADMIN**.',
      },
      {
        name:        ' Usuarios',
        description: 'Gestión de usuarios del sistema (crear secretarias, activar/desactivar). Solo **ADMIN**.',
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

