-- Run after Supabase.sql. Existing Auth users are linked by matching email.
-- Rows without a matching Auth identity stay unlinked and cannot sign in until corrected.

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS auth_user_id UUID
    REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.usuarios AS usuario
SET auth_user_id = auth_user.id
FROM auth.users AS auth_user
WHERE usuario.auth_user_id IS NULL
  AND lower(usuario.correo) = lower(auth_user.email);

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_auth_user_id_uidx
    ON public.usuarios (auth_user_id)
    WHERE auth_user_id IS NOT NULL;

ALTER TABLE public.usuarios DROP COLUMN IF EXISTS contrasena;

-- Preserve the one-active-period rule in PostgreSQL, including concurrent requests.
UPDATE public.periodos SET es_activo = FALSE WHERE es_activo IS NULL;
ALTER TABLE public.periodos ALTER COLUMN es_activo SET DEFAULT FALSE;
ALTER TABLE public.periodos ALTER COLUMN es_activo SET NOT NULL;

DO $$
BEGIN
    IF (SELECT count(*) FROM public.periodos WHERE es_activo) > 1 THEN
        RAISE EXCEPTION 'There are multiple active periods. Choose one active period before applying this migration.';
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS periodos_single_active_uidx
    ON public.periodos (es_activo)
    WHERE es_activo = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS secciones_periodo_carrera_codigo_uidx
    ON public.secciones (id_periodo, id_carrera, lower(btrim(codigo)));

CREATE INDEX IF NOT EXISTS bloques_clase_periodo_dia_hora_idx
    ON public.bloques_clase (id_periodo, dia, hora_inicio, hora_fin);
CREATE INDEX IF NOT EXISTS horarios_docente_publicado_bloque_idx
    ON public.horarios (id_docente, id_bloque)
    WHERE estado_publicacion = 'publicado';
CREATE INDEX IF NOT EXISTS horarios_seccion_asignatura_idx
    ON public.horarios (id_seccion, id_asignatura);

CREATE OR REPLACE FUNCTION public.prevent_removing_scheduled_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acaplan_schedule_conflicts'));
    IF EXISTS (
        SELECT 1
        FROM public.horarios AS horario
        WHERE horario.id_seccion = OLD.id_seccion
          AND horario.id_asignatura = OLD.id_asignatura
    ) THEN
        RAISE EXCEPTION 'A subject used by a schedule cannot be removed from its section.'
            USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seccion_asignatura_protect_schedule ON public.seccion_asignatura;
CREATE TRIGGER seccion_asignatura_protect_schedule
    BEFORE DELETE OR UPDATE OF id_seccion, id_asignatura
    ON public.seccion_asignatura
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_removing_scheduled_subject();

-- Serialize block writes by period/day so overlapping intervals cannot race.
CREATE OR REPLACE FUNCTION public.prevent_overlapping_class_blocks()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acaplan_schedule_conflicts'));

    IF TG_OP = 'UPDATE'
       AND EXISTS (
           SELECT 1
           FROM public.horarios AS horario
           WHERE horario.id_bloque = OLD.id_bloque
       )
       AND (NEW.id_periodo IS DISTINCT FROM OLD.id_periodo
            OR NEW.dia IS DISTINCT FROM OLD.dia
            OR NEW.hora_inicio IS DISTINCT FROM OLD.hora_inicio
            OR NEW.hora_fin IS DISTINCT FROM OLD.hora_fin
            OR NEW.es_receso IS DISTINCT FROM OLD.es_receso) THEN
        RAISE EXCEPTION 'A class block assigned to a schedule cannot be changed.'
            USING ERRCODE = '23514';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        NEW.id_periodo,
        pg_catalog.hashtext(NEW.dia::TEXT)
    );

    IF EXISTS (
        SELECT 1
        FROM public.bloques_clase AS existing
        WHERE existing.id_periodo = NEW.id_periodo
          AND existing.dia = NEW.dia
          AND existing.id_bloque IS DISTINCT FROM NEW.id_bloque
          AND NEW.hora_inicio < existing.hora_fin
          AND NEW.hora_fin > existing.hora_inicio
    ) THEN
        RAISE EXCEPTION 'The class block overlaps another block on this day.'
            USING ERRCODE = '23P01';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bloques_clase_prevent_overlap ON public.bloques_clase;
