// src/config/socket.ts
// Configuración centralizada de Socket.io para notificaciones en tiempo real

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

// ============================================================================
// TIPOS LOCALES
// ============================================================================

/**
 * Información del cliente conectado a través de WebSocket.
 * Se almacena en memoria para rastrear quién está en línea.
 */
type ClienteConectado = {
  socketId: string;
  usuarioId: number;
  rol: 'estudiante' | 'secretaria' | 'admin';
  conectadoEn: Date;
  nombreCompleto: string;
};

/**
 * Eventos que pueden emitirse desde el servidor hacia los clientes.
 */
type EventosServidor = {
  'notificacion:nueva': (datos: DatosNotificacion) => void;
  'notificacion:leida': (datosLeida: { notificacionId: number }) => void;
  'pong': () => void;
  'estado:conectados': (usuariosIds: number[]) => void;
};

/**
 * Eventos que escucha el servidor desde los clientes.
 */
type EventosCliente = {
  'ping': () => void;
  'disconnect': () => void;
};

/**
 * Estructura de una notificación enviada por WebSocket.
 */
type DatosNotificacion = {
  id?: number;
  titulo: string;
  mensaje: string;
  tipo: 'solicitud_nueva' | 'solicitud_aprobada' | 'solicitud_rechazada' | 'general';
  solicitudId: number;
  timestamp?: string;
};

/**
 * Payload decodificado del token JWT en la autenticación Socket.io.
 */
type PayloadSocket = {
  id_usuario: number;
  nombre_completo: string;
  rol: 'estudiante' | 'secretaria' | 'admin';
  codigo_estudiantil: string | null;
  primer_login: boolean;
  iat?: number;
  exp?: number;
};

// ============================================================================
// ALMACENAMIENTO EN MEMORIA
// ============================================================================

/**
 * Mapa en memoria de clientes conectados.
 * Estructura: { usuarioId → ClienteConectado }
 *
 * ⚠️ IMPORTANTE EN PRODUCCIÓN:
 * Con múltiples servidores Node, usar Redis Adapter en lugar de memoria local:
 * ```ts
 * import { createAdapter } from '@socket.io/redis-adapter';
 * io.adapter(createAdapter(pubClient, subClient));
 * ```
 */
const clientesConectados = new Map<number, ClienteConectado>();

// ============================================================================
// FUNCIONES DE UTILIDAD
// ============================================================================

/**
 * Verifica y decodifica el token JWT del handshake Socket.io.
 * Se utiliza en el middleware de autenticación.
 *
 * @param {string} token - Token JWT del cliente
 * @returns {PayloadSocket} Payload decodificado
 * @throws {Error} Si el token es inválido o ha expirado
 */
function verificarTokenSocket(token: string): PayloadSocket {
  const secreto = process.env.JWT_SECRET;
  if (!secreto) {
    throw new Error('JWT_SECRET no configurado en variables de entorno');
  }

  try {
    const payload = jwt.verify(token, secreto) as PayloadSocket;
    return payload;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expirado');
    }
    throw new Error('Token inválido');
  }
}

// ============================================================================
// INICIALIZACIÓN DE SOCKET.IO
// ============================================================================

/**
 * Inicializa Socket.io con configuración segura.
 * Implementa autenticación por token JWT en el handshake.
 * Configura eventos de conexión, desconexión y ping.
 *
 * Cumple requisitos de:
 * - Autenticación: Verificación de JWT antes de permitir conexión
 * - CORS: Lista blanca de orígenes permitidos
 * - Transporte: WebSocket con fallback a polling
 * - Ping/Pong: Keep-alive cada 25 segundos
 *
 * @param {HttpServer} servidorHttp - Servidor HTTP de Express (creado con createServer)
 * @returns {Server} Instancia configurada de Socket.io
 */
