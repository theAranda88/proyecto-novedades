// src/services/FCMService.ts
// Servicio de Firebase Cloud Messaging para notificaciones push
// Manejo seguro de credenciales y reintentos

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { ErrorBaseDatos, ErrorNegocio } from '../middlewares/errorHandler';

/**
 * Interfaz para datos de notificación push
 */
export interface MensajePush {
  titulo: string;
  cuerpo: string;
  datos?: Record<string, string>;
  icono?: string;
  sonido?: string;
}

/**
 * Interfaz para resultado de envío
 */
export interface ResultadoEnvioPush {
  exito: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Interfaz para resultado de envío múltiple
 */
export interface ResultadoEnvioMultiple {
  exitosos: number;
  fallidos: number;
  detalles: Array<{ token: string; error?: string }>;
}

/**
 * Servicio de Firebase Cloud Messaging (FCM)
 * Singleton pattern - una única instancia en toda la aplicación
 */
export class FCMService {
  private static instancia: FCMService;
  private app: admin.app.App | null = null;
  private inicializado = false;

  private constructor() {
    this.inicializar();
  }

  /**
   * Obtener la instancia singleton de FCMService
   */
  static obtenerInstancia(): FCMService {
    if (!FCMService.instancia) {
      FCMService.instancia = new FCMService();
    }
    return FCMService.instancia;
  }

  /**
   * Inicializar Firebase Admin SDK
   * Se ejecuta una sola vez al crear la instancia
   */
  private inicializar(): void {
    try {
      const rutaCredenciales = process.env.FIREBASE_CONFIG_PATH ||
        path.join(__dirname, './firebase-credentials.json');

      if (!fs.existsSync(rutaCredenciales)) {
        console.warn(
          `[FCM] ADVERTENCIA: Archivo de credenciales no encontrado en ${rutaCredenciales}`
        );
        console.warn('[FCM] Las notificaciones push NO funcionarán.');
        console.warn('[FCM] Crear credenciales en https://console.firebase.google.com');
        this.inicializado = false;
        return;
      }

      const credenciales = JSON.parse(fs.readFileSync(rutaCredenciales, 'utf-8'));

      this.app = admin.initializeApp({
        credential: admin.credential.cert(credenciales as admin.ServiceAccount),
        projectId: credenciales.project_id,
      });

      console.log('[FCM] Inicializado exitosamente con proyecto: ' + credenciales.project_id);
      this.inicializado = true;
    } catch (error: any) {
      console.error('[FCM] Error inicializando Firebase:', error.message);
      this.inicializado = false;
    }
  }

  /**
   * Verificar si FCM está inicializado
   */
  estaListoParaEnviar(): boolean {
    return this.inicializado && this.app !== null;
  }

  /**
   * Enviar notificación push a un único dispositivo
   *
   * @param deviceToken - Token FCM del dispositivo
   * @param mensaje - Datos de la notificación
   * @returns Resultado del envío
   */
  async enviarNotificacionPush(
    deviceToken: string,
    mensaje: MensajePush
  ): Promise<ResultadoEnvioPush> {
    if (!this.estaListoParaEnviar()) {
      return {
        exito: false,
        error: 'FCM no está inicializado. Revisa las credenciales de Firebase.',
      };
    }

    try {
      const messageId = await admin.messaging(this.app!).send({
        token: deviceToken,
        notification: {
          title: mensaje.titulo,
          body: mensaje.cuerpo,
          imageUrl: mensaje.icono,
        },
        data: mensaje.datos || {},
        webpush: {
          headers: {
            TTL: '86400', // 24 horas
          },
          notification: {
            title: mensaje.titulo,
            body: mensaje.cuerpo,
            icon: mensaje.icono,
            sound: mensaje.sonido || 'default',
            vibrate: [200, 100, 200],
            badge: '/assets/badge-icon.png',
          },
          fcmOptions: {
            link: process.env.WEB_URL || 'http://localhost:3000',
          },
        },
        android: {
          priority: 'high',
          notification: {
            title: mensaje.titulo,
            body: mensaje.cuerpo,
            icon: mensaje.icono,
            sound: mensaje.sonido || 'default',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title: mensaje.titulo,
                body: mensaje.cuerpo,
              },
              sound: mensaje.sonido || 'default',
              badge: 1,
            },
          },
        },
      });

