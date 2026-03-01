// src/app.ts
// Configuración central de la aplicación Express

import express                    from 'express';
import cors                       from 'cors';
import helmet                     from 'helmet';
import rateLimit                  from 'express-rate-limit';
import dotenv                     from 'dotenv';
import enrutadorAuth              from './routes/authRoutes';
import { manejadorErroresGlobal } from './middlewares/errorHandler';
import { configurarSwagger }      from './config/swagger';

dotenv.config({ quiet: true });

const app = express();

// ------------------------------------------------------------
// SEGURIDAD — Helmet con excepción para Swagger UI
// ------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'"],
        'img-src':    ["'self'", 'data:', 'https:'],
        'style-src':  ["'self'", "'unsafe-inline'"],
      },
    },
  }),
);

// ------------------------------------------------------------
// CORS — Lista blanca de orígenes permitidos
// ------------------------------------------------------------
const origenesPermitidos = [
  process.env.CORS_ORIGIN_DEV  ?? 'http://localhost:4200',
  process.env.CORS_ORIGIN_PROD ?? '',
].filter(Boolean);

app.use(cors({
  origin: (origen, callback) => {
    if (!origen) return callback(null, true);
    if (origenesPermitidos.includes(origen)) {
      callback(null, true);
    } else {
      callback(new Error(`Origen no permitido por CORS: ${origen}`));
    }
  },
  methods:        ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    true,
  maxAge:         86400,
}));

// ------------------------------------------------------------
// PARSEO — Limita el tamaño del body a 1MB
// ------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));

// ------------------------------------------------------------
// SWAGGER UI — Documentación interactiva en /api/docs
// ------------------------------------------------------------
configurarSwagger(app);

// ------------------------------------------------------------
// RATE LIMITING — Limita intentos de login (10 por 15 min)
// ------------------------------------------------------------
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message: {
    ok:            false,
    mensaje:       'Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos',
    datos:         null,
    codigo_estado: 429,
  },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ------------------------------------------------------------
// RUTAS PÚBLICAS (sin autenticación JWT)
// ------------------------------------------------------------

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Estado del servidor
 *     description: |
 *       Verifica que el servidor esté activo y funcionando correctamente.
 *       **Ruta pública** — No requiere token JWT.
 *     tags:
 *       - 🏥 Health
 *     security: []
 *     responses:
 *       200:
 *         description: Servidor activo y funcionando
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaExito'
 *             example:
 *               ok: true
 *               mensaje: "Servidor Proyecto Novedades activo"
 *               datos:
 *                 version: "1.0.0"
 *                 timestamp: "2026-02-28T00:00:00.000Z"
 *               codigo_estado: 200
 */
app.get('/api/health', (_req, res) => {
  res.json({
    ok:            true,
    mensaje:       'Servidor Proyecto Novedades activo',
    datos:         { version: '1.0.0', timestamp: new Date().toISOString() },
    codigo_estado: 200,
  });
});

app.use('/api/auth/login', limitadorLogin);
app.use('/api/auth',       enrutadorAuth);

// ------------------------------------------------------------
// RUTA NO ENCONTRADA — 404
// ------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({
    ok:            false,
    mensaje:       'Ruta no encontrada en el sistema',
    datos:         null,
    codigo_estado: 404,
  });
});

// ------------------------------------------------------------
// MANEJADOR GLOBAL DE ERRORES — Debe ser el último middleware
// ------------------------------------------------------------
app.use(manejadorErroresGlobal);

export default app;
