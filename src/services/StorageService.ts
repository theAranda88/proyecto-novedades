// src/services/StorageService.ts
// Abstracción para almacenamiento de archivos — soporta local, S3, Cloudinary, etc.

import * as fs from 'fs';
import * as path from 'path';

/**
 * Interfaz para adaptadores de almacenamiento
 */
export interface IStorageAdapter {
  /**
   * Guardar un archivo
   * @param clave — ruta/nombre único del archivo (ej: "solicitudes/1/documento.pdf")
   * @param contenido — contenido del archivo en Buffer
   * @returns Promise<URL> — URL pública del archivo guardado
   */
  guardar(clave: string, contenido: Buffer): Promise<string>;

  /**
   * Obtener un archivo
   * @param clave — ruta/nombre del archivo
   * @returns Promise<Buffer> — contenido del archivo
   */
  obtener(clave: string): Promise<Buffer>;

  /**
   * Eliminar un archivo
   * @param clave — ruta/nombre del archivo
   */
  eliminar(clave: string): Promise<void>;

  /**
   * Verificar si existe un archivo
   * @param clave — ruta/nombre del archivo
   */
  existe(clave: string): Promise<boolean>;
}

/**
 * Adaptador LOCAL — Almacena archivos en /uploads del servidor
 * ADVERTENCIA: No funciona en Vercel (sin almacenamiento persistente)
 * Solo para desarrollo local
 */
export class StorageLocal implements IStorageAdapter {
  private readonly baseDir: string;

  constructor(baseDir: string = 'uploads') {
    this.baseDir = baseDir;
    this.crearDirectorioSiNoExiste(baseDir);
  }

  private crearDirectorioSiNoExiste(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async guardar(clave: string, contenido: Buffer): Promise<string> {
    const rutaCompleta = path.join(this.baseDir, clave);
    const directorio = path.dirname(rutaCompleta);

    this.crearDirectorioSiNoExiste(directorio);
    fs.writeFileSync(rutaCompleta, contenido);

    // Retornar URL relativa para acceder vía GET /uploads/...
    return `/uploads/${clave}`;
  }

  async obtener(clave: string): Promise<Buffer> {
    const rutaCompleta = path.join(this.baseDir, clave);
    if (!fs.existsSync(rutaCompleta)) {
      throw new Error(`Archivo no encontrado: ${clave}`);
    }
    return fs.readFileSync(rutaCompleta);
  }

  async eliminar(clave: string): Promise<void> {
    const rutaCompleta = path.join(this.baseDir, clave);
    if (fs.existsSync(rutaCompleta)) {
      fs.unlinkSync(rutaCompleta);
    }
  }

  async existe(clave: string): Promise<boolean> {
    const rutaCompleta = path.join(this.baseDir, clave);
    return fs.existsSync(rutaCompleta);
  }
}

/**
 * Adaptador CLOUDINARY — Almacena en la nube (recomendado para Vercel)
 * NOTA: Requiere paquete cloudinary (npm install cloudinary)
 *
 * Variables de entorno:
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 */
export class StorageCloudinary implements IStorageAdapter {
  private cloudinary: any;

  constructor() {
    // Importar dinámicamente para evitar errores si no está instalado
    try {
      const cloudinaryLib = require('cloudinary').v2;
      cloudinaryLib.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      this.cloudinary = cloudinaryLib;
    } catch (error) {
      throw new Error('Cloudinary no instalado. Ejecuta: npm install cloudinary');
    }
  }

  async guardar(clave: string, contenido: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = this.cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          public_id: clave.replace(/\//g, '_').replace(/\.[^/.]+$/, ''),
          folder: 'proyecto_novedades',
        },
        (error: any, result: any) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        }
      );
      stream.end(contenido);
    });
  }

  async obtener(clave: string): Promise<Buffer> {
    throw new Error('No soportado para Cloudinary. Usa la URL directa en la BD.');
  }

  async eliminar(clave: string): Promise<void> {
    const publicId = `proyecto_novedades/${clave.replace(/\//g, '_').replace(/\.[^/.]+$/, '')}`;
    await this.cloudinary.uploader.destroy(publicId);
  }

  async existe(clave: string): Promise<boolean> {
    // Cloudinary no tiene método simple para verificar existencia
    // Implementar si es necesario
    return true;
  }
}

/**
 * Factory para crear instancia del storage configurado
 */
export function crearStorageService(): IStorageAdapter {
  const tipoStorage = process.env.STORAGE_TYPE || 'local';

  switch (tipoStorage) {
    case 'cloudinary':
      return new StorageCloudinary();
    case 'local':
    default:
      return new StorageLocal(process.env.UPLOADS_DIR || 'uploads');
  }
}

/**
 * Instancia por defecto para usar en toda la aplicación
 */
export const storageService = crearStorageService();

