# Proyecto Novedades — Backend v2.0

Sistema de gestión de novedades académicas.
**Stack:** Node.js · Express · TypeScript · PostgreSQL · JWT · Zod · Swagger UI

---

## Instalacion (colaborador nuevo)

### 1. Clonar e instalar dependencias

```bash
git clone <url-del-repositorio>
cd Proyecto-novedades
npm install
```

### 2. Crear archivo `.env` en la raiz

Crea el archivo `.env` en la raiz del proyecto (mismo nivel que `package.json`):

```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=proyecto_novedades
DB_USER=postgres
DB_PASSWORD=tu_password_postgres
JWT_SECRET=proyecto_novedades_secret_2026
JWT_EXPIRES_IN=8h
BCRYPT_COST=12
CORS_ORIGIN_DEV=http://localhost:4200
GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_DOMINIO_PERMITIDO=uniautonoma.edu.co
```

> El archivo `.env` NO esta en el repositorio (esta en `.gitignore`).
> Debes crearlo manualmente con tus datos de conexion local.

### 3. Crear la BD en PostgreSQL

En pgAdmin o psql ejecutar:

```sql
CREATE DATABASE proyecto_novedades;
```

### 4. Ejecutar setup completo (tablas + datos seed)

```bash
# Windows PowerShell
$env:PGPASSWORD="tu_password"; psql -U postgres -d proyecto_novedades -f migrations/000_setup_completo.sql

# Linux / Mac
PGPASSWORD=tu_password psql -U postgres -d proyecto_novedades -f migrations/000_setup_completo.sql
```

Este comando crea TODAS las tablas y los datos de prueba en un solo paso.
Al finalizar muestra una tabla con los 5 usuarios creados.

### 5. Iniciar el servidor

```bash
npx ts-node src/server.ts
```

Debe ver en consola:
```
Swagger UI disponible en: http://localhost:3000/api/docs
Conexion a PostgreSQL establecida correctamente
Conexion a PostgreSQL verificada
==============================================
Servidor Proyecto Novedades iniciado
Puerto   : 3000
==============================================
```

---

## Usuarios de prueba (password: `Password123`)

| correo | codigo_estudiantil | Rol        | Estado             |
|--------|--------------------|------------|--------------------|
| `cperez@proyectonovedades.edu.co` | `2024001` | estudiante | matricula activa   |
| `mlopez@proyectonovedades.edu.co` | `2024002` | estudiante | matricula activa   |
| `lgomez@proyectonovedades.edu.co` | `2023010` | estudiante | matricula INACTIVA |
| `secretaria@proyectonovedades.edu.co` | `SEC001` | secretaria | activo             |
| `admin@proyectonovedades.edu.co` | `ADMIN001` | admin | activo             |

Login Google (migración 012, password `Password123` o botón Google):

| correo | codigo |
|--------|--------|
| `cristian.aranda.h@uniautonoma.edu.co` | `2026901` |
| `zulema.leon.e@uniautonoma.edu.co` | `2026902` |
| `yudith.agredo.r@uniautonoma.edu.co` | `2026903` |
| `luis.ramos.sanjuan@uniautonoma.edu.co` | `2026904` |

---

## Endpoints

```
GET  /api/health                           → publica (sin token)
GET  /api/docs                             → Swagger UI

POST /api/auth/login                       → sin token (body: correo + password)
POST /api/auth/google                      → sin token (body: id_token de GIS)
POST /api/auth/change-password             → token primer_login
POST /api/auth/forgot-password             → sin token (body: correo)

POST  /api/solicitudes                     → Token ESTUDIANTE
GET   /api/solicitudes/mias?periodo=2026-1 → Token ESTUDIANTE
GET   /api/solicitudes?periodo=2026-1      → Token SECRETARIA / ADMIN
PATCH /api/solicitudes/:id/estado          → Token SECRETARIA / ADMIN
```

---

## Uso del token JWT

1. Hacer `POST /api/auth/login` con `correo` y `password`, o `POST /api/auth/google` con `id_token`
2. Copiar el `token` de la respuesta
3. En cada endpoint protegido agregar el header:
   ```
   Authorization: Bearer <token_aqui>
   ```
4. El token expira en **8 horas** — volver a hacer login si expira

---

## Postman

1. Importar `postman/Proyecto-Novedades.postman_collection.json`
2. Importar `postman/Desarrollo.postman_environment.json`
3. Seleccionar entorno **Desarrollo**
4. Ejecutar **POST Login — Estudiante activo** → el `{{token}}` se guarda automaticamente
5. Los demas endpoints usan `{{token}}` automaticamente

---

## Problema frecuente al clonar

### "Credenciales incorrectas. Intentos restantes: 4"

**Causa:** La BD local esta vacia — no se ejecuto el script de setup.

**Solucion:**
```bash
# Paso 1: crear la BD
psql -U postgres -c "CREATE DATABASE proyecto_novedades;"

# Paso 2: ejecutar el setup completo
$env:PGPASSWORD="tu_password"; psql -U postgres -d proyecto_novedades -f migrations/000_setup_completo.sql
```

### "Error al conectar a PostgreSQL"

**Causa:** Las variables del `.env` no coinciden con tu instalacion de PostgreSQL.

**Solucion:** Verificar `DB_HOST`, `DB_PORT`, `DB_USER` y `DB_PASSWORD` en el `.env`.

### "Cannot find module" al iniciar

**Causa:** No se ejecuto `npm install`.

**Solucion:**
```bash
npm install
```

---

## Scripts utiles

```bash
# Desarrollo con recarga automatica
npm run dev

# Compilar TypeScript
npm run build

# Verificar errores de tipos
npx tsc --noEmit

# Iniciar directo
npx ts-node src/server.ts
```

---

## Documentacion interna

Ver carpeta `src/utils/` para documentacion tecnica del proyecto:

- `REPORTE_TECNICO_v2.md` — Estado completo del sistema, endpoints, BD
- `flujo_primer_login.md` — Flujo de autenticacion JWT y primer login
- `HU_DB_Novedades.docx` — Documento de reglas de negocio HU_DB
