// Enum types matching Supabase PostgreSQL enums
export type UserRol = 'administrador' | 'coordinacion' | 'jefatura' | 'planificacion' | 'docente';
export type GeneralEstado = 'activo' | 'inactivo';
export type DiaSemana = 'Lunes' | 'Martes' | 'Miercoles' | 'Jueves' | 'Viernes' | 'Sabado' | 'Domingo';
export type EstadoHorario = 'borrador' | 'publicado';

// Table types
export interface Usuario {
    id_usuario: number;
    nombre: string;
    correo: string;
    cedula: string | null;
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
    id_version_publicada?: number | null;
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
    sede: string;
    nombre: string;
}

export interface Aula {
    id_aula: number;
    codigo: string;
    id_pabellon: number;
    capacidad: number;
    tipo: string;
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
    modalidad: 'regular' | 'encuentro' | 'salud';
    turno: 'matutino' | 'vespertino' | 'nocturno';
    sede: string;
}

export interface BloqueClase {
    id_bloque: number;
    id_periodo: number;
    dia: DiaSemana;
    modalidad: 'regular' | 'encuentro' | 'salud';
    turno: 'matutino' | 'vespertino' | 'nocturno';
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
    id_version_horario: number;
    id_componente: number | null;
    numero_sesion: number | null;
    es_fijada: boolean;
    traslado_sabado: boolean;
    dia_snapshot: DiaSemana;
    hora_inicio_snapshot: string;
    hora_fin_snapshot: string;
    estado_publicacion: EstadoHorario;
    fecha_actualizacion: string;
}

export type EstadoVersionHorario = 'borrador' | 'compartido' | 'aprobado' | 'publicado' | 'archivado';
export type EstadoValidacionHorario = 'pendiente' | 'valida' | 'con_avisos' | 'invalida' | 'obsoleta';

export interface VersionHorario {
    id_version_horario: number;
    id_periodo: number;
    numero_version: number;
    alcance_turno: 'institucional' | 'matutino' | 'vespertino' | 'nocturno';
    estado: EstadoVersionHorario;
    estado_validacion: EstadoValidacionHorario;
    reglas_version_id: number | null;
    version_base_id: number | null;
    creada_por: number | null;
    fecha_creacion: string;
    compartida_por?: number | null;
    fecha_compartida?: string | null;
    aprobada_por?: number | null;
    fecha_aprobada?: string | null;
    publicada_por?: number | null;
    fecha_publicada?: string | null;
}
