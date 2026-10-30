-- ============================================================================
-- ACAPLAN - SCRIPT 12: USUARIOS DE PRUEBA PARA CADA ROL Y RANGO
-- ============================================================================
-- Este script crea o actualiza las cuentas de prueba para TODOS los roles
-- y rangos de AcaPlan, permitiendo iniciar sesión inmediatamente tanto en la
-- aplicación móvil como en la PWA.
--
-- Credencial general de prueba para todas las cuentas:
-- Contraseña: AcaPlan2026*
--
-- Roles creados:
-- 1. Administrador:          admin.qa@acaplan.edu.ni
-- 2. Planificación:          planificador.qa@acaplan.edu.ni
-- 3. Coordinación:           coordinador.qa@acaplan.edu.ni (Ingeniería en Sistemas)
-- 4. Jefatura Departamento:  jefatura.qa@acaplan.edu.ni    (Dpto. Computación e Informática)
-- 5. Docente de Planta:      docente.planta@acaplan.edu.ni (Tiempo Completo - Rango Planta)
-- 6. Docente por Horario:    docente.horario@acaplan.edu.ni (Tiempo Parcial - Rango Horario)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Asegurar tablas necesarias para departamentos y rangos de docente
CREATE TABLE IF NOT EXISTS public.pwa_departamentos (
  id_departamento INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(trim(nombre)) BETWEEN 1 AND 100)
);

CREATE TABLE IF NOT EXISTS public.pwa_departamento_jefaturas (
  id_departamento INTEGER NOT NULL REFERENCES public.pwa_departamentos(id_departamento),
  id_usuario INTEGER NOT NULL REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE,
  asignado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_departamento, id_usuario)
);
CREATE UNIQUE INDEX IF NOT EXISTS pwa_departamento_jefatura_unica
  ON public.pwa_departamento_jefaturas(id_usuario);

CREATE TABLE IF NOT EXISTS public.pwa_docente_tipo (
  id_docente INTEGER PRIMARY KEY REFERENCES public.docentes(id_docente) ON DELETE CASCADE,
  tipo_docente TEXT NOT NULL CHECK (tipo_docente IN ('planta', 'horario')),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pwa_docente_departamentos (
  id_departamento INTEGER NOT NULL REFERENCES public.pwa_departamentos(id_departamento),
  id_docente INTEGER NOT NULL REFERENCES public.docentes(id_docente) ON DELETE CASCADE,
  registrado_por INTEGER NOT NULL REFERENCES public.usuarios(id_usuario),
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_departamento, id_docente)
);

-- Habilitar RLS en tablas creadas
ALTER TABLE public.pwa_departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pwa_departamento_jefaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pwa_docente_tipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pwa_docente_departamentos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pwa_departamentos' AND policyname = 'pwa_departamentos_select_all') THEN
        CREATE POLICY pwa_departamentos_select_all ON public.pwa_departamentos FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pwa_docente_tipo' AND policyname = 'pwa_docente_tipo_select_all') THEN
        CREATE POLICY pwa_docente_tipo_select_all ON public.pwa_docente_tipo FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pwa_departamento_jefaturas' AND policyname = 'pwa_departamento_jefaturas_select_all') THEN
        CREATE POLICY pwa_departamento_jefaturas_select_all ON public.pwa_departamento_jefaturas FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pwa_docente_departamentos' AND policyname = 'pwa_docente_departamentos_select_all') THEN
        CREATE POLICY pwa_docente_departamentos_select_all ON public.pwa_docente_departamentos FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

GRANT SELECT ON public.pwa_departamentos, public.pwa_departamento_jefaturas, public.pwa_docente_tipo, public.pwa_docente_departamentos TO authenticated;