export function inicializarSocket(servidorHttp: HttpServer): Server<EventosCliente, EventosServidor> {
  const origenesPermitidos = [
    process.env.CORS_ORIGIN_DEV ?? 'http://localhost:4200',
    process.env.CORS_ORIGIN_PROD ?? 'https://tudominio.edu.co',
  ].filter(Boolean);

  const io = new Server<EventosCliente, EventosServidor>(servidorHttp, {
    cors: {
      origin: origenesPermitidos,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingInterval: Number(process.env.SOCKET_IO_PING_INTERVAL) || 25000,
    pingTimeout: Number(process.env.SOCKET_IO_PING_TIMEOUT) || 60000,
  });

  // ========================================================================
  // MIDDLEWARE DE AUTENTICACIÓN
  // ========================================================================
  /**
   * Middleware que se ejecuta antes de permitir cualquier conexión Socket.io.
   * Verifica el token JWT en el handshake (socket.handshake.auth.token).
   * Si el token es válido, permite la conexión; caso contrario, la rechaza.
   */
  io.use((socket, siguiente) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      console.warn(`⚠️  Intento de conexión sin token desde ${socket.handshake.address}`);
      return siguiente(new Error('Token no proporcionado'));
    }

    try {
      const payload = verificarTokenSocket(token);
      // Adjuntar datos decodificados al socket para uso posterior
      socket.data.usuario = payload;
      siguiente();
    } catch (error: any) {
      console.warn(`⚠️  Token inválido: ${error.message}`);
      siguiente(new Error(`Autenticación fallida: ${error.message}`));
    }
  });

  // ========================================================================
  // MANEJADORES DE EVENTOS
  // ========================================================================

  /**
   * Evento: Cliente se conecta exitosamente.
   * Se registra en el mapa de clientes y se notifica a otros usuarios.
   */
  io.on('connection', (socket: Socket<EventosCliente, EventosServidor>) => {
    const usuarioId = socket.data.usuario.id_usuario;
    const rol = socket.data.usuario.rol;
    const nombreCompleto = socket.data.usuario.nombre_completo;

    // Registrar cliente en mapa
    clientesConectados.set(usuarioId, {
      socketId: socket.id,
      usuarioId,
      rol,
      conectadoEn: new Date(),
      nombreCompleto,
    });

    console.log(`✅ Cliente conectado: ID ${usuarioId} (${rol}) - Socket ${socket.id}`);

    // Emitir lista de usuarios conectados a todos los clientes
    emitirEstadoConectados(io);

    // ====================================================================
    // EVENTO: PING (Keep-Alive)
    // ====================================================================
    /**
     * El cliente envía ping cada 30 segundos para mantener la conexión viva
     * incluso en navegadores con políticas restrictivas de conexión.
     */
    socket.on('ping', () => {
      socket.emit('pong');
      console.log(`🔄 Ping recibido de usuario ${usuarioId}`);
    });

    // ====================================================================
    // EVENTO: DESCONEXIÓN
    // ====================================================================
    /**
     * Cuando el cliente se desconecta (cierra navegador, pierde conexión, etc.)
     * se elimina del mapa de conectados.
     */
    socket.on('disconnect', (motivo: string) => {
      clientesConectados.delete(usuarioId);
      console.log(`❌ Cliente desconectado: ID ${usuarioId} - Motivo: ${motivo}`);

      // Notificar cambio de estado a otros clientes
      emitirEstadoConectados(io);
    });
  });

  return io;
}

// ============================================================================
// FUNCIONES DE EMISIÓN
// ============================================================================

/**
 * Envía una notificación a un usuario específico vía WebSocket.
 * Si el usuario no está conectado, retorna false para indicar
 * que se debe usar un canal alternativo (ej: FCM para móvil).
 *
 * Estructura de notificación:
 * ```
 * {
 *   titulo: "Nueva solicitud",
 *   mensaje: "Tu solicitud de cambio de curso fue recibida",
 *   tipo: "solicitud_nueva",
 *   solicitudId: 123,
 *   timestamp: "2026-05-03T14:30:00Z"
 * }
 * ```
 *
 * @param {Server} io - Instancia Socket.io
 * @param {number} usuarioId - ID del usuario destino
 * @param {DatosNotificacion} notificacion - Objeto con datos de la notificación
 * @returns {boolean} true si se envió exitosamente, false si usuario no conectado
 */
