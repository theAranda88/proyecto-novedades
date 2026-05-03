// src/config/socket.ts
// Configuración de Socket.io para notificaciones en tiempo real

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ErrorAutenticacion } from '../middlewares/errorHandler';

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro';

/**
 * Interfaz para datos almacenados en el socket
 */
declare global {
  namespace Express {
    interface Request {
      io?: SocketIOServer;
      socketUserId?: number;
    }
  }
}

/**
 * Mapa para rastrear usuarios conectados
 * usuarioId -> Set de socket IDs
 */
const usuariosConectados = new Map<number, Set<string>>();

/**
 * Inicializar Socket.io en el servidor HTTP
 * @param httpServer - Servidor HTTP de Express
 * @returns Instancia de Socket.io
 */
export function inicializarSocket(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (process.env.CORS_ORIGIN_DEV || 'http://localhost:4200').split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // MIDDLEWARE: Validar JWT en conexión
  // ─────────────────────────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Token JWT requerido'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id_usuario: number; rol: string };
      socket.data.usuarioId = decoded.id_usuario;
      socket.data.rol = decoded.rol;
      socket.join(`usuario-${decoded.id_usuario}`);
      next();
    } catch (error) {
      next(new Error('Token JWT inválido o expirado'));
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENTO: Usuario se conecta
  // ─────────────────────────────────────────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    const usuarioId = socket.data.usuarioId;
    const socketId = socket.id;

    console.log(`✓ Usuario ${usuarioId} conectado — Socket: ${socketId}`);

    // Registrar conexión
    if (!usuariosConectados.has(usuarioId)) {
      usuariosConectados.set(usuarioId, new Set());
    }
    usuariosConectados.get(usuarioId)!.add(socketId);

    // Notificar que está online
    socket.emit('conexion_exitosa', {
      mensaje: 'Conectado al servidor de notificaciones',
      usuarioId,
      timestamp: new Date().toISOString(),
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // EVENTO: Escuchar notificaciones personalizadas
    // ─────────────────────────────────────────────────────────────────────────────
    socket.on('escuchar_notificaciones', () => {
      socket.emit('escuchando', {
        mensaje: 'Escuchando notificaciones',
        timestamp: new Date().toISOString(),
      });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // EVENTO: Marcar notificación como leída
    // ─────────────────────────────────────────────────────────────────────────────
    socket.on('marcar_leida', (data: { notificacionId: number }) => {
      console.log(`📖 Notificación ${data.notificacionId} marcada como leída por usuario ${usuarioId}`);
      // El controlador manejará la lógica de BD
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // EVENTO: Usuario se desconecta
    // ─────────────────────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`✗ Usuario ${usuarioId} desconectado — Socket: ${socketId}`);

      const sockets = usuariosConectados.get(usuarioId);
      if (sockets) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          usuariosConectados.delete(usuarioId);
        }
      }
    });

    socket.on('error', (error) => {
      console.error(`❌ Error en Socket ${socketId}:`, error);
    });
  });

  return io;
}

/**
 * Verificar si un usuario está actualmente conectado
 * @param usuarioId - ID del usuario
 * @returns true si hay al menos una conexión activa
 */
export function estaConectado(usuarioId: number): boolean {
  return usuariosConectados.has(usuarioId) && (usuariosConectados.get(usuarioId)?.size ?? 0) > 0;
}

/**
 * Obtener cantidad de conexiones activas de un usuario
 * @param usuarioId - ID del usuario
 * @returns Cantidad de sockets conectados
 */
export function obtenerConexiones(usuarioId: number): number {
  return usuariosConectados.get(usuarioId)?.size ?? 0;
}

/**
 * Obtener todos los usuarios conectados
 * @returns Map de usuario -> cantidad de conexiones
 */
export function obtenerUsuariosConectados(): Map<number, number> {
  const resultado = new Map<number, number>();
  usuariosConectados.forEach((sockets, usuarioId) => {
    resultado.set(usuarioId, sockets.size);
  });
  return resultado;
}