CREATE TRIGGER bloques_clase_prevent_overlap
    BEFORE INSERT OR UPDATE OF id_periodo, dia, hora_inicio, hora_fin, es_receso
    ON public.bloques_clase
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_overlapping_class_blocks();

-- Validate each schedule row in the database so concurrent clients cannot
-- assign a teacher, room, or section to overlapping periods.
CREATE OR REPLACE FUNCTION public.validate_schedule_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    assignment_period INTEGER;
    assignment_day public.dias_semana;
    assignment_start TIME;
    assignment_end TIME;
    is_break BOOLEAN;
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acaplan_schedule_conflicts'));

    SELECT bloque.id_periodo, bloque.dia, bloque.hora_inicio, bloque.hora_fin, bloque.es_receso
    INTO assignment_period, assignment_day, assignment_start, assignment_end, is_break
    FROM public.bloques_clase AS bloque
    WHERE bloque.id_bloque = NEW.id_bloque;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The selected class block does not exist.' USING ERRCODE = '23503';
    END IF;
    IF is_break THEN
        RAISE EXCEPTION 'A break block cannot be assigned to a class.' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.secciones AS seccion
        WHERE seccion.id_seccion = NEW.id_seccion
          AND seccion.id_periodo = assignment_period
    ) THEN
        RAISE EXCEPTION 'The class block and section must belong to the same academic period.'
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.seccion_asignatura AS vinculacion
        WHERE vinculacion.id_seccion = NEW.id_seccion
          AND vinculacion.id_asignatura = NEW.id_asignatura
    ) THEN
        RAISE EXCEPTION 'The subject is not assigned to the selected section.'
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.docentes AS docente
        JOIN public.usuarios AS usuario ON usuario.id_usuario = docente.id_docente
        WHERE docente.id_docente = NEW.id_docente
          AND usuario.rol = 'docente'
          AND usuario.estado = 'activo'
    ) THEN
        RAISE EXCEPTION 'The selected teacher is not active.' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.aulas AS aula
        WHERE aula.id_aula = NEW.id_aula AND aula.estado = 'activo'
    ) THEN
        RAISE EXCEPTION 'The selected room is not active.' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.horarios AS horario
        JOIN public.bloques_clase AS bloque ON bloque.id_bloque = horario.id_bloque
        WHERE horario.id_horario IS DISTINCT FROM NEW.id_horario
          AND bloque.id_periodo = assignment_period
          AND bloque.dia = assignment_day
          AND assignment_start < bloque.hora_fin
          AND assignment_end > bloque.hora_inicio
          AND (horario.id_docente = NEW.id_docente
               OR horario.id_aula = NEW.id_aula
               OR horario.id_seccion = NEW.id_seccion)
    ) THEN
        RAISE EXCEPTION 'The teacher, room, or section already has a class during this time.'
            USING ERRCODE = '23P01';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS horarios_validate_assignment ON public.horarios;
CREATE TRIGGER horarios_validate_assignment
    BEFORE INSERT OR UPDATE OF id_docente, id_asignatura, id_seccion, id_aula, id_bloque, estado_publicacion
    ON public.horarios
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_schedule_assignment();

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT usuario.id_usuario
    FROM public.usuarios AS usuario
    WHERE usuario.auth_user_id = auth.uid()
      AND usuario.estado = 'activo'
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_active_app_user()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.current_app_user_id() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.usuarios AS usuario
        WHERE usuario.auth_user_id = auth.uid()
          AND usuario.estado = 'activo'
          AND usuario.rol = 'administrador'
    )
$$;

REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_app_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_app_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;