-- ============================================================================
-- PROCESO DE INSERCIÓN Y VINCULACIÓN
-- ============================================================================
DO $$
DECLARE
    v_admin_auth UUID;
    v_plan_auth  UUID;
    v_coord_auth UUID;
    v_jefe_auth  UUID;
    v_planta_auth UUID;
    v_horario_auth UUID;

    v_admin_id  INTEGER;
    v_plan_id   INTEGER;
    v_coord_id  INTEGER;
    v_jefe_id   INTEGER;
    v_planta_id INTEGER;
    v_horario_id INTEGER;

    v_carrera_id INTEGER;
    v_dept_id    INTEGER;
    v_pwd_hash   TEXT;
BEGIN
    -- Hash estándar de contraseña para pruebas: 'AcaPlan2026*'
    v_pwd_hash := extensions.crypt('AcaPlan2026*', extensions.gen_salt('bf'));

    -- ------------------------------------------------------------------------
    -- 0. Asegurar Carrera y Departamento base para los alcances
    -- ------------------------------------------------------------------------
    INSERT INTO public.carreras (nombre)
    VALUES ('Ingeniería en Sistemas de Información')
    ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id_carrera INTO v_carrera_id;

    IF v_carrera_id IS NULL THEN
        SELECT id_carrera INTO v_carrera_id FROM public.carreras WHERE nombre = 'Ingeniería en Sistemas de Información' LIMIT 1;
    END IF;

    INSERT INTO public.pwa_departamentos (nombre, activo)
    VALUES ('Departamento de Computación e Informática', TRUE)
    ON CONFLICT (nombre) DO UPDATE SET activo = TRUE
    RETURNING id_departamento INTO v_dept_id;

    IF v_dept_id IS NULL THEN
        SELECT id_departamento INTO v_dept_id FROM public.pwa_departamentos WHERE nombre = 'Departamento de Computación e Informática' LIMIT 1;
    END IF;

    -- ------------------------------------------------------------------------
    -- 1. ADMINISTRADOR GENERAL (admin.qa@acaplan.edu.ni)
    -- ------------------------------------------------------------------------
    SELECT id INTO v_admin_auth FROM auth.users WHERE lower(email) = 'admin.qa@acaplan.edu.ni';
    IF v_admin_auth IS NULL THEN
        v_admin_auth := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_admin_auth, 'authenticated', 'authenticated',
            'admin.qa@acaplan.edu.ni', v_pwd_hash, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"nombre":"Administrador General AcaPlan"}'::jsonb,
            now(), now(), '', '', '', ''
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = v_pwd_hash, email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now()
        WHERE id = v_admin_auth;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_admin_auth AND provider = 'email') THEN
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (v_admin_auth, v_admin_auth, jsonb_build_object('sub', v_admin_auth::text, 'email', 'admin.qa@acaplan.edu.ni'), 'email', v_admin_auth::text, now(), now(), now());
    END IF;

    INSERT INTO public.usuarios (auth_user_id, nombre, correo, cedula, rol, estado)
    VALUES (v_admin_auth, 'Administrador General AcaPlan', 'admin.qa@acaplan.edu.ni', '001-010180-0001A', 'administrador', 'activo')
    ON CONFLICT (correo) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        nombre = EXCLUDED.nombre,
        cedula = EXCLUDED.cedula,
        rol = 'administrador',
        estado = 'activo'
    RETURNING id_usuario INTO v_admin_id;

    -- ------------------------------------------------------------------------
    -- 2. PLANIFICADOR ACADÉMICO (planificador.qa@acaplan.edu.ni)
    -- ------------------------------------------------------------------------
    SELECT id INTO v_plan_auth FROM auth.users WHERE lower(email) = 'planificador.qa@acaplan.edu.ni';
    IF v_plan_auth IS NULL THEN
        v_plan_auth := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_plan_auth, 'authenticated', 'authenticated',
            'planificador.qa@acaplan.edu.ni', v_pwd_hash, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"nombre":"Lic. Carlos Mendoza - Planificador"}'::jsonb,
            now(), now(), '', '', '', ''
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = v_pwd_hash, email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now()
        WHERE id = v_plan_auth;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_plan_auth AND provider = 'email') THEN
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (v_plan_auth, v_plan_auth, jsonb_build_object('sub', v_plan_auth::text, 'email', 'planificador.qa@acaplan.edu.ni'), 'email', v_plan_auth::text, now(), now(), now());
    END IF;

    INSERT INTO public.usuarios (auth_user_id, nombre, correo, cedula, rol, estado)
    VALUES (v_plan_auth, 'Lic. Carlos Mendoza - Planificador', 'planificador.qa@acaplan.edu.ni', '001-150582-0002B', 'planificacion', 'activo')
    ON CONFLICT (correo) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        nombre = EXCLUDED.nombre,
        cedula = EXCLUDED.cedula,
        rol = 'planificacion',
        estado = 'activo'
    RETURNING id_usuario INTO v_plan_id;

    -- ------------------------------------------------------------------------
    -- 3. COORDINADOR DE CARRERA (coordinador.qa@acaplan.edu.ni)
    -- ------------------------------------------------------------------------
    SELECT id INTO v_coord_auth FROM auth.users WHERE lower(email) = 'coordinador.qa@acaplan.edu.ni';
    IF v_coord_auth IS NULL THEN
        v_coord_auth := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_coord_auth, 'authenticated', 'authenticated',
            'coordinador.qa@acaplan.edu.ni', v_pwd_hash, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"nombre":"Ing. Ana Patricia Ruiz - Coordinadora"}'::jsonb,
            now(), now(), '', '', '', ''
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = v_pwd_hash, email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now()
        WHERE id = v_coord_auth;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_coord_auth AND provider = 'email') THEN
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (v_coord_auth, v_coord_auth, jsonb_build_object('sub', v_coord_auth::text, 'email', 'coordinador.qa@acaplan.edu.ni'), 'email', v_coord_auth::text, now(), now(), now());
    END IF;

    INSERT INTO public.usuarios (auth_user_id, nombre, correo, cedula, rol, estado)
    VALUES (v_coord_auth, 'Ing. Ana Patricia Ruiz - Coordinadora', 'coordinador.qa@acaplan.edu.ni', '001-200885-0003C', 'coordinacion', 'activo')
    ON CONFLICT (correo) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        nombre = EXCLUDED.nombre,
        cedula = EXCLUDED.cedula,
        rol = 'coordinacion',
        estado = 'activo'
    RETURNING id_usuario INTO v_coord_id;

    -- Vincular alcance de carrera
    IF v_carrera_id IS NOT NULL AND v_coord_id IS NOT NULL THEN
        INSERT INTO public.usuario_carrera (id_usuario, id_carrera)
        VALUES (v_coord_id, v_carrera_id)
        ON CONFLICT (id_usuario, id_carrera) DO NOTHING;
    END IF;

    -- ------------------------------------------------------------------------
    -- 4. JEFE DE DEPARTAMENTO (jefatura.qa@acaplan.edu.ni)
    -- ------------------------------------------------------------------------
    SELECT id INTO v_jefe_auth FROM auth.users WHERE lower(email) = 'jefatura.qa@acaplan.edu.ni';
    IF v_jefe_auth IS NULL THEN
        v_jefe_auth := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_jefe_auth, 'authenticated', 'authenticated',
            'jefatura.qa@acaplan.edu.ni', v_pwd_hash, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"nombre":"MSc. Roberto Gómez - Jefe de Departamento"}'::jsonb,
            now(), now(), '', '', '', ''
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = v_pwd_hash, email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now()
        WHERE id = v_jefe_auth;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_jefe_auth AND provider = 'email') THEN
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (v_jefe_auth, v_jefe_auth, jsonb_build_object('sub', v_jefe_auth::text, 'email', 'jefatura.qa@acaplan.edu.ni'), 'email', v_jefe_auth::text, now(), now(), now());
    END IF;

    INSERT INTO public.usuarios (auth_user_id, nombre, correo, cedula, rol, estado)
    VALUES (v_jefe_auth, 'MSc. Roberto Gómez - Jefe de Departamento', 'jefatura.qa@acaplan.edu.ni', '001-100478-0004D', 'jefatura', 'activo')
    ON CONFLICT (correo) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        nombre = EXCLUDED.nombre,
        cedula = EXCLUDED.cedula,
        rol = 'jefatura',
        estado = 'activo'
    RETURNING id_usuario INTO v_jefe_id;

    -- Asignar jefatura al departamento
    IF v_dept_id IS NOT NULL AND v_jefe_id IS NOT NULL THEN
        INSERT INTO public.pwa_departamento_jefaturas (id_departamento, id_usuario)
        VALUES (v_dept_id, v_jefe_id)
        ON CONFLICT (id_usuario) DO UPDATE SET id_departamento = EXCLUDED.id_departamento;
    END IF;

    -- ------------------------------------------------------------------------
    -- 5. DOCENTE DE PLANTA (docente.planta@acaplan.edu.ni)
    --    Rango / Tipo: planta (Tiempo Completo - Sin restricciones de disponibilidad)
    -- ------------------------------------------------------------------------
    SELECT id INTO v_planta_auth FROM auth.users WHERE lower(email) = 'docente.planta@acaplan.edu.ni';
    IF v_planta_auth IS NULL THEN
        v_planta_auth := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_planta_auth, 'authenticated', 'authenticated',
            'docente.planta@acaplan.edu.ni', v_pwd_hash, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"nombre":"Prof. Eduardo Morales (Docente de Planta)"}'::jsonb,
            now(), now(), '', '', '', ''
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = v_pwd_hash, email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now()
        WHERE id = v_planta_auth;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_planta_auth AND provider = 'email') THEN
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (v_planta_auth, v_planta_auth, jsonb_build_object('sub', v_planta_auth::text, 'email', 'docente.planta@acaplan.edu.ni'), 'email', v_planta_auth::text, now(), now(), now());
    END IF;

    INSERT INTO public.usuarios (auth_user_id, nombre, correo, cedula, rol, estado)
    VALUES (v_planta_auth, 'Prof. Eduardo Morales (Docente de Planta)', 'docente.planta@acaplan.edu.ni', '001-050983-0005E', 'docente', 'activo')
    ON CONFLICT (correo) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        nombre = EXCLUDED.nombre,
        cedula = EXCLUDED.cedula,
        rol = 'docente',
        estado = 'activo'
    RETURNING id_usuario INTO v_planta_id;

    -- Registrar en tabla de docentes con su especialidad
    INSERT INTO public.docentes (id_docente, especialidad)
    VALUES (v_planta_id, 'Ingeniería de Software y Bases de Datos')
    ON CONFLICT (id_docente) DO UPDATE SET especialidad = EXCLUDED.especialidad;

    -- Registrar modalidad / rango: PLANTA (Tiempo Completo)
    INSERT INTO public.pwa_docente_tipo (id_docente, tipo_docente)
    VALUES (v_planta_id, 'planta')
    ON CONFLICT (id_docente) DO UPDATE SET tipo_docente = 'planta', actualizado_en = now();

    -- Registrar pertenencia al departamento
    IF v_dept_id IS NOT NULL AND v_admin_id IS NOT NULL THEN
        INSERT INTO public.pwa_docente_departamentos (id_departamento, id_docente, registrado_por)
        VALUES (v_dept_id, v_planta_id, v_admin_id)
        ON CONFLICT (id_departamento, id_docente) DO NOTHING;
    END IF;

    -- ------------------------------------------------------------------------
    -- 6. DOCENTE POR HORARIO (docente.horario@acaplan.edu.ni)
    --    Rango / Tipo: horario (Tiempo Parcial / Por horas - Registra restricciones)
    -- ------------------------------------------------------------------------
    SELECT id INTO v_horario_auth FROM auth.users WHERE lower(email) = 'docente.horario@acaplan.edu.ni';
    IF v_horario_auth IS NULL THEN
        v_horario_auth := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_horario_auth, 'authenticated', 'authenticated',
            'docente.horario@acaplan.edu.ni', v_pwd_hash, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"nombre":"Lic. Lucía Salgado (Docente por Horario)"}'::jsonb,
            now(), now(), '', '', '', ''
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = v_pwd_hash, email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now()
        WHERE id = v_horario_auth;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_horario_auth AND provider = 'email') THEN
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (v_horario_auth, v_horario_auth, jsonb_build_object('sub', v_horario_auth::text, 'email', 'docente.horario@acaplan.edu.ni'), 'email', v_horario_auth::text, now(), now(), now());
    END IF;

    INSERT INTO public.usuarios (auth_user_id, nombre, correo, cedula, rol, estado)
    VALUES (v_horario_auth, 'Lic. Lucía Salgado (Docente por Horario)', 'docente.horario@acaplan.edu.ni', '001-121288-0006F', 'docente', 'activo')
    ON CONFLICT (correo) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        nombre = EXCLUDED.nombre,
        cedula = EXCLUDED.cedula,
        rol = 'docente',
        estado = 'activo'
    RETURNING id_usuario INTO v_horario_id;

    -- Registrar en tabla de docentes con su especialidad
    INSERT INTO public.docentes (id_docente, especialidad)
    VALUES (v_horario_id, 'Redes y Ciberseguridad')
    ON CONFLICT (id_docente) DO UPDATE SET especialidad = EXCLUDED.especialidad;

    -- Registrar modalidad / rango: HORARIO (Tiempo Parcial)
    INSERT INTO public.pwa_docente_tipo (id_docente, tipo_docente)
    VALUES (v_horario_id, 'horario')
    ON CONFLICT (id_docente) DO UPDATE SET tipo_docente = 'horario', actualizado_en = now();

    -- Registrar pertenencia al departamento
    IF v_dept_id IS NOT NULL AND v_admin_id IS NOT NULL THEN
        INSERT INTO public.pwa_docente_departamentos (id_departamento, id_docente, registrado_por)
        VALUES (v_dept_id, v_horario_id, v_admin_id)
        ON CONFLICT (id_departamento, id_docente) DO NOTHING;
    END IF;

