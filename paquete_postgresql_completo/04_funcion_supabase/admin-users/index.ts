import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Role = 'administrador' | 'coordinacion' | 'jefatura' | 'planificacion' | 'docente';
type Status = 'activo' | 'inactivo';
type ScopedRole = 'coordinacion' | 'jefatura';

interface AdminUserPayload {
    action?: 'create' | 'update' | 'set-status';
    id_usuario?: number;
    nombre?: string;
    correo?: string;
    cedula?: string | null;
    carrera_ids?: number[];
    password?: string;
    rol?: Role;
    estado?: Status;
}

function respond(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function normalizeUserFields(payload: AdminUserPayload) {
    if (typeof payload.nombre !== 'string' || typeof payload.correo !== 'string') {
        return { error: 'Complete nombre, correo y un rol válido.' };
    }
    if (payload.cedula !== undefined && payload.cedula !== null && typeof payload.cedula !== 'string') {
        return { error: 'La cédula debe ser texto.' };
    }

    const nombre = payload.nombre.trim();
    const correo = payload.correo.trim().toLowerCase();
    const cedula = payload.cedula?.trim() || null;
    const rol = payload.rol;

    if (!nombre || !correo || !rol || !['administrador', 'coordinacion', 'jefatura', 'planificacion', 'docente'].includes(rol)) {
        return { error: 'Complete nombre, correo y un rol válido.' };
    }
    if (nombre.length > 100 || correo.length > 100 || (cedula?.length ?? 0) > 20) {
        return { error: 'Uno de los campos supera la longitud permitida.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        return { error: 'Ingrese un correo válido.' };
    }
    return { nombre, correo, cedula, rol };
}

function normalizeCareerIds(role: Role, value: unknown) {
    const careerIds = value ?? [];
    if (!Array.isArray(careerIds) || careerIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
        return { error: 'La lista de carreras asignadas no es válida.' };
    }

    const uniqueIds = [...new Set(careerIds as number[])];
    if (uniqueIds.length !== careerIds.length) {
        return { error: 'No repita una carrera en la asignación.' };
    }
    const requiresCareer = (role as ScopedRole) === 'coordinacion' || role === 'jefatura';
    if (requiresCareer && uniqueIds.length === 0) {
        return { error: 'Asigne al menos una carrera a coordinación o jefatura.' };
    }
    if (!requiresCareer && uniqueIds.length > 0) {
        return { error: 'Este rol no admite asignaciones de carrera.' };
    }
    return { careerIds: uniqueIds };
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return respond({ error: 'Método no permitido.' }, 405);

    const authorization = request.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!authorization || !supabaseUrl || !anonKey || !serviceRoleKey) {
        return respond({ error: 'No se pudo validar la solicitud.' }, 401);
    }

    let payload: AdminUserPayload;
    try {
        payload = await request.json() as AdminUserPayload;
    } catch {
        return respond({ error: 'La solicitud no tiene un formato válido.' }, 400);
    }

    const caller = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return respond({ error: 'La sesión venció. Inicie sesión de nuevo.' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: actor, error: actorError } = await admin
        .from('usuarios')
        .select('rol, estado')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    if (actorError || actor?.rol !== 'administrador' || actor.estado !== 'activo') {
        return respond({ error: 'Se requiere una cuenta de administrador activa.' }, 403);
    }

    if (payload.action === 'create') {
        const fields = normalizeUserFields(payload);
        if ('error' in fields) return respond(fields, 400);
        const careerScope = normalizeCareerIds(fields.rol, payload.carrera_ids);
        if ('error' in careerScope) return respond(careerScope, 400);
        if (typeof payload.password !== 'string' || payload.password.length < 8) {
            return respond({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
        }

        const { data: authResult, error: createAuthError } = await admin.auth.admin.createUser({
            email: fields.correo,
            password: payload.password,
            email_confirm: true,
        });
        if (createAuthError || !authResult.user) {
            const duplicate = createAuthError?.message.toLowerCase().includes('already') ?? false;
            return respond({ error: duplicate ? 'El correo ya está registrado.' : 'No se pudo crear la cuenta de acceso.' }, duplicate ? 409 : 400);
        }

        const { data: profile, error: profileError } = await admin
            .from('usuarios')
            .insert({
                auth_user_id: authResult.user.id,
                nombre: fields.nombre,
                correo: fields.correo,
                cedula: fields.cedula,
                rol: fields.rol,
                estado: 'activo',
            })
            .select('id_usuario')
            .single();

        if (profileError || !profile) {
            await admin.auth.admin.deleteUser(authResult.user.id);
            const duplicate = profileError?.code === '23505';
            return respond({ error: duplicate ? 'El correo ya está registrado.' : 'No se pudo guardar el perfil de la cuenta.' }, duplicate ? 409 : 400);
        }

        if (fields.rol === 'docente') {
            const { error: teacherError } = await admin
                .from('docentes')
                .insert({ id_docente: profile.id_usuario, especialidad: null });
            if (teacherError) {
                await admin.auth.admin.deleteUser(authResult.user.id);
                return respond({ error: 'No se pudo completar el perfil docente.' }, 400);
            }
        }

        const { error: scopeError } = await admin.rpc('admin_replace_user_careers', {
            target_user_id: profile.id_usuario,
            career_ids: careerScope.careerIds,
        });
        if (scopeError) {
            await admin.auth.admin.deleteUser(authResult.user.id);
            return respond({ error: 'No se pudieron guardar los permisos de carrera. Revise la migración de Sprint 1.' }, 400);
        }

        return respond({ id_usuario: profile.id_usuario });
    }

    if (payload.action === 'update') {
        const idUsuario = Number(payload.id_usuario);
        const fields = normalizeUserFields(payload);
        if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0 || 'error' in fields) {
            return respond({ error: 'Los datos de la cuenta no son válidos.' }, 400);
        }
        const careerScope = normalizeCareerIds(fields.rol, payload.carrera_ids);
        if ('error' in careerScope) return respond(careerScope, 400);

        const { data: target, error: targetError } = await admin
            .from('usuarios')
            .select('id_usuario, auth_user_id, nombre, correo, cedula, rol, estado')
            .eq('id_usuario', idUsuario)
            .single();
        if (targetError || !target?.auth_user_id) return respond({ error: 'No se encontró la cuenta vinculada a Supabase Auth.' }, 404);
        if (target.auth_user_id === user.id && fields.rol !== 'administrador') {
            return respond({ error: 'No puede quitarse su propio rol de administrador.' }, 409);
        }

        const { error: authUpdateError } = await admin.auth.admin.updateUserById(target.auth_user_id, {
            email: fields.correo,
            email_confirm: true,
        });
        if (authUpdateError) {
            const duplicate = authUpdateError.message.toLowerCase().includes('already');
            return respond({ error: duplicate ? 'El correo ya está registrado.' : 'No se pudo actualizar el correo de acceso.' }, duplicate ? 409 : 400);
        }

        const { error: profileUpdateError } = await admin
            .from('usuarios')
            .update({ nombre: fields.nombre, correo: fields.correo, cedula: fields.cedula, rol: fields.rol })
            .eq('id_usuario', idUsuario);

        if (profileUpdateError) {
            await admin.auth.admin.updateUserById(target.auth_user_id, { email: target.correo, email_confirm: true });
            const duplicate = profileUpdateError.code === '23505';
            const lastAdmin = profileUpdateError.code === '23514';
            return respond({ error: duplicate ? 'El correo ya está registrado.' : lastAdmin ? 'No se puede degradar o desactivar al último administrador activo.' : 'No se pudo guardar el perfil actualizado.' }, duplicate || lastAdmin ? 409 : 400);
        }

        if (fields.rol === 'docente') {
            const { error: teacherError } = await admin
                .from('docentes')
                .upsert({ id_docente: idUsuario, especialidad: null }, { onConflict: 'id_docente' });
            if (teacherError) {
                await admin.from('usuarios').update({
                    nombre: target.nombre,
                    correo: target.correo,
                    cedula: target.cedula,
                    rol: target.rol,
                }).eq('id_usuario', idUsuario);
                await admin.auth.admin.updateUserById(target.auth_user_id, { email: target.correo, email_confirm: true });
                return respond({ error: 'No se pudo completar el perfil docente.' }, 400);
            }
        }

        const { error: scopeError } = await admin.rpc('admin_replace_user_careers', {
            target_user_id: idUsuario,
            career_ids: careerScope.careerIds,
        });
        if (scopeError) {
            await admin.from('usuarios').update({
                nombre: target.nombre,
                correo: target.correo,
                cedula: target.cedula,
                rol: target.rol,
            }).eq('id_usuario', idUsuario);
            await admin.auth.admin.updateUserById(target.auth_user_id, { email: target.correo, email_confirm: true });
            return respond({ error: 'No se pudieron guardar los permisos de carrera. Revise la migración de Sprint 1.' }, 400);
        }

        return respond({ ok: true });
    }

    if (payload.action === 'set-status') {
        const idUsuario = Number(payload.id_usuario);
        const estado = payload.estado;
        if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0 || !['activo', 'inactivo'].includes(String(estado))) {
            return respond({ error: 'El estado solicitado no es válido.' }, 400);
        }

        const { data: target, error: targetError } = await admin
            .from('usuarios')
            .select('id_usuario, auth_user_id')
            .eq('id_usuario', idUsuario)
            .single();
        if (targetError || !target) return respond({ error: 'No se encontró la cuenta solicitada.' }, 404);
        if (target.auth_user_id === user.id && estado === 'inactivo') {
            return respond({ error: 'No puede desactivar su propia cuenta.' }, 409);
        }

        const { error: statusError } = await admin
            .from('usuarios')
            .update({ estado: estado as Status })
            .eq('id_usuario', idUsuario);
        if (statusError) {
            return respond({
                error: statusError.code === '23514'
                    ? 'No se puede desactivar o degradar al último administrador activo.'
                    : 'No se pudo actualizar el estado de la cuenta.',
            }, statusError.code === '23514' ? 409 : 400);
        }

        return respond({ ok: true });
    }

    return respond({ error: 'La operación solicitada no es válida.' }, 400);
});
