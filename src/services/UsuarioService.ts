// src/services/UsuarioService.ts
// Lógica de negocio para gestión de usuarios — Creación con control de roles

import bcrypt                        from 'bcrypt';
import { RepositorioUsuario }        from '../repositories/usuario.repository';
import { TCrearUsuario, RolUsuarioEnum } from '../schemas/usuario.schema';
import { ErrorNegocio, ErrorAutenticacion } from '../middlewares/errorHandler';
import { RolUsuario }                from '../middlewares/authMiddleware';

const COSTO_BCRYPT = Number(process.env.BCRYPT_COST ?? 12);

/**
 * Resultado de la creación de un usuario exitosa
 */
type ResultadoCreacionUsuario = {
  id_usuario:         number;
  nombre_completo:    string;
  email_institucional: string;
  codigo_estudiantil: string;
  rol:                string;
  primer_login:       boolean;
  contrasena_temporal: string; // La contraseña generada automáticamente (para mostrar una sola vez)
  mensaje_contrasena: string;  // Instructivo para el usuario
  programa_id?:       number;  // Si rol = ESTUDIANTE
  semestre_actual?:   number;  // Si rol = ESTUDIANTE
  jornada?:           string;  // Si rol = ESTUDIANTE
  matricula_activa?:  boolean; // Si rol = ESTUDIANTE
};

/**
 * Reglas de autorización para creación de usuarios según rol autenticado.
 * Define qué roles pueden crear qué otros roles.
 * Usa valores en minúscula del enum RolUsuario como claves.
 */
const PERMISOS_CREACION: Record<string, RolUsuarioEnum[]> = {
  [RolUsuario.ADMIN]:      ['ADMIN', 'SECRETARIA', 'ESTUDIANTE'] as RolUsuarioEnum[],
  [RolUsuario.SECRETARIA]: ['ESTUDIANTE'] as RolUsuarioEnum[],
  [RolUsuario.ESTUDIANTE]: [] as RolUsuarioEnum[], // Los estudiantes no pueden crear usuarios
};

export class ServicioUsuario {

  private readonly repoUsuario: RepositorioUsuario;

  constructor() {
    this.repoUsuario = new RepositorioUsuario();
  }

