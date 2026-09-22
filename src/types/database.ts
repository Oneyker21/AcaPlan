// Enum types matching Supabase PostgreSQL enums
export type UserRol = 'administrador' | 'docente';
export type GeneralEstado = 'activo' | 'inactivo';
export type DiaSemana = 'Lunes' | 'Martes' | 'Miercoles' | 'Jueves' | 'Viernes' | 'Sabado' | 'Domingo';
export type EstadoHorario = 'borrador' | 'publicado';

// Table types
export interface Usuario {
    id_usuario: number;
    nombre: string;
    correo: string;
    cedula: string;
    contrasena: string;
    rol: UserRol;
    estado: GeneralEstado;
}

export interface Docente {
    id_docente: number;
    especialidad: string | null;
}

export interface Periodo {
    id_periodo: number;
    nombre: string;
    ano_lectivo: number;
    fecha_inicio: string;
    fecha_fin: string;
    es_activo: boolean;
}

export interface Carrera {
    id_carrera: number;
    nombre: string;
}

export interface Asignatura {
    id_asignatura: number;
    codigo: string;
    nombre: string;
    id_carrera: number;
    ano_estudio: number;
    horas_teoricas: number;
    horas_practicas: number;
    estado: GeneralEstado;
}

export interface Pabellon {
    id_pabellon: number;
    nombre: string;
}

export interface Aula {
    id_aula: number;
    codigo: string;
    id_pabellon: number;
    capacidad: number;
    estado: GeneralEstado;
}

export interface Recurso {
    id_recurso: number;
    nombre: string;
}

export interface Seccion {
    id_seccion: number;
    id_periodo: number;
    codigo: string;
    id_carrera: number;
    ano_estudio: number;
    cantidad_estudiantes: number;
}

export interface BloqueClase {
    id_bloque: number;
    id_periodo: number;
    dia: DiaSemana;
    hora_inicio: string;
    hora_fin: string;
    es_receso: boolean;
}

export interface DisponibilidadDocente {
    id_disponibilidad: number;
    id_docente: number;
    id_periodo: number;
    dia: DiaSemana;
    hora_inicio: string;
    hora_fin: string;
}

export interface Horario {
    id_horario: number;
    id_docente: number;
    id_asignatura: number;
    id_seccion: number;
    id_aula: number;
    id_bloque: number;
    estado_publicacion: EstadoHorario;
    fecha_actualizacion: string;
}
