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

### 🔐 Credenciales de Prueba

**Contraseña universal para TODOS:** \`Password123\`

#### Estudiantes (para crear solicitudes)
| Código | Nombre | Programa | Semestre | Cursos | Estado |
|--------|--------|----------|----------|--------|--------|
| **2024001** | Carlos Andres Perez Lopez | Ingenieria Sistemas | 3 | PRG201-G01 | normal |
| **2024002** | Maria Fernanda Lopez Torres | Ingenieria Industrial | 2 | (ninguno) | normal |
| **2024003** | Juan Carlos Martínez García | Ingenieria Sistemas | 4 | MAT101-G01, EST301-G01 | normal |
| **2024004** | Sofia Alejandra Ruiz Mendez | Ingenieria Industrial | 3 | PRG201-G02, EST301-G02 | normal |
| **2024005** | Miguel Angel Peña Rodríguez | Admin. Empresas | 2 | MAT101-G02, PRG201-G02 | normal |
| **2024006** | Laura Patricia Sánchez López | Ingenieria Sistemas | 5 | PRG201-G03, MAT101-G03 | normal |
| **2024007** | David Fernando Torres Castillo | Ingenieria Industrial | 3 | EST301-G01 | bajo_rendimiento |
| **2024008** | Ana Beatriz Flores Gutierrez | Admin. Empresas | 6 | MAT101-G01, PRG201-G01, EST301-G01 | normal |
| **2023010** | Luis Eduardo Gomez Rios | Admin. Empresas | 4 | (ninguno) | ❌ Matricula INACTIVA |

#### Personal Administrativo
| Código | Nombre | Rol |
|--------|--------|-----|
| **SEC001** | Ana Maria Rodriguez Soto | secretaria |
| **ADMIN001** | Administrador del Sistema | admin |

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
| **cambio_jornada** | Jornada diferente, grupos con cupos en nueva jornada (todos los cursos o uno específico si incluye curso_id) |
| **curso_dirigido** | Curso NO se oferta en semestre, máximo 3 estudiantes, sin cruce horario, estado académico |

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
        CrearUsuarioBody: {
          type: 'object',
          required: ['nombre_completo', 'email_institucional', 'codigo_estudiantil', 'rol'],
          properties: {
            nombre_completo: {
              type:        'string',
              minLength:   3,
              maxLength:   200,
              example:     'Juan Pedro Rodríguez García',
              description: 'Nombre completo del usuario (solo letras y espacios)',
            },
            email_institucional: {
              type:        'string',
              format:      'email',
              maxLength:   150,
              example:     'jrodriguez@proyectonovedades.edu.co',
              description: 'Email institucional (único)',
            },
            codigo_estudiantil: {
              type:        'string',
              minLength:   1,
              maxLength:   20,
              example:     '2025001',
              description: 'Código estudiantil o institucional (único)',
            },
            rol: {
              type:        'string',
              enum:        ['ESTUDIANTE', 'SECRETARIA', 'ADMIN'],
              example:     'ESTUDIANTE',
              description: 'Rol a asignar al nuevo usuario',
            },
          },
        },
        UsuarioCreado: {
          type: 'object',
          properties: {
            id_usuario:           { type: 'integer', example: 12 },
            nombre_completo:      { type: 'string',  example: 'Juan Pedro Rodríguez García' },
            email_institucional:  { type: 'string',  example: 'jrodriguez@proyectonovedades.edu.co' },
            codigo_estudiantil:   { type: 'string',  example: '2025001' },
            rol:                  { type: 'string',  example: 'estudiante' },
            primer_login:         { type: 'boolean', example: true, description: 'Usuario debe cambiar password al primer login' },
            contrasena_temporal:  { type: 'string',  example: 'KmNp8QhL54', description: '⚠️ Mostrar UNA sola vez al crear' },
            mensaje_contrasena:   { type: 'string',  description: 'Instructivo sobre qué hacer con la contraseña temporal' },
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
            curso_id: {
              type: 'integer',
              example: 1,
              description: '(Opcional) ID del curso para cambio de jornada específico. Si se omite, se validan todos los cursos inscritos.'
            },
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
        // ─── Schema para adjunto de documentos en Base64 ─────────────────
        AdjuntoBase64Body: {
          type: 'object',
          required: ['nombre_archivo', 'archivo_base64'],
          properties: {
            nombre_archivo: {
              type:    'string',
              example: 'Horario_Actual_2026.pdf',
              description: 'Nombre original del archivo con extensión',
            },
            archivo_base64: {
              type:    'string',
              example: 'data:application/pdf;base64,JVBERi0xLjQ...',
              description: 'Archivo codificado en Base64 con prefijo. Tipos: PDF, JPG, PNG. Máx: 5MB',
            },
          },
        },
        // ─── Schema para perfil académico del estudiante ──────────────────
        PerfilEstudiante: {
          type: 'object',
          properties: {
            cod_alumno:              { type: 'string',  example: '2023-1025043' },
            nombre_completo:         { type: 'string',  example: 'Andrés Felipe Rodríguez' },
            email_institucional:     { type: 'string',  example: 'a.rodriguez@proyectonovedades.edu.co' },
            semestre:                { type: 'integer', example: 7 },
            nombre_programa:         { type: 'string',  example: 'Ingeniería de Sistemas' },
            jornada:                 { type: 'string',  enum: ['manana','tarde','noche'], example: 'manana' },
            creditos_inscritos:      { type: 'integer', example: 9 },
            creditos_max_permitidos: { type: 'integer', example: 20 },
            estado_academico:        { type: 'string',  enum: ['normal','bajo_rendimiento','suspendido'], example: 'normal' },
            matricula_activa:        { type: 'boolean', example: true },
          },
        },
        // ─── Schema para grupo de curso en los dropdowns ──────────────────
        GrupoCurso: {
          type: 'object',
          properties: {
            id:                { type: 'integer', example: 1 },
            codigo_grupo:      { type: 'string',  example: 'G-01' },
            nombre_curso:      { type: 'string',  example: 'Cálculo Diferencial' },
            cod_curso:         { type: 'string',  example: 'MAT101' },
            jornada:           { type: 'string',  enum: ['manana','tarde','noche'], example: 'manana' },
            dia_semana:        { type: 'string',  example: 'lunes' },
            hora_inicio:       { type: 'string',  example: '07:00:00' },
            hora_fin:          { type: 'string',  example: '09:00:00' },
            docente:           { type: 'string',  example: 'Dr. Ramon Suarez' },
            aula:              { type: 'string',  example: 'Aula-201', nullable: true },
            cupo_maximo:       { type: 'integer', example: 35 },
            cupos_ocupados:    { type: 'integer', example: 9 },
            cupos_disponibles: { type: 'integer', example: 26 },
            periodo:           { type: 'string',  example: '2026-1' },
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
        description: `Endpoints del módulo estudiante para el formulario de solicitud.

