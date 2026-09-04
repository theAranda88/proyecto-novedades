# REPORTE TÉCNICO — Proyecto Novedades v2.0
**Fecha:** 2026-03-01 | **Estado de compilación:** ✅ LIMPIA (0 errores TypeScript)

---

## 1. COMPILACIÓN Y CÓDIGO

| Archivo | Estado | Notas |
|---|---|---|
| `services/AutenticadorService.ts` | ✅ OK | 1 WARNING IDE (SQL dialect) — no afecta ejecución |
| `services/SolicitudService.ts` | ✅ OK | Corregido: return directo eliminando variable redundante |
| `repositories/usuario.repository.ts` | ✅ OK | Corregido: `id_usuario` en lugar de `id` en WHERE |
| `repositories/solicitud.repository.ts` | ✅ OK | Corregido: `actualizarEstado` usa 4 params correctos |
| `controllers/AuthController.ts` | ✅ OK | Sin errores |
| `controllers/SolicitudController.ts` | ✅ OK | Sin errores |
| `middlewares/authMiddleware.ts` | ✅ OK | Warnings de IDE, sin errores reales |
| `middlewares/errorHandler.ts` | ✅ OK | Sin errores |
| `routes/authRoutes.ts` | ✅ OK | Sin errores |
| `routes/solicitudRoutes.ts` | ✅ OK | Sin errores |
| `config/swagger.ts` | ✅ OK | Sin errores |
| `utils/RespuestaUtil.ts` | ✅ OK | Sin errores |
| `app.ts` | ✅ OK | Sin errores |
| `server.ts` | ✅ OK | Sin errores |

---

## 2. ARQUITECTURA IMPLEMENTADA

```
src/
├── app.ts              → Express + CORS + Helmet + RateLimit + Rutas
├── server.ts           → Arranque + verificación PostgreSQL
├── config/
│   ├── database.ts     → Pool de conexiones PostgreSQL
│   └── swagger.ts      → OpenAPI 3.0 + Swagger UI (/api/docs)
├── controllers/
│   ├── AuthController.ts       → login, cambiarPassword, olvidoPassword
│   └── SolicitudController.ts  → crear, listarMias, listarTodas, actualizarEstado
├── services/
│   ├── AutenticadorService.ts  → HU_001 completa
│   └── SolicitudService.ts     → Motor de validaciones HU_DB §5
├── repositories/
│   ├── usuario.repository.ts   → CRUD tabla usuarios + estudiantes
│   └── solicitud.repository.ts → CRUD solicitudes + grupos_curso + historial_v2
├── middlewares/
│   ├── authMiddleware.ts  → verificarToken, verificarRol, validarEsquema
│   └── errorHandler.ts   → ErrorNegocio, ErrorAutenticacion, ErrorBaseDatos
├── routes/
│   ├── authRoutes.ts      → /api/auth/*
│   └── solicitudRoutes.ts → /api/solicitudes/*
├── schemas/
│   ├── auth.schema.ts      → Zod: login, cambioPassword, recuperarPassword
│   └── solicitud.schema.ts → Zod: crearSolicitud, actualizarEstado
└── utils/
    ├── RespuestaUtil.ts          → { ok, mensaje, datos, codigo_estado }
    └── REPORTE_TECNICO_v2.md    → Este documento
```

---

## 3. REGLAS DE NEGOCIO IMPLEMENTADAS (HU_DB §5)

### 3.1 Motor de Validaciones — `SolicitudService.ts`

Cada tipo ejecuta validaciones en orden y guarda el resultado en `validacion_json`:

#### ADICION_CURSO (§5.3)
| # | Chequeo | Columna BD | Lógica |
|---|---|---|---|
| 1 | `creditos_max_permitidos` | `creditos_inscritos + creditos_nuevos` | `total <= creditos_max_permitidos` |
| 2 | `cupos_disponibles` | `grupos_curso.cupos_ocupados` | `cupos_ocupados < cupo_maximo` |
| 3 | `sin_cruce_horario` | `inscripciones_activas` + `grupos_curso` | Teorema de Allen (minutos) |
| 4 | `materia_no_aprobada_previamente` | `historial_v2.estado` | `estado !== 'aprobada'` |

#### CAMBIO_CURSO (§5.1)
| # | Chequeo | Lógica |
|---|---|---|
| 1 | `inscripcion_activa` | Existe en `inscripciones_activas` el grupo actual |
| 2 | `estado_materia_no_reprobada` | `historial_v2.estado !== 'reprobada'` |
| 3 | `estado_academico_normal` | `estado_academico === 'normal'` |
| 4 | `cupos_disponibles` | `cupos_ocupados < cupo_maximo` en el grupo nuevo |
| 5 | `sin_cruce_horario` | Teorema de Allen (excluyendo el grupo actual) |