  /**
   * Crea un nuevo usuario en el sistema.
   * Implementa las reglas de control de roles y validaciones de negocio.
   *
   * Flujo:
   *   1. Verifica permisos del usuario autenticado para crear ese rol
   *   2. Valida que el email no exista
   *   3. Valida que el código estudiantil no exista
   *   4. Genera una contraseña temporal aleatoria
   *   5. Hashea la contraseña con bcrypt (cost ≥ 12)
   *   6. Crea el usuario en BD con primer_login = TRUE
   *   7. Si rol = ESTUDIANTE: crea perfil académico en tabla estudiantes
   *   8. Devuelve datos del usuario + contraseña temporal (una sola vez)
   *
   * Reglas de autorización (HU_001 §CA-01):
   *   - ADMIN: puede crear ADMIN, SECRETARIA, ESTUDIANTE
   *   - SECRETARIA: puede crear ESTUDIANTE
   *   - ESTUDIANTE: no puede crear usuarios
   *
   * @param datosCreacion     - Datos del nuevo usuario (nombre, email, código, rol)
   * @param idUsuarioAutor    - ID del usuario autenticado que crea (para auditoría)
   * @param rolUsuarioAutor   - Rol del usuario autenticado
   * @returns {Promise<ResultadoCreacionUsuario>} Usuario creado con contraseña temporal
   * @throws {ErrorAutenticacion} HTTP 403 — Sin permisos para crear ese rol
   * @throws {ErrorNegocio} HTTP 409 — Email o código ya existen
   * @throws {ErrorNegocio} HTTP 422 — Validación fallida
   */
  async crearUsuario(
    datosCreacion:    TCrearUsuario,
    idUsuarioAutor:   number,
    rolUsuarioAutor:  RolUsuarioEnum,
  ): Promise<ResultadoCreacionUsuario> {

    // 1. Verificar permisos del usuario autenticado
    const rolesPermitidos = PERMISOS_CREACION[rolUsuarioAutor] || [];
    if (!rolesPermitidos.includes(datosCreacion.rol)) {
      throw new ErrorAutenticacion(
        `Su rol (${rolUsuarioAutor}) no tiene permisos para crear usuarios con rol ${datosCreacion.rol}. ` +
        `Roles permitidos: ${rolesPermitidos.length > 0 ? rolesPermitidos.join(', ') : 'ninguno'}`,
        403,
      );
    }

    // 2. Validar que el email no exista
    const emailExiste = await this.repoUsuario.existeEmail(datosCreacion.email_institucional);
    if (emailExiste) {
      throw new ErrorNegocio(
        `El email ${datosCreacion.email_institucional} ya está registrado en el sistema`,
        409,
      );
    }

    // 3. Validar que el código estudiantil no exista
    const codigoExiste = await this.repoUsuario.existeCodigoEstudiantil(
      datosCreacion.codigo_estudiantil,
    );
    if (codigoExiste) {
      throw new ErrorNegocio(
        `El código estudiantil ${datosCreacion.codigo_estudiantil} ya está registrado en el sistema`,
        409,
      );
    }

    // 4. Generar contraseña temporal aleatoria (10 caracteres + números)
    const contrasenaTemp = this.generarContrasenaTemporal();

    // 5. Hashear contraseña con bcrypt (cost ≥ 12)
    const passwordHash = await bcrypt.hash(contrasenaTemp, COSTO_BCRYPT);

    // 6-7. Crear usuario + perfil (si es ESTUDIANTE) en TRANSACCIÓN ATÓMICA
    let idUsuarioCreado: number;
    if (datosCreacion.rol === 'ESTUDIANTE') {
      if (!datosCreacion.programa_id || !datosCreacion.semestre_actual || !datosCreacion.jornada) {
        throw new ErrorNegocio(
          'Para crear ESTUDIANTE se requieren: programa_id, semestre_actual, jornada',
          422,
        );
      }

      // Usar transacción: si falla crearEstudiante, se revierte crearUsuario
      const resultado = await this.repoUsuario.crearUsuarioConPerfilEstudiante(
        datosCreacion.nombre_completo,
        datosCreacion.email_institucional,
        datosCreacion.codigo_estudiantil,
        datosCreacion.rol,
        passwordHash,
        idUsuarioAutor,
        datosCreacion.programa_id,
        datosCreacion.semestre_actual,
        datosCreacion.jornada,
        datosCreacion.matricula_activa ?? true,
        20, // creditos_max_permitidos
        'normal', // estado_academico
      );
      idUsuarioCreado = resultado.idUsuario;
    } else {
      // Si NO es ESTUDIANTE, crear solo usuario
      idUsuarioCreado = await this.repoUsuario.crearUsuario(
        datosCreacion.nombre_completo,
        datosCreacion.email_institucional,
        datosCreacion.codigo_estudiantil,
        datosCreacion.rol,
        passwordHash,
        idUsuarioAutor,
      );
    }

    if (!idUsuarioCreado) {
      throw new ErrorNegocio('Error al crear el usuario en la base de datos', 500);
    }

    // 8. Preparar respuesta con instrucciones
    const respuesta: ResultadoCreacionUsuario = {
      id_usuario:          idUsuarioCreado,
      nombre_completo:     datosCreacion.nombre_completo,
      email_institucional: datosCreacion.email_institucional,
      codigo_estudiantil:  datosCreacion.codigo_estudiantil,
      rol:                 datosCreacion.rol.toLowerCase(),
      primer_login:        true,
      contrasena_temporal: contrasenaTemp,
      mensaje_contrasena:  `CONTRASEÑA TEMPORAL: "${contrasenaTemp}"\n` +
                           `Este usuario DEBE cambiar su contraseña al primer login.\n` +
                           `La contraseña no se puede recuperar después. Guárdela de forma segura.`,
    };

    // Agregar datos de estudiante si aplica
    if (datosCreacion.rol === 'ESTUDIANTE') {
      respuesta.programa_id      = datosCreacion.programa_id;
      respuesta.semestre_actual  = datosCreacion.semestre_actual;
      respuesta.jornada          = datosCreacion.jornada;
      respuesta.matricula_activa = datosCreacion.matricula_activa ?? true;
    }

    return respuesta;
  }

  /**
   * Verifica si el usuario actual tiene permisos para crear usuarios.
   * Utilizado por el controlador para validaciones previas.
   *
   * @param rolUsuarioAutor - Rol del usuario autenticado
   * @returns {boolean} true si puede crear usuarios, false en caso contrario
   */
  puedeCrearUsuarios(rolUsuarioAutor: RolUsuarioEnum): boolean {
    const rolesPermitidos = PERMISOS_CREACION[rolUsuarioAutor] || [];
    return rolesPermitidos.length > 0;
  }

  /**
   * Obtiene los roles que un usuario autenticado puede crear.
   * Usado para mostrar opciones válidas en el cliente.
   *
   * @param rolUsuarioAutor - Rol del usuario autenticado
   * @returns {RolUsuarioEnum[]} Array de roles que puede crear
   */
  obtenerRolesPermitidos(rolUsuarioAutor: RolUsuarioEnum): RolUsuarioEnum[] {
    return PERMISOS_CREACION[rolUsuarioAutor] || [];
  }

  /**
   * Genera una contraseña temporal aleatoria.
   * Formato: 8 caracteres alfabéticos + 2 números
   * Ejemplo: "AbCdEfGh42"
   *
   * @returns {string} Contraseña temporal de 10 caracteres
   */
  private generarContrasenaTemporal(): string {
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const numeros = '0123456789';
    let contrasena = '';

    // 8 caracteres aleatorios
    for (let i = 0; i < 8; i++) {
      contrasena += letras.charAt(Math.floor(Math.random() * letras.length));
    }

    // 2 números aleatorios
    for (let i = 0; i < 2; i++) {
      contrasena += numeros.charAt(Math.floor(Math.random() * numeros.length));
    }

    // Mezclar para no ser predecible (contraseña + números juntos)
    return contrasena.split('').sort(() => 0.5 - Math.random()).join('');
  }
}


