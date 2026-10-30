import type { Href } from 'expo-router';

export interface AdminAction {
    title: string;
    description: string;
    icon: string;
    href: Href;
}

export interface AdminActionGroup {
    title: string;
    actions: AdminAction[];
}

// Keep every administrator route reachable from the dashboard in one place.
export const adminActionGroups: AdminActionGroup[] = [
    {
        title: 'Gestión institucional',
        actions: [
            {
                title: 'Cuentas',
                description: 'Usuarios, roles y permisos',
                icon: '👥',
                href: '/(admin)/accounts',
            },
            {
                title: 'Períodos académicos',
                description: 'Fechas y período vigente',
                icon: '📅',
                href: '/(admin)/periods',
            },
            {
                title: 'Departamentos',
                description: 'Jefaturas y asignaturas',
                icon: '🏛️',
                href: '/(admin)/departments',
            },
            {
                title: 'Catálogos',
                description: 'Carreras, materias y espacios',
                icon: '📚',
                href: '/(admin)/catalogs',
            },
            {
                title: 'Inventario de espacios',
                description: 'Importar aulas y pabellones',
                icon: '🏫',
                href: '/(admin)/inventory-import',
            },
            {
                title: 'Bloques de clase',
                description: 'Duraciones y recesos',
                icon: '⏰',
                href: '/(admin)/blocks',
            },
        ],
    },
    {
        title: 'Planificación académica',
        actions: [
            {
                title: 'Secciones',
                description: 'Grupos y oferta académica',
                icon: '🗂️',
                href: '/(admin)/sections',
            },
            {
                title: 'Asignación académica',
                description: 'Grupos, materias y docentes',
                icon: '🧑‍🏫',
                href: '/(admin)/academic-assignments',
            },
            {
                title: 'Importar asignaciones',
                description: 'Cargar y validar archivos',
                icon: '📥',
                href: '/(admin)/assignment-import',
            },
            {
                title: 'Planificar horarios',
                description: 'Borradores y publicación',
                icon: '🗓️',
                href: '/(admin)/schedule',
            },
            {
                title: 'Generador de horarios',
                description: 'Crear propuestas automáticas',
                icon: '🤖',
                href: '/(admin)/ai-generator',
            },
            {
                title: 'Consultar horarios',
                description: 'Revisar propuestas y horarios',
                icon: '👀',
                href: '/(admin)/consultation',
            },
        ],
    },
    {
        title: 'Mi cuenta',
        actions: [
            {
                title: 'Perfil',
                description: 'Datos personales y preferencias',
                icon: '⚙️',
                href: '/(admin)/profile',
            },
        ],
    },
];