#### CAMBIO_JORNADA (§5.2)
| # | Chequeo | Lógica |
|---|---|---|
| 1 | `jornada_diferente` | `jornada_nueva !== jornada_actual` |
| 2 | `grupos_jornada_disponibles` | Existen grupos activos con cupos en la nueva jornada para **todas** las materias inscritas |

#### CURSO_DIRIGIDO (§5.4)
| # | Chequeo | Lógica |
|---|---|---|
| 1 | `materia_reprobada_previa` | `historial_v2.estado === 'reprobada'` |
| 2 | `numero_intentos_suficiente` | `numero_intentos >= 1` |
| 3 | `estado_academico_habilitado` | `estado_academico !== 'suspendido'` |

### 3.2 Regla transversal — Límite de solicitudes
- Máximo **3 solicitudes activas** (PENDIENTE o APROBADA) por estudiante por periodo.
- Se verifica **antes** de ejecutar las validaciones específicas del tipo.

---

## 4. SEGURIDAD — HU_001

| Regla | Implementación | Archivo |
|---|---|---|
| Login con correo institucional | `esquemaLogin` (Zod) + `buscarPorCorreo()` | `auth.schema.ts` / `usuario.repository.ts` |
| Login Google Workspace | `esquemaLoginGoogle` + `verifyIdToken` + dominio `uniautonoma.edu.co` | `AutenticadorService.ts` |
| bcrypt cost ≥ 12 | `BCRYPT_COST = 12` desde `.env` | `AutenticadorService.ts` |
| Bloqueo 5 intentos / 15 min | `registrarIntentoFallido()` → `bloqueado_hasta = NOW() + 15min` | `usuario.repository.ts` |
| HTTP 423 cuenta bloqueada | Chequeo `bloqueado_hasta > NOW()` antes de bcrypt | `AutenticadorService.ts` |
| Primer login obligatorio | `verificarTokenCambioPassword` no bloquea / `verificarToken` sí bloquea con HTTP 403 | `authMiddleware.ts` |
| Soft delete | Todas las queries filtran `deleted_at IS NULL` | Todos los repositories |
| Rol en minúscula | `LOWER(rol::TEXT)` en SQL + `RolUsuario` enum | `usuario.repository.ts` / `authMiddleware.ts` |
| JWT payload completo | `id_usuario, nombre_completo, rol, codigo_estudiantil, primer_login` | `AutenticadorService.ts` |
| Rate limit login | 10 intentos / 15 min por IP | `app.ts` (express-rate-limit) |
| CORS lista blanca | Solo orígenes de `.env` `CORS_ORIGIN_DEV` / `CORS_ORIGIN_PROD` | `app.ts` |
| Helmet CSP | Headers de seguridad HTTP con excepción para Swagger UI | `app.ts` |

---

## 5. CONTROL DE ACCESO POR ROL

| Endpoint | estudiante | secretaria | admin |
|---|:---:|:---:|:---:|
| `POST /api/auth/login` | ✅ | ✅ | ✅ |
| `POST /api/auth/google` | ✅ | ✅ | ✅ |
| `POST /api/auth/change-password` | ✅ | ✅ | ✅ |
| `POST /api/auth/forgot-password` | ✅ | ✅ | ✅ |
| `POST /api/solicitudes` | ✅ | ❌ | ✅ |
| `GET /api/solicitudes/mias` | ✅ | ❌ | ❌ |
| `GET /api/solicitudes` | ❌ | ✅ | ✅ |
| `PATCH /api/solicitudes/:id/estado` | ❌ | ✅ | ✅ |

---

## 6. DOCUMENTACIÓN

### Swagger UI — `/api/docs`
| Sección | Estado | Contenido |
|---|---|---|
| Tag `Autenticacion` | ✅ | login, change-password, forgot-password con todos los ejemplos y respuestas |
| Tag `Solicitudes` | ✅ | POST/GET/PATCH con tabla de validaciones HU_DB §5 |
| Tag `Health` | ✅ | GET /api/health |
| Esquemas reutilizables | ✅ | `LoginBody`, `TokenRespuesta`, `ValidacionJson`, `CrearSolicitudBody`, `ActualizarEstadoBody`, `RespuestaExito`, `RespuestaError` |
| BearerAuth | ✅ | Boton "Authorize" con JWT |
| Credenciales de prueba | ✅ | Tabla en descripcion del tag con todos los usuarios seed |
| `persistAuthorization` | ✅ | El token persiste al recargar la pagina |