END;
$$;

-- ============================================================================
-- VERIFICACIÓN INMEDIATA DEL RESULTADO
-- ============================================================================
SELECT 
    u.id_usuario,
    u.nombre,
    u.correo,
    u.rol,
    u.estado,
    dt.tipo_docente AS rango_docente,
    d.especialidad,
    c.nombre AS carrera_asignada,
    dept.nombre AS dpto_jefatura
FROM public.usuarios u
LEFT JOIN public.docentes d ON d.id_docente = u.id_usuario
LEFT JOIN public.pwa_docente_tipo dt ON dt.id_docente = u.id_usuario
LEFT JOIN public.usuario_carrera uc ON uc.id_usuario = u.id_usuario
LEFT JOIN public.carreras c ON c.id_carrera = uc.id_carrera
LEFT JOIN public.pwa_departamento_jefaturas dj ON dj.id_usuario = u.id_usuario
LEFT JOIN public.pwa_departamentos dept ON dept.id_departamento = dj.id_departamento
WHERE u.correo IN (
    'admin.qa@acaplan.edu.ni',
    'planificador.qa@acaplan.edu.ni',
    'coordinador.qa@acaplan.edu.ni',
    'jefatura.qa@acaplan.edu.ni',
    'docente.planta@acaplan.edu.ni',
    'docente.horario@acaplan.edu.ni'
)
ORDER BY u.id_usuario;