      console.log(`[FCM] Push enviado: ${messageId} a ${deviceToken.substring(0, 20)}...`);

      return { exito: true, messageId };
    } catch (error: any) {
      console.error(
        `[FCM] Error enviando a ${deviceToken.substring(0, 20)}...: ${error.message}`
      );

      return {
        exito: false,
        error: error.message,
      };
    }
  }

  /**
   * Enviar notificación push a múltiples dispositivos
   *
   * @param deviceTokens - Array de tokens FCM
   * @param mensaje - Datos de la notificación
   * @returns Estadísticas de envío
   */
  async enviarNotificacionMultiple(
    deviceTokens: string[],
    mensaje: MensajePush
  ): Promise<ResultadoEnvioMultiple> {
    const detalles: Array<{ token: string; error?: string }> = [];
    let exitosos = 0;
    let fallidos = 0;

    for (const token of deviceTokens) {
      const resultado = await this.enviarNotificacionPush(token, mensaje);
      if (resultado.exito) {
        exitosos++;
        detalles.push({ token: token.substring(0, 20) });
      } else {
        fallidos++;
        detalles.push({
          token: token.substring(0, 20),
          error: resultado.error,
        });
      }
    }

    console.log(
      `[FCM] Batch: ${exitosos} exitosos, ${fallidos} fallidos de ${deviceTokens.length}`
    );

    return { exitosos, fallidos, detalles };
  }

  /**
   * Suscribir dispositivos a un tema (topic)
   * Permite enviar notificaciones a múltiples usuarios sin listar tokens
   *
   * @param deviceTokens - Array de tokens FCM
   * @param tema - Nombre del tema (ej: 'secretarias', 'estudiantes')
   */
  async suscribirATema(deviceTokens: string[], tema: string): Promise<void> {
    if (!this.estaListoParaEnviar()) {
      console.warn('[FCM] No se puede suscribir: FCM no inicializado');
      return;
    }

    try {
      await admin.messaging(this.app!).subscribeToTopic(deviceTokens, tema);
      console.log(`[FCM] ${deviceTokens.length} dispositivos suscritos a: ${tema}`);
    } catch (error: any) {
      console.error(`[FCM] Error suscribiendo a tema ${tema}: ${error.message}`);
    }
  }

  /**
   * Desuscribir dispositivos de un tema
   *
   * @param deviceTokens - Array de tokens FCM
   * @param tema - Nombre del tema
   */
  async desuscribirDeTema(deviceTokens: string[], tema: string): Promise<void> {
    if (!this.estaListoParaEnviar()) {
      console.warn('[FCM] No se puede desuscribir: FCM no inicializado');
      return;
    }

    try {
      await admin.messaging(this.app!).unsubscribeFromTopic(deviceTokens, tema);
      console.log(`[FCM] ${deviceTokens.length} dispositivos desuscritos de: ${tema}`);
    } catch (error: any) {
      console.error(`[FCM] Error desuscribiendo de tema ${tema}: ${error.message}`);
    }
  }

  /**
   * Enviar notificación a todos los suscriptores de un tema
   *
   * @param tema - Nombre del tema
   * @param mensaje - Datos de la notificación
   * @returns Resultado del envío
   */
  async enviarNotificacionATema(
    tema: string,
    mensaje: MensajePush
  ): Promise<ResultadoEnvioPush> {
    if (!this.estaListoParaEnviar()) {
      return {
        exito: false,
        error: 'FCM no está inicializado',
      };
    }

    try {
      const messageId = await admin.messaging(this.app!).send({
        topic: tema,
        notification: {
          title: mensaje.titulo,
          body: mensaje.cuerpo,
        },
        data: mensaje.datos || {},
      });

      console.log(`[FCM] Enviado al tema '${tema}': ${messageId}`);

      return { exito: true, messageId };
    } catch (error: any) {
      console.error(`[FCM] Error enviando al tema ${tema}: ${error.message}`);
      return { exito: false, error: error.message };
    }
  }

  /**
   * Obtener estado actual de inicialización
   */
  obtenerEstado(): {
    inicializado: boolean;
    proyectoId?: string;
    clientEmail?: string;
  } {
    if (!this.inicializado || !this.app) {
      return { inicializado: false };
    }

    return {
      inicializado: true,
      proyectoId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };
  }
}

// Exportar instancia singleton
export const fcmService = FCMService.obtenerInstancia();

export default fcmService;