**GET /api/estudiantes/perfil** — Pre-carga automática de la sección "Información Académica":
- nombre_completo, cod_alumno, nombre_programa, semestre, jornada

**GET /api/grupos** — Dropdowns del formulario:
- Lista grupos disponibles (cupos > 0) filtrados por periodo, curso_id o jornada

**POST /api/estudiantes/solicitudes/:id/adjunto** — Adjuntar documento:
- Acepta PDF, JPG, PNG en Base64. Máximo 5MB por archivo.`,
      },
      {
        name:        'Usuarios',
        description: `Gestión de usuarios del sistema — Creación con control de roles.

**Reglas de autorización (HU_001 §CA-01):**
| Rol Usuario | Puede crear | Ejemplos |
|---|---|---|
| **ADMIN** | ADMIN, SECRETARIA, ESTUDIANTE | Crear admin adicional, secretarias, estudiantes |
| **SECRETARIA** | ESTUDIANTE | Crear cuentas de estudiantes |
| **ESTUDIANTE** | ✗ Ninguno (403) | No permitido |

**Flujo de primer login:**
1. Usuario creado con \`primer_login = TRUE\`
2. Contraseña temporal generada automáticamente (mostrar UNA sola vez)
3. Usuario debe cambiarla obligatoriamente en primer acceso via \`POST /api/auth/change-password\`
4. Luego puede acceder al sistema normalmente

**Endpoints:**
- \`POST /api/usuarios\` — Crear nuevo usuario
- \`GET /api/usuarios/roles-permitidos\` — Obtener roles que puede crear el usuario actual`,
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

