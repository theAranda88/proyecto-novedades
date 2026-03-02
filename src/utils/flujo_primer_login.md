# Flujo de Primer Login y Cambio de Contraseña

## El problema que resuelve

El admin crea las cuentas con una contraseña temporal (ej: `Password123`).
El sistema **no permite usar ningún endpoint protegido** hasta que el usuario cambie esa contraseña.

---

## Flujo visual completo

```
ADMIN crea la cuenta en BD
  └─ password_hash = bcrypt("Password123")
  └─ primer_login  = TRUE   ← esta es la llave del flujo

         │
         ▼

╔══════════════════════════════════════════╗
║  PASO 1: POST /api/auth/login            ║
║  { codigo_estudiantil, password }        ║
╚══════════════════════════════════════════╝
         │
         ▼
  Sistema valida usuario, bloqueos, bcrypt...
         │
         ├─── primer_login = TRUE ──► Devuelve token TEMPORAL (restringido)
         │                            {
         │                              token: "eyJ...",
         │                              primer_login: TRUE,   ← señal de alerta
         │                              expira_en: "8h"
         │                            }
         │
         └─── primer_login = FALSE ─► Devuelve token COMPLETO (acceso total)
                                      {
                                        token: "eyJ...",
                                        primer_login: FALSE,
                                        rol: "estudiante"
                                      }

         │ (si primer_login = TRUE)
         ▼

╔══════════════════════════════════════════╗
║  PASO 2: POST /api/auth/change-password  ║
║  Header: Authorization: Bearer <token_temporal>
║  Body: {                                 ║
║    password_actual: "Password123",       ║
║    password_nueva:  "MiNuevaPass456"     ║
║  }                                       ║
╚══════════════════════════════════════════╝
         │
         ▼
  1. Verifica que primer_login = TRUE en el token
  2. Compara password_actual con bcrypt
  3. Valida password_nueva (min 8, 1 letra, 1 numero)
  4. Genera nuevo hash bcrypt (cost 12)
  5. UPDATE usuarios SET password_hash = nuevo, primer_login = FALSE
  6. Devuelve NUEVO token con primer_login = FALSE
         │
         ▼
  {
    token: "eyJ... (NUEVO TOKEN)",
    primer_login: FALSE,   ← ya puede usar todo
    rol: "estudiante"
  }

         │
         ▼

╔══════════════════════════════════════════╗
║  PASO 3: Cualquier endpoint protegido    ║
║  Header: Authorization: Bearer <nuevo_token>
╚══════════════════════════════════════════╝
  → verificarToken decodifica JWT
  → primer_login = FALSE → PERMITE el acceso
  → verificarRol determina que puede hacer
```

---

## Que pasa si intenta saltarse el paso 2?

Si el usuario tiene `primer_login = TRUE` en el token e intenta ir directo a
`POST /api/solicitudes` sin cambiar la contrasena:

```
authMiddleware.ts — verificarToken()

if (payload.primer_login === true) {
  → HTTP 403
  → "Debe cambiar su contrasena temporal antes de continuar.
     Use POST /api/auth/change-password"
}
```

**El middleware bloquea TODOS los endpoints protegidos** hasta que se cambie.
El unico endpoint que acepta ese token temporal es `/change-password`
porque usa `verificarTokenCambioPassword` (variante que no revisa primer_login).

---

## Codigo que ejecuta cada paso

### PASO 1 — AutenticadorService.ts

```typescript
// Lee primer_login directamente de la BD
const payload = {
  id_usuario:   usuario.id,
  rol:          usuario.rol,
  primer_login: usuario.primer_login,  // TRUE o FALSE desde BD
};

const token = jwt.sign(payload, secreto, { expiresIn: '8h' });
// El token lleva primer_login dentro — firmado con JWT_SECRET
```

### PASO 2 — AutenticadorService.ts

