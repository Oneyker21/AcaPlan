-- PLANTILLA: edite estos dos valores antes de ejecutarla.
-- La cuenta debe existir primero en Supabase Authentication -> Users.
-- Si el perfil ya está enlazado a otra cuenta Auth, el script se detiene.

DO $$
DECLARE
    admin_email TEXT := lower('CAMBIE_POR_EL_CORREO_ADMIN@ejemplo.edu');
    admin_name TEXT := 'Administrador inicial';
    auth_id UUID;
    existing_auth_id UUID;
BEGIN
    IF admin_email LIKE 'cambie_por_el_correo_admin%' OR admin_email = '' THEN
        RAISE EXCEPTION 'Edite admin_email en la plantilla antes de ejecutarla.';
    END IF;

    SELECT id INTO auth_id
    FROM auth.users
    WHERE lower(email) = admin_email;

    IF auth_id IS NULL THEN
        RAISE EXCEPTION 'No existe una cuenta de Supabase Auth con el correo %.', admin_email;
    END IF;

    SELECT auth_user_id INTO existing_auth_id
    FROM public.usuarios
    WHERE lower(correo) = admin_email
    FOR UPDATE;

    IF FOUND THEN
        IF existing_auth_id IS NOT NULL AND existing_auth_id <> auth_id THEN
            RAISE EXCEPTION 'El perfil ya está vinculado a otra cuenta de Auth. Revíselo manualmente.';
        END IF;

        UPDATE public.usuarios
        SET auth_user_id = auth_id,
            nombre = admin_name,
            rol = 'administrador',
            estado = 'activo'
        WHERE lower(correo) = admin_email;
    ELSE
        INSERT INTO public.usuarios (auth_user_id, nombre, correo, cedula, rol, estado)
        VALUES (auth_id, admin_name, admin_email, NULL, 'administrador', 'activo');
    END IF;
END;
$$;