### Coleccion Postman — `Proyecto-Novedades.postman_collection.json`
| Carpeta | Requests | Estado |
|---|---|---|
| Health Check | 1 | ✅ Actualizado |
| Autenticacion (HU_001) | 8 | ✅ Correo + password, Google `id_token`, `primer_login`, token temporal |
| Solicitudes de Novedad (HU_DB §5) | 9 | ✅ Nuevo — adicion, cambio_curso, cambio_jornada, curso_dirigido, PATCH estados |

**Variables Postman:**
- `{{token}}` — se llena automaticamente al hacer login exitoso
- `{{token_primer_login}}` — token temporal para `change-password`
- `{{google_id_token}}` — ID token de Google Identity Services para `POST /api/auth/google`

---

## 7. BASE DE DATOS — Estado

| Tabla | Funcion | Registros |
|---|---|---|
| `usuarios` | Login + roles (admin, secretaria, estudiante) | 5 seed |
| `estudiantes` | Perfil academico + `usuario_id` FK | Vinculados con usuarios |
| `cursos` | Catalogo de materias | Seed |
| `grupos_curso` | Secciones con horario + cupos | 8 grupos |
| `historial_v2` | Historial academico (estado, intentos, nota) | 2 registros |
| `inscripciones_activas` | Materias inscritas actualmente | Seed |
| `solicitudes` | Novedades academicas + `validacion_json` | 0 (listo para crear) |
| `notificaciones` | Notificaciones al estudiante | Tabla lista |

**Columnas clave anadidas por migraciones:**
- `usuarios`: `codigo_estudiantil`, `primer_login`, `intentos_fallidos`, `bloqueado_hasta`, `ultimo_login`, `created_at`, `updated_at`, `deleted_at`, `created_by`, `updated_by`
- `estudiantes`: `usuario_id` (FK), `estado_academico`, `creditos_inscritos`, `creditos_max_permitidos`, `jornada`, auditoria completa
- `solicitudes`: `codigo_solicitud`, `validacion_json`, `created_by`, `updated_by`, `deleted_at`

---

## 8. ENDPOINTS DISPONIBLES PARA PROBAR EN POSTMAN

```
GET  http://localhost:3000/api/health                          → Sin token
GET  http://localhost:3000/api/docs                            → Swagger UI

POST http://localhost:3000/api/auth/login                      → Sin token
POST http://localhost:3000/api/auth/change-password            → Token primer_login
POST http://localhost:3000/api/auth/forgot-password            → Sin token

POST http://localhost:3000/api/solicitudes                     → Token ESTUDIANTE
GET  http://localhost:3000/api/solicitudes/mias?periodo=2026-1 → Token ESTUDIANTE
GET  http://localhost:3000/api/solicitudes?periodo=2026-1      → Token SECRETARIA/ADMIN
PATCH http://localhost:3000/api/solicitudes/:id/estado         → Token SECRETARIA/ADMIN
```

---

## 9. CORRECCIONES APLICADAS EN ESTA SESION

| # | Problema | Archivo | Correccion |
|---|---|---|---|
| 1 | `WHERE id = $1` incorrecto | `AutenticadorService.ts` | Cambiado a `WHERE id_usuario = $1` |
| 2 | Variable `solicitud` redundante | `SolicitudService.ts` | `return` directo desde `repoSolicitud.crearSolicitud()` |
| 3 | `actualizarEstado` con `$3` saltado | `solicitud.repository.ts` | Query corregida: `$1` estado, `$2` observaciones → `motivo_novedad`, `$3` updated_by, `$4` id |
| 4 | `solicitud.repository.ts` duplicado | `solicitud.repository.ts` | Truncado a 451 lineas eliminando el bloque duplicado |

---

## 10. PROXIMO PASO SUGERIDO

Con el sistema funcionando correctamente, el siguiente modulo a implementar seria:

1. **Modulo Admin** — `POST /api/usuarios` para crear secretarias/estudiantes (solo admin)
2. **Modulo Estudiantes** — `GET /api/estudiantes/perfil` para que el estudiante vea su perfil academico
3. **Notificaciones** — Disparar notificacion al aprobar/rechazar una solicitud (tabla `notificaciones` ya existe)

---

## 11. NOTAS DE MANTENIMIENTO

### Warnings del IDE (JetBrains) — NO son errores
Los mensajes **"SQL dialect is not configured"** son cosmeticos del IDE.
Para eliminarlos: `Settings → Languages & Frameworks → SQL Dialects → PostgreSQL`

### Arrancar el servidor
```bash
npx ts-node src/server.ts
```

### Verificar compilacion
```bash
npx tsc --noEmit
```

### Variables de entorno requeridas (`.env`)
```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=proyecto_novedades
DB_USER=postgres
DB_PASSWORD=admin123
JWT_SECRET=tu_secreto_jwt
JWT_EXPIRES_IN=8h
BCRYPT_COST=12
CORS_ORIGIN_DEV=http://localhost:4200
```