-- The database, rather than the client, prevents disabling/demoting the last admin.
CREATE OR REPLACE FUNCTION public.prevent_last_active_admin_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF OLD.rol = 'administrador'
       AND OLD.estado = 'activo'
       AND (NEW.rol <> 'administrador' OR NEW.estado <> 'activo') THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acaplan_active_admin'));

        IF NOT EXISTS (
            SELECT 1
            FROM public.usuarios AS other_admin
            WHERE other_admin.id_usuario <> OLD.id_usuario
              AND other_admin.rol = 'administrador'
              AND other_admin.estado = 'activo'
        ) THEN
            RAISE EXCEPTION 'The last active administrator cannot be disabled or demoted.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS usuarios_prevent_last_admin_change ON public.usuarios;
CREATE TRIGGER usuarios_prevent_last_admin_change
    BEFORE UPDATE OF rol, estado ON public.usuarios
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_last_active_admin_change();

-- Atomic admin actions called by the mobile app.
CREATE OR REPLACE FUNCTION public.set_active_period(p_period_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.periodos WHERE id_periodo = p_period_id) THEN
        RAISE EXCEPTION 'The requested period does not exist.' USING ERRCODE = 'P0002';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acaplan_active_period'));
    UPDATE public.periodos SET es_activo = FALSE WHERE es_activo = TRUE;
    UPDATE public.periodos SET es_activo = TRUE WHERE id_periodo = p_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_active_period(p_period_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acaplan_active_period'));
    UPDATE public.periodos SET es_activo = FALSE WHERE id_periodo = p_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_section_subjects(
    p_section_id INTEGER,
    p_subject_ids INTEGER[]
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acaplan_schedule_conflicts'));

    IF NOT EXISTS (SELECT 1 FROM public.secciones WHERE id_seccion = p_section_id) THEN
        RAISE EXCEPTION 'The requested section does not exist.' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.horarios AS horario
        WHERE horario.id_seccion = p_section_id
          AND NOT (horario.id_asignatura = ANY(COALESCE(p_subject_ids, ARRAY[]::INTEGER[])))
    ) THEN
        RAISE EXCEPTION 'A subject used by a schedule cannot be removed from its section.'
            USING ERRCODE = '23514';
    END IF;

    DELETE FROM public.seccion_asignatura
    WHERE id_seccion = p_section_id
      AND NOT (id_asignatura = ANY(COALESCE(p_subject_ids, ARRAY[]::INTEGER[])));

    INSERT INTO public.seccion_asignatura (id_seccion, id_asignatura)
    SELECT p_section_id, subjects.subject_id
    FROM pg_catalog.unnest(COALESCE(p_subject_ids, ARRAY[]::INTEGER[])) AS subjects(subject_id)
    ON CONFLICT (id_seccion, id_asignatura) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_active_schedule()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    active_period_id INTEGER;
    published_count INTEGER;
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acaplan_schedule_conflicts'));
    SELECT periodo.id_periodo INTO active_period_id
    FROM public.periodos AS periodo
    WHERE periodo.es_activo = TRUE;

    IF active_period_id IS NULL THEN
        RAISE EXCEPTION 'There is no active academic period.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.horarios AS horario
        JOIN public.bloques_clase AS bloque ON bloque.id_bloque = horario.id_bloque
        WHERE bloque.id_periodo = active_period_id
    ) THEN
        RAISE EXCEPTION 'There are no assignments to publish.' USING ERRCODE = 'P0002';
    END IF;

    -- Re-run assignment validation for existing drafts before publishing them.
    UPDATE public.horarios AS horario
    SET id_docente = horario.id_docente
    FROM public.bloques_clase AS bloque
    WHERE bloque.id_bloque = horario.id_bloque
      AND bloque.id_periodo = active_period_id;

    UPDATE public.horarios AS horario
    SET estado_publicacion = 'publicado',
        fecha_actualizacion = pg_catalog.now()
    FROM public.bloques_clase AS bloque
    WHERE bloque.id_bloque = horario.id_bloque
      AND bloque.id_periodo = active_period_id;

    GET DIAGNOSTICS published_count = ROW_COUNT;
    RETURN published_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_period(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_active_period(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_section_subjects(INTEGER, INTEGER[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_active_schedule() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_period(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_active_period(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_section_subjects(INTEGER, INTEGER[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_active_schedule() TO authenticated;

-- Remove inherited client privileges, then grant only authenticated app operations.
REVOKE ALL ON TABLE
    public.usuarios,
    public.docentes,
    public.periodos,
    public.carreras,
    public.asignaturas,
    public.pabellones,
    public.aulas,
    public.recursos,
    public.aula_recurso,
    public.secciones,
    public.seccion_asignatura,
    public.bloques_clase,
    public.disponibilidad_docente,
    public.horarios
FROM anon, authenticated;

GRANT SELECT ON TABLE
    public.usuarios,
    public.docentes,
    public.periodos,
    public.carreras,
    public.asignaturas,
    public.pabellones,
    public.aulas,
    public.recursos,
    public.aula_recurso,
    public.secciones,
    public.seccion_asignatura,
    public.bloques_clase,
    public.disponibilidad_docente,
    public.horarios
TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE
    public.periodos,
    public.carreras,
    public.asignaturas,
    public.pabellones,
    public.aulas,
    public.recursos,
    public.aula_recurso,
    public.secciones,
    public.seccion_asignatura,
    public.bloques_clase,
    public.disponibilidad_docente,
    public.horarios
TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'usuarios', 'docentes', 'periodos', 'carreras', 'asignaturas',
        'pabellones', 'aulas', 'recursos', 'aula_recurso', 'secciones',
        'seccion_asignatura', 'bloques_clase', 'disponibilidad_docente', 'horarios'
    ] LOOP
        EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    END LOOP;
END;
$$;

-- Replace any earlier policies on these tables so no permissive policy remains.
DO $$
DECLARE
    existing_policy RECORD;
BEGIN
    FOR existing_policy IN
        SELECT policyname, tablename
        FROM pg_catalog.pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY(ARRAY[
              'usuarios', 'docentes', 'periodos', 'carreras', 'asignaturas',
              'pabellones', 'aulas', 'recursos', 'aula_recurso', 'secciones',
              'seccion_asignatura', 'bloques_clase', 'disponibilidad_docente', 'horarios'
          ])
    LOOP
        EXECUTE pg_catalog.format(
            'DROP POLICY %I ON public.%I',
            existing_policy.policyname,
            existing_policy.tablename
        );
    END LOOP;
END;
$$;

-- A user sees their own profile. Only the server-side admin function can modify users.
DROP POLICY IF EXISTS usuarios_select_own_or_admin ON public.usuarios;
CREATE POLICY usuarios_select_own_or_admin ON public.usuarios
    FOR SELECT TO authenticated
    USING ((auth_user_id = auth.uid() AND estado = 'activo') OR public.is_active_admin());

DROP POLICY IF EXISTS docentes_admin_all ON public.docentes;
CREATE POLICY docentes_admin_all ON public.docentes
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS docentes_select_own ON public.docentes;
CREATE POLICY docentes_select_own ON public.docentes
    FOR SELECT TO authenticated
    USING (id_docente = public.current_app_user_id());

DROP POLICY IF EXISTS periodos_admin_all ON public.periodos;
CREATE POLICY periodos_admin_all ON public.periodos
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS periodos_teacher_read ON public.periodos;
CREATE POLICY periodos_teacher_read ON public.periodos
    FOR SELECT TO authenticated
    USING (public.is_active_app_user() AND es_activo = TRUE);

DROP POLICY IF EXISTS carreras_admin_all ON public.carreras;
CREATE POLICY carreras_admin_all ON public.carreras
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS carreras_teacher_read ON public.carreras;
CREATE POLICY carreras_teacher_read ON public.carreras
    FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS asignaturas_admin_all ON public.asignaturas;
CREATE POLICY asignaturas_admin_all ON public.asignaturas
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS asignaturas_teacher_read ON public.asignaturas;
CREATE POLICY asignaturas_teacher_read ON public.asignaturas
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.horarios AS horario
        WHERE horario.id_asignatura = asignaturas.id_asignatura
          AND horario.id_docente = public.current_app_user_id()
          AND horario.estado_publicacion = 'publicado'
    ));

DROP POLICY IF EXISTS pabellones_admin_all ON public.pabellones;
CREATE POLICY pabellones_admin_all ON public.pabellones
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS pabellones_teacher_read ON public.pabellones;
CREATE POLICY pabellones_teacher_read ON public.pabellones
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1
        FROM public.aulas AS aula
        JOIN public.horarios AS horario ON horario.id_aula = aula.id_aula
        WHERE aula.id_pabellon = pabellones.id_pabellon
          AND horario.id_docente = public.current_app_user_id()
          AND horario.estado_publicacion = 'publicado'
    ));

DROP POLICY IF EXISTS aulas_admin_all ON public.aulas;
CREATE POLICY aulas_admin_all ON public.aulas
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS aulas_teacher_read ON public.aulas;
CREATE POLICY aulas_teacher_read ON public.aulas
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.horarios AS horario
        WHERE horario.id_aula = aulas.id_aula
          AND horario.id_docente = public.current_app_user_id()
          AND horario.estado_publicacion = 'publicado'
    ));

DROP POLICY IF EXISTS recursos_admin_all ON public.recursos;
CREATE POLICY recursos_admin_all ON public.recursos
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS recursos_teacher_read ON public.recursos;
CREATE POLICY recursos_teacher_read ON public.recursos
    FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS aula_recurso_admin_all ON public.aula_recurso;
CREATE POLICY aula_recurso_admin_all ON public.aula_recurso
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS aula_recurso_teacher_read ON public.aula_recurso;
CREATE POLICY aula_recurso_teacher_read ON public.aula_recurso
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.horarios AS horario
        WHERE horario.id_aula = aula_recurso.id_aula
          AND horario.id_docente = public.current_app_user_id()
          AND horario.estado_publicacion = 'publicado'
    ));