export function enviarNotificacionSocket(
  io: Server<EventosCliente, EventosServidor>,
  usuarioId: number,
  notificacion: DatosNotificacion
): boolean {
  const cliente = clientesConectados.get(usuarioId);

  if (!cliente) {
    return false; // Usuario NO conectado → se debe usar FCM u otro canal
  }

  // Agregar timestamp si no existe
  const notificacionConTimestamp = {
    ...notificacion,
    timestamp: notificacion.timestamp || new Date().toISOString(),
  };

  // Emitir al socket específico del usuario
  io.to(cliente.socketId).emit('notificacion:nueva', notificacionConTimestamp);
  console.log(`📨 Notificación WebSocket enviada a usuario ${usuarioId} (${cliente.nombreCompleto})`);

  return true;
}

/**
 * Envía una notificación a múltiples usuarios (por ejemplo, todas las secretarias).
 * Útil para alertas de nuevas solicitudes que deben recibir varios usuarios.
 *
 * @param {Server} io - Instancia Socket.io
 * @param {number[]} usuariosIds - Array de IDs de usuarios destino
 * @param {DatosNotificacion} notificacion - Objeto con datos de la notificación
 * @returns {Promise<{ enviados: number; noConectados: number }>} Estadísticas de envío
 */
export async function enviarNotificacionSocketGrupo(
  io: Server<EventosCliente, EventosServidor>,
  usuariosIds: number[],
  notificacion: DatosNotificacion
): Promise<{ enviados: number; noConectados: number }> {
  let enviados = 0;
  let noConectados = 0;

  for (const usuarioId of usuariosIds) {
    const enviado = enviarNotificacionSocket(io, usuarioId, notificacion);
    if (enviado) {
      enviados++;
    } else {
      noConectados++;
    }
  }

  return { enviados, noConectados };
}

/**
 * Emite el estado actual de usuarios conectados a todos los clientes.
 * Permite que la interfaz muestre indicadores de presencia en tiempo real.
 *
 * @param {Server} io - Instancia Socket.io
 */
function emitirEstadoConectados(io: Server<EventosCliente, EventosServidor>): void {
  const usuariosIds = Array.from(clientesConectados.keys());
  io.emit('estado:conectados', usuariosIds);
  console.log(`📊 Estado actualizado: ${usuariosIds.length} usuarios conectados`);
}

/**
 * Obtiene información sobre un usuario conectado.
 * Útil para verificaciones antes de enviar notificaciones.
 *
 * @param {number} usuarioId - ID del usuario a buscar
 * @returns {ClienteConectado | undefined} Información del cliente si está conectado
 */
export function obtenerClienteConectado(usuarioId: number): ClienteConectado | undefined {
  return clientesConectados.get(usuarioId);
}

/**
 * Obtiene lista de todos los usuarios conectados con su información.
 * Útil para debugging y monitoreo del estado de conexiones.
 *
 * @returns {ClienteConectado[]} Array de clientes conectados
 */
export function obtenerTodosLosClientesConectados(): ClienteConectado[] {
  return Array.from(clientesConectados.values());
}

/**
 * Verifica si un usuario específico está conectado en este momento.
 *
 * @param {number} usuarioId - ID del usuario a verificar
 * @returns {boolean} true si el usuario está conectado
 */
export function estaUsuarioConectado(usuarioId: number): boolean {
  return clientesConectados.has(usuarioId);
}

/**
 * Obtiene el número total de clientes conectados.
 * Útil para monitoreo de carga del servidor.
 *
 * @returns {number} Cantidad de usuarios conectados
 */
export function obtenerCantidadClientesConectados(): number {
  return clientesConectados.size;
}

// ============================================================================
// EXPORTACIONES
// ============================================================================

export {
  ClienteConectado,
  DatosNotificacion,
  PayloadSocket,
  EventosServidor,
  EventosCliente,
  clientesConectados,
};

