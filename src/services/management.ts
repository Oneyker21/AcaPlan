import { supabase } from '@/lib/supabase';
import { Periodo, Usuario } from '@/types/database';

export type ManagedAccount = Omit<Usuario, 'contrasena'> & { funciones: string[]; carreras: number[] };
type AccountFields = Pick<Usuario, 'nombre' | 'cedula' | 'rol'>;
const errors: Record<string, string> = {
    ULTIMO_ADMIN: 'No se puede desactivar ni cambiar el rol del último administrador activo.',
    PERMISO_DENEGADO: 'Tu cuenta no tiene permiso para esta operación.',
    NO_ENCONTRADO: 'El registro ya no existe. Actualiza la lista.',
    DUPLICADO: 'El correo o la cédula ya están registrados.',
    DATOS_INVALIDOS: 'Revisa los datos introducidos.',
    AUTH_NO_EXISTE: 'No existe la cuenta correspondiente en Supabase Auth.',
};
async function rpc<T>(action: string, payload: object = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const { data, error } = await supabase.rpc('pwa_sprint1', { action, payload }).abortSignal(controller.signal);
        if (error) {
            if (error.code === 'PGRST202') throw new Error('Falta aplicar el SQL del Sprint 1 en Supabase.');
            throw new Error(errors[error.message] || (error.code === '23505'
                ? 'Ya existe un registro con esos datos. Actualiza la lista.'
                : 'No se pudo confirmar la operación. Actualiza la lista antes de reintentar.'));
        }
        if (data === null) throw new Error('Respuesta incompleta. Actualiza la lista antes de reintentar.');
        return data as T;
    } finally { clearTimeout(timer); }
}
export const listAccounts = () => rpc<ManagedAccount[]>('accounts.list');
export const listPeriods = () => rpc<Periodo[]>('periods.list');

export async function updateAccount(id: number, changes: Partial<AccountFields> & { estado?: Usuario['estado'] }) {
    // Recuperar funciones y carreras actuales: el formulario móvil no las edita.
    const current = (await listAccounts()).find(user => user.id_usuario === id);
    if (!current) throw new Error('La cuenta ya no existe. Actualiza la lista.');
    return rpc('accounts.update', { ...current, ...changes, id });
}
export async function createAccount(input: AccountFields & { correo: string; password: string }) {
    // Se invoca Supabase directamente. No existe dependencia del servidor de la PWA.
    const { data, error } = await supabase.functions.invoke('create-account', {
        body: input,
        timeout: 60000,
    });
    if (error) {
        const response = error.context;
        if (response && typeof response.json === 'function') {
            const body = await response.json().catch(() => null);
            if (body?.error) throw new Error(body.error);
            if (response.status === 404) throw new Error('Falta desplegar create-account en Supabase.');
        }
        throw new Error('No se pudo confirmar la creación en Supabase. Actualiza la lista antes de reintentar.');
    }
    if (!data?.ok) throw new Error('Respuesta incompleta de Supabase. Actualiza la lista antes de reintentar.');
    return data;
}
export function savePeriod(input: Omit<Periodo, 'id_periodo' | 'es_activo'> & { id?: number }) {
    if (!Number.isInteger(input.ano_lectivo) || input.ano_lectivo < 1900 || input.ano_lectivo > 2200)
        throw new Error('El año debe estar entre 1900 y 2200.');
    for (const value of [input.fecha_inicio, input.fecha_fin]) {
        const date = new Date(value + 'T00:00:00Z');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
            throw new Error('Introduce fechas válidas con formato YYYY-MM-DD.');
    }
    if (input.fecha_inicio >= input.fecha_fin) throw new Error('La fecha inicial debe ser anterior a la final.');
    return rpc<Periodo>('periods.save', input);
}
export const activatePeriod = (id: number, active: boolean) => rpc<Periodo>('periods.activate', { id, active });