```typescript
async cambiarContrasena(idUsuario, datos) {

  // 1. Verifica que AUN sea primer login
  if (!usuario.primer_login) {
    throw HTTP 403 "Solo disponible en el primer acceso"
  }

  // 2. Verifica password actual
  const ok = await bcrypt.compare(datos.password_actual, usuario.password_hash);
  if (!ok) throw HTTP 400 "Contrasena actual incorrecta"

  // 3. No puede ser igual a la temporal
  if (datos.password_actual === datos.password_nueva)
    throw HTTP 400 "No puede ser igual a la temporal"

  // 4. Nuevo hash bcrypt
  const nuevoHash = await bcrypt.hash(datos.password_nueva, 12);

  // 5. UPDATE en BD: password_hash + primer_login = FALSE
  await repo.actualizarPassword(idUsuario, nuevoHash);
  //   → SET password_hash = $1, primer_login = FALSE

  // 6. Genera NUEVO JWT con primer_login = FALSE
  return { token: jwt.sign({ ...payload, primer_login: false }, secreto) }
}
```

### PASO 3 — authMiddleware.ts (el guardian)

```typescript
// En TODOS los endpoints protegidos
export const verificarToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  const payload = jwt.verify(token, secreto);

  // AQUI esta la clave del flujo
  if (payload.primer_login === true) {
    return HTTP 403 "Debe cambiar su contrasena temporal"
  }

  req.usuario = payload;  // inyecta el usuario en el request
  next();
}
```

---

## En Postman — paso a paso

### Primera vez que alguien entra al sistema:

```
1. POST /api/auth/login
   Body: { "codigo_estudiantil": "2024001", "password": "Password123" }

   Respuesta:
   {
     "datos": {
       "token": "eyJ...",
       "primer_login": true   ← el sistema avisa aqui
     }
   }

   El script Postman guarda en {{token_primer_login}} (NO en {{token}})

─────────────────────────────────────────────────

2. POST /api/auth/change-password
   Header: Authorization: Bearer {{token_primer_login}}
   Body: {
     "password_actual": "Password123",
     "password_nueva":  "MiPassword456"
   }

   Respuesta:
   {
     "datos": {
       "token": "eyJ...(NUEVO)",
       "primer_login": false   ← ya cambio
     }
   }

   El script Postman guarda el NUEVO token en {{token}}
   y limpia {{token_primer_login}}

─────────────────────────────────────────────────

3. POST /api/solicitudes   (o cualquier endpoint)
   Header: Authorization: Bearer {{token}}   ← el nuevo
   → Funciona sin problemas
```

---

## Estado en BD antes y despues

```
ANTES del cambio:
  tabla usuarios:
  ┌─────────────┬──────────────┬─────────────┐
  │ codigo      │ password_hash│ primer_login│
  ├─────────────┼──────────────┼─────────────┤
  │ 2024001     │ $2b$12$abc...│    TRUE     │
  └─────────────┴──────────────┴─────────────┘

DESPUES del cambio:
  ┌─────────────┬──────────────┬─────────────┐
  │ codigo      │ password_hash│ primer_login│
  ├─────────────┼──────────────┼─────────────┤
  │ 2024001     │ $2b$12$xyz...│    FALSE    │ ← diferente hash
  └─────────────┴──────────────┴─────────────┘
```

---

## Resumen — 2 tipos de token

| Token | Cuando se genera | Que puede hacer |
|---|---|---|
| **Token temporal** | Login con `primer_login = TRUE` | **Solo** `POST /change-password` |
| **Token completo** | Login normal O despues de cambiar contrasena | Todos los endpoints segun el rol |

La diferencia entre los dos tokens es **una sola propiedad** dentro del JWT:

```
primer_login: true   → bloqueado en todos lados excepto /change-password
primer_login: false  → acceso normal segun el rol
```

El JWT esta firmado con `JWT_SECRET` — el cliente no puede modificarlo.

---

## Archivos involucrados

| Archivo | Responsabilidad |
|---|---|
| `services/AutenticadorService.ts` | `iniciarSesion()` genera el token con `primer_login` / `cambiarContrasena()` actualiza BD y genera nuevo token |
| `repositories/usuario.repository.ts` | `actualizarPassword()` hace el UPDATE en BD con `primer_login = FALSE` |
| `middlewares/authMiddleware.ts` | `verificarToken` bloquea si `primer_login = TRUE` / `verificarTokenCambioPassword` no bloquea |
| `schemas/auth.schema.ts` | Zod valida `password_nueva` (min 8, 1 numero, 1 letra) |
| `routes/authRoutes.ts` | `/login` usa `verificarToken` normal / `/change-password` usa `verificarTokenCambioPassword` |