DROP POLICY IF EXISTS secciones_admin_all ON public.secciones;
CREATE POLICY secciones_admin_all ON public.secciones
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS secciones_teacher_read ON public.secciones;
CREATE POLICY secciones_teacher_read ON public.secciones
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.horarios AS horario
        WHERE horario.id_seccion = secciones.id_seccion
          AND horario.id_docente = public.current_app_user_id()
          AND horario.estado_publicacion = 'publicado'
    ));

DROP POLICY IF EXISTS seccion_asignatura_admin_all ON public.seccion_asignatura;
CREATE POLICY seccion_asignatura_admin_all ON public.seccion_asignatura
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS seccion_asignatura_teacher_read ON public.seccion_asignatura;
CREATE POLICY seccion_asignatura_teacher_read ON public.seccion_asignatura
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.horarios AS horario
        WHERE horario.id_seccion = seccion_asignatura.id_seccion
          AND horario.id_docente = public.current_app_user_id()
          AND horario.estado_publicacion = 'publicado'
    ));

DROP POLICY IF EXISTS bloques_clase_admin_all ON public.bloques_clase;
CREATE POLICY bloques_clase_admin_all ON public.bloques_clase
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS bloques_clase_teacher_read ON public.bloques_clase;
CREATE POLICY bloques_clase_teacher_read ON public.bloques_clase
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.horarios AS horario
        WHERE horario.id_bloque = bloques_clase.id_bloque
          AND horario.id_docente = public.current_app_user_id()
          AND horario.estado_publicacion = 'publicado'
    ));

DROP POLICY IF EXISTS disponibilidad_docente_admin_all ON public.disponibilidad_docente;
CREATE POLICY disponibilidad_docente_admin_all ON public.disponibilidad_docente
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS disponibilidad_docente_teacher_read ON public.disponibilidad_docente;
CREATE POLICY disponibilidad_docente_teacher_read ON public.disponibilidad_docente
    FOR SELECT TO authenticated
    USING (id_docente = public.current_app_user_id());

DROP POLICY IF EXISTS horarios_admin_all ON public.horarios;
CREATE POLICY horarios_admin_all ON public.horarios
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS horarios_teacher_read ON public.horarios;
CREATE POLICY horarios_teacher_read ON public.horarios
    FOR SELECT TO authenticated
    USING (
        id_docente = public.current_app_user_id()
        AND estado_publicacion = 'publicado'
    );
