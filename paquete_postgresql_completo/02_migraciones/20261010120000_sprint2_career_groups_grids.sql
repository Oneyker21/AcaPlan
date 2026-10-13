-- Sprint 2 / H06, H07, H09, H10.
-- Career-scoped catalogs and mobile-configurable academic grids.
-- Run after 20261010000001_sprint1_career_scopes.sql and before H08 inventory.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_active_planner()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.usuarios AS usuario
        WHERE usuario.auth_user_id = auth.uid()
          AND usuario.estado = 'activo'
          AND usuario.rol = 'planificacion'
    )
$$;

CREATE OR REPLACE FUNCTION public.is_active_coordinator()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.usuarios AS usuario
        WHERE usuario.auth_user_id = auth.uid()
          AND usuario.estado = 'activo'
          AND usuario.rol = 'coordinacion'
    )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_career(target_career_id INTEGER)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.is_active_admin()
        OR public.is_active_planner()
        OR (
            public.is_active_coordinator()
            AND EXISTS (
                SELECT 1 FROM public.usuario_carrera AS assigned
                WHERE assigned.id_usuario = public.current_app_user_id()
                  AND assigned.id_carrera = target_career_id
            )
        )
$$;

REVOKE ALL ON FUNCTION public.is_active_planner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_coordinator() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_career(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_planner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_coordinator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_career(INTEGER) TO authenticated;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.carreras
        GROUP BY lower(btrim(nombre)) HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate career names differ only by case or surrounding spaces. Resolve them before applying this migration.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.asignaturas
        GROUP BY lower(btrim(codigo)) HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate subject codes differ only by case or surrounding spaces. Resolve them before applying this migration.';
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS carreras_nombre_normalizado_uidx
    ON public.carreras (lower(btrim(nombre)));
CREATE UNIQUE INDEX IF NOT EXISTS asignaturas_codigo_normalizado_uidx
    ON public.asignaturas (lower(btrim(codigo)));

ALTER TABLE public.carreras
    DROP CONSTRAINT IF EXISTS carreras_nombre_no_vacio;
ALTER TABLE public.carreras
    ADD CONSTRAINT carreras_nombre_no_vacio CHECK (btrim(nombre) <> '') NOT VALID;
ALTER TABLE public.asignaturas
    ALTER COLUMN horas_teoricas SET DEFAULT 0,
    ALTER COLUMN horas_practicas SET DEFAULT 0;
ALTER TABLE public.asignaturas
    DROP CONSTRAINT IF EXISTS asignaturas_codigo_no_vacio,
    DROP CONSTRAINT IF EXISTS asignaturas_nombre_no_vacio,
    DROP CONSTRAINT IF EXISTS asignaturas_ano_estudio_positivo;
ALTER TABLE public.asignaturas
    ADD CONSTRAINT asignaturas_codigo_no_vacio CHECK (btrim(codigo) <> '') NOT VALID,
    ADD CONSTRAINT asignaturas_nombre_no_vacio CHECK (btrim(nombre) <> '') NOT VALID,
    ADD CONSTRAINT asignaturas_ano_estudio_positivo CHECK (ano_estudio > 0) NOT VALID;

-- Existing groups become regular morning groups until an administrator
-- explicitly classifies them. A site remains text so historic campuses are retained.
ALTER TABLE public.secciones
    ADD COLUMN IF NOT EXISTS modalidad TEXT NOT NULL DEFAULT 'regular',
    ADD COLUMN IF NOT EXISTS turno TEXT NOT NULL DEFAULT 'matutino',
    ADD COLUMN IF NOT EXISTS sede VARCHAR(150) NOT NULL DEFAULT 'Pendiente';
ALTER TABLE public.secciones
    DROP CONSTRAINT IF EXISTS secciones_modalidad_valida,
    DROP CONSTRAINT IF EXISTS secciones_turno_valido,
    DROP CONSTRAINT IF EXISTS secciones_sede_no_vacia,
    DROP CONSTRAINT IF EXISTS secciones_codigo_no_vacio,
    DROP CONSTRAINT IF EXISTS secciones_ano_estudio_positivo;
ALTER TABLE public.secciones
    ADD CONSTRAINT secciones_modalidad_valida CHECK (modalidad IN ('regular', 'encuentro', 'salud')) NOT VALID,
    ADD CONSTRAINT secciones_turno_valido CHECK (turno IN ('matutino', 'vespertino', 'nocturno')) NOT VALID,
    ADD CONSTRAINT secciones_sede_no_vacia CHECK (btrim(sede) <> '') NOT VALID,
    ADD CONSTRAINT secciones_codigo_no_vacio CHECK (btrim(codigo) <> '') NOT VALID,
    ADD CONSTRAINT secciones_ano_estudio_positivo CHECK (ano_estudio > 0) NOT VALID;

-- A timetable grid is unique by period, modality, shift, and day.
ALTER TABLE public.bloques_clase
    ADD COLUMN IF NOT EXISTS modalidad TEXT NOT NULL DEFAULT 'regular',
    ADD COLUMN IF NOT EXISTS turno TEXT NOT NULL DEFAULT 'matutino';
ALTER TABLE public.bloques_clase
    DROP CONSTRAINT IF EXISTS bloques_modalidad_valida,
    DROP CONSTRAINT IF EXISTS bloques_turno_valido;
ALTER TABLE public.bloques_clase
    ADD CONSTRAINT bloques_modalidad_valida CHECK (modalidad IN ('regular', 'encuentro', 'salud')) NOT VALID,
    ADD CONSTRAINT bloques_turno_valido CHECK (turno IN ('matutino', 'vespertino', 'nocturno')) NOT VALID;

ALTER TABLE public.dias_habilitados_periodo
    ADD COLUMN IF NOT EXISTS modalidad TEXT NOT NULL DEFAULT 'regular',
    ADD COLUMN IF NOT EXISTS turno TEXT NOT NULL DEFAULT 'matutino';
ALTER TABLE public.dias_habilitados_periodo
    DROP CONSTRAINT IF EXISTS dias_modalidad_valida,
    DROP CONSTRAINT IF EXISTS dias_turno_valido;
ALTER TABLE public.dias_habilitados_periodo
    DROP CONSTRAINT IF EXISTS dias_habilitados_periodo_pkey;
ALTER TABLE public.dias_habilitados_periodo
    ADD CONSTRAINT dias_habilitados_periodo_pkey PRIMARY KEY (id_periodo, modalidad, turno, dia),
    ADD CONSTRAINT dias_modalidad_valida CHECK (modalidad IN ('regular', 'encuentro', 'salud')) NOT VALID,
    ADD CONSTRAINT dias_turno_valido CHECK (turno IN ('matutino', 'vespertino', 'nocturno')) NOT VALID;

CREATE INDEX IF NOT EXISTS bloques_clase_periodo_grid_idx
    ON public.bloques_clase (id_periodo, modalidad, turno, dia, hora_inicio);

CREATE OR REPLACE FUNCTION public.prevent_changing_linked_subject_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF (NEW.id_carrera IS DISTINCT FROM OLD.id_carrera OR NEW.ano_estudio IS DISTINCT FROM OLD.ano_estudio)
       AND EXISTS (SELECT 1 FROM public.seccion_asignatura WHERE id_asignatura = OLD.id_asignatura) THEN
        RAISE EXCEPTION 'A subject linked to an academic group cannot change its career or study year.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS asignaturas_prevent_linked_scope_change ON public.asignaturas;
CREATE TRIGGER asignaturas_prevent_linked_scope_change
    BEFORE UPDATE OF id_carrera, ano_estudio ON public.asignaturas
    FOR EACH ROW EXECUTE FUNCTION public.prevent_changing_linked_subject_scope();

CREATE OR REPLACE FUNCTION public.prevent_changing_group_subject_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF (NEW.id_carrera IS DISTINCT FROM OLD.id_carrera OR NEW.ano_estudio IS DISTINCT FROM OLD.ano_estudio)
       AND EXISTS (SELECT 1 FROM public.seccion_asignatura WHERE id_seccion = OLD.id_seccion) THEN
        RAISE EXCEPTION 'An academic group linked to subjects cannot change its career or study year.' USING ERRCODE = '23514';
    END IF;
    IF (NEW.id_periodo IS DISTINCT FROM OLD.id_periodo
        OR NEW.id_carrera IS DISTINCT FROM OLD.id_carrera
        OR NEW.ano_estudio IS DISTINCT FROM OLD.ano_estudio
        OR NEW.modalidad IS DISTINCT FROM OLD.modalidad
        OR NEW.turno IS DISTINCT FROM OLD.turno
        OR NEW.sede IS DISTINCT FROM OLD.sede)
       AND EXISTS (SELECT 1 FROM public.horarios WHERE id_seccion = OLD.id_seccion) THEN
        RAISE EXCEPTION 'A group with schedule assignments cannot change its period, career, year, modality, shift, or site.' USING ERRCODE = '23514';
    END IF;
    IF NEW.cantidad_estudiantes IS DISTINCT FROM OLD.cantidad_estudiantes AND EXISTS (
        SELECT 1 FROM public.horarios AS horario
        JOIN public.aulas AS aula ON aula.id_aula = horario.id_aula
        WHERE horario.id_seccion = OLD.id_seccion
          AND aula.capacidad < NEW.cantidad_estudiantes
    ) THEN
        RAISE EXCEPTION 'The new group size exceeds the capacity of an assigned room.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS secciones_prevent_schedule_scope_change ON public.secciones;
CREATE TRIGGER secciones_prevent_schedule_scope_change
    BEFORE UPDATE OF id_periodo, id_carrera, ano_estudio, modalidad, turno, sede, cantidad_estudiantes ON public.secciones
    FOR EACH ROW EXECUTE FUNCTION public.prevent_changing_group_subject_scope();

CREATE OR REPLACE FUNCTION public.prevent_deleting_used_class_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.horarios WHERE id_bloque = OLD.id_bloque) THEN
        RAISE EXCEPTION 'Remove schedule assignments using this block before deleting it.' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_schedule_group_grid()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    section_modality TEXT;
    section_shift TEXT;
    block_modality TEXT;
    block_shift TEXT;
BEGIN
    SELECT modalidad, turno INTO section_modality, section_shift
    FROM public.secciones WHERE id_seccion = NEW.id_seccion;
    SELECT modalidad, turno INTO block_modality, block_shift
    FROM public.bloques_clase WHERE id_bloque = NEW.id_bloque;
    IF section_modality IS NULL OR block_modality IS NULL THEN
        RAISE EXCEPTION 'The selected group or time block does not exist.' USING ERRCODE = '23503';
    END IF;
    IF section_modality <> block_modality OR section_shift <> block_shift THEN
        RAISE EXCEPTION 'The group and class block must use the same modality and shift.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS horarios_validate_group_grid ON public.horarios;
CREATE TRIGGER horarios_validate_group_grid
    BEFORE INSERT OR UPDATE OF id_seccion, id_bloque ON public.horarios
    FOR EACH ROW EXECUTE FUNCTION public.validate_schedule_group_grid();

-- Historical assignments are read-only references; catalog and group rows are
-- deactivated/edited rather than physically deleted.
REVOKE DELETE ON TABLE public.carreras, public.asignaturas, public.secciones FROM authenticated;

DROP POLICY IF EXISTS carreras_admin_all ON public.carreras;
DROP POLICY IF EXISTS carreras_teacher_read ON public.carreras;
CREATE POLICY carreras_catalog_read ON public.carreras
    FOR SELECT TO authenticated
    USING (
        public.is_active_admin()
        OR public.is_active_planner()
        OR public.is_active_coordinator() AND public.can_manage_career(id_carrera)
        OR EXISTS (SELECT 1 FROM public.usuarios WHERE auth_user_id = auth.uid() AND estado = 'activo' AND rol = 'docente')
    );
CREATE POLICY carreras_catalog_insert ON public.carreras
    FOR INSERT TO authenticated
    WITH CHECK (public.is_active_admin() OR public.is_active_planner());
CREATE POLICY carreras_catalog_update ON public.carreras
    FOR UPDATE TO authenticated
    USING (public.is_active_admin() OR public.is_active_planner())
    WITH CHECK (public.is_active_admin() OR public.is_active_planner());

DROP POLICY IF EXISTS asignaturas_admin_all ON public.asignaturas;
DROP POLICY IF EXISTS asignaturas_teacher_read ON public.asignaturas;
CREATE POLICY asignaturas_catalog_read ON public.asignaturas
    FOR SELECT TO authenticated
    USING (
        public.is_active_admin()
        OR public.is_active_planner()
        OR public.is_active_coordinator() AND public.can_manage_career(id_carrera)
        OR EXISTS (
            SELECT 1 FROM public.horarios AS horario
            WHERE horario.id_asignatura = asignaturas.id_asignatura
              AND horario.id_docente = public.current_app_user_id()
              AND horario.estado_publicacion = 'publicado'
        )
    );
CREATE POLICY asignaturas_catalog_insert ON public.asignaturas
    FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_career(id_carrera));
CREATE POLICY asignaturas_catalog_update ON public.asignaturas
    FOR UPDATE TO authenticated
    USING (public.can_manage_career(id_carrera))
    WITH CHECK (public.can_manage_career(id_carrera));

DROP POLICY IF EXISTS periodos_teacher_read ON public.periodos;
CREATE POLICY periodos_planning_read ON public.periodos
    FOR SELECT TO authenticated
    USING (public.is_active_planner() OR public.is_active_coordinator() OR (public.is_active_app_user() AND es_activo = TRUE));

DROP POLICY IF EXISTS secciones_admin_all ON public.secciones;
DROP POLICY IF EXISTS secciones_teacher_read ON public.secciones;
CREATE POLICY secciones_group_read ON public.secciones
    FOR SELECT TO authenticated
    USING (
        public.is_active_admin()
        OR public.is_active_planner()
        OR public.is_active_coordinator() AND public.can_manage_career(id_carrera)
        OR EXISTS (
            SELECT 1 FROM public.horarios AS horario
            WHERE horario.id_seccion = secciones.id_seccion
              AND horario.id_docente = public.current_app_user_id()
              AND horario.estado_publicacion = 'publicado'
        )
    );
CREATE POLICY secciones_group_insert ON public.secciones
    FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_career(id_carrera));
CREATE POLICY secciones_group_update ON public.secciones
    FOR UPDATE TO authenticated
    USING (public.can_manage_career(id_carrera))
    WITH CHECK (public.can_manage_career(id_carrera));

DROP POLICY IF EXISTS seccion_asignatura_admin_all ON public.seccion_asignatura;
DROP POLICY IF EXISTS seccion_asignatura_teacher_read ON public.seccion_asignatura;
CREATE POLICY seccion_asignatura_group_read ON public.seccion_asignatura
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.secciones AS seccion
            WHERE seccion.id_seccion = seccion_asignatura.id_seccion
              AND (public.can_manage_career(seccion.id_carrera)
                   OR EXISTS (
                       SELECT 1 FROM public.horarios AS horario
                       WHERE horario.id_seccion = seccion.id_seccion
                         AND horario.id_docente = public.current_app_user_id()
                         AND horario.estado_publicacion = 'publicado'
                   ))
        )
    );
REVOKE INSERT, UPDATE, DELETE ON TABLE public.seccion_asignatura FROM authenticated;

CREATE OR REPLACE FUNCTION public.replace_section_subjects(
    p_section_id INTEGER,
    p_subject_ids INTEGER[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    section_career_id INTEGER;
    section_year INTEGER;
    requested_ids INTEGER[] := COALESCE(p_subject_ids, ARRAY[]::INTEGER[]);
BEGIN
    SELECT id_carrera, ano_estudio INTO section_career_id, section_year
    FROM public.secciones WHERE id_seccion = p_section_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The requested group does not exist.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.can_manage_career(section_career_id) THEN
        RAISE EXCEPTION 'You cannot manage this career.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.unnest(requested_ids) AS requested(id_asignatura)
        LEFT JOIN public.asignaturas AS asignatura ON asignatura.id_asignatura = requested.id_asignatura
        WHERE asignatura.id_asignatura IS NULL
           OR asignatura.id_carrera <> section_career_id
           OR asignatura.ano_estudio <> section_year
           OR asignatura.estado <> 'activo'
    ) THEN
        RAISE EXCEPTION 'Every linked subject must be active and match the group career and study year.' USING ERRCODE = '23514';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acaplan_schedule_conflicts'));
    IF EXISTS (
        SELECT 1 FROM public.horarios AS horario
        WHERE horario.id_seccion = p_section_id
          AND NOT (horario.id_asignatura = ANY(requested_ids))
    ) THEN
        RAISE EXCEPTION 'A subject used by a schedule cannot be removed from its group.' USING ERRCODE = '23514';
    END IF;
    DELETE FROM public.seccion_asignatura
    WHERE id_seccion = p_section_id AND NOT (id_asignatura = ANY(requested_ids));
    INSERT INTO public.seccion_asignatura (id_seccion, id_asignatura)
    SELECT p_section_id, requested.id_asignatura
    FROM (SELECT DISTINCT pg_catalog.unnest(requested_ids) AS id_asignatura) AS requested
    ON CONFLICT (id_seccion, id_asignatura) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_section_subjects(INTEGER, INTEGER[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_section_subjects(INTEGER, INTEGER[]) TO authenticated;

DROP POLICY IF EXISTS asignatura_recurso_planner_read ON public.asignatura_recurso;
CREATE POLICY asignatura_recurso_planner_read ON public.asignatura_recurso
    FOR SELECT TO authenticated USING (public.is_active_planner());

CREATE OR REPLACE FUNCTION public.replace_subject_resources(
    p_subject_id INTEGER,
    p_resource_ids INTEGER[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    requested_ids INTEGER[] := COALESCE(p_resource_ids, ARRAY[]::INTEGER[]);
BEGIN
    IF NOT public.is_active_admin() AND NOT public.is_active_planner() THEN
        RAISE EXCEPTION 'Only administration or planning can change required subject resources.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.asignaturas WHERE id_asignatura = p_subject_id) THEN
        RAISE EXCEPTION 'The selected subject does not exist.' USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.horarios WHERE id_asignatura = p_subject_id
    ) AND (
        EXISTS (
            SELECT 1 FROM public.asignatura_recurso AS current_link
            WHERE current_link.id_asignatura = p_subject_id
              AND NOT (current_link.id_recurso = ANY(requested_ids))
        ) OR EXISTS (
            SELECT 1 FROM pg_catalog.unnest(requested_ids) AS requested(id_recurso)
            WHERE NOT EXISTS (
                SELECT 1 FROM public.asignatura_recurso AS current_link
                WHERE current_link.id_asignatura = p_subject_id
                  AND current_link.id_recurso = requested.id_recurso
            )
        )
    ) THEN
        RAISE EXCEPTION 'Remove the subject from its schedule assignments before changing its required resources.' USING ERRCODE = '23514';
    END IF;
    DELETE FROM public.asignatura_recurso
    WHERE id_asignatura = p_subject_id AND NOT (id_recurso = ANY(requested_ids));
    INSERT INTO public.asignatura_recurso (id_asignatura, id_recurso)
    SELECT p_subject_id, requested.id_recurso
    FROM (SELECT DISTINCT pg_catalog.unnest(requested_ids) AS id_recurso) AS requested
    ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_subject_resources(INTEGER, INTEGER[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_subject_resources(INTEGER, INTEGER[]) TO authenticated;

-- Grid management is reserved for administration and planning. Coordination
-- can read the grids needed to manage its own groups.
DROP POLICY IF EXISTS bloques_clase_admin_all ON public.bloques_clase;
DROP POLICY IF EXISTS bloques_clase_teacher_read ON public.bloques_clase;
CREATE POLICY bloques_grid_read ON public.bloques_clase
    FOR SELECT TO authenticated
    USING (
        public.is_active_admin()
        OR public.is_active_planner()
        OR public.is_active_coordinator()
        OR EXISTS (
            SELECT 1 FROM public.horarios AS horario
            WHERE horario.id_bloque = bloques_clase.id_bloque
              AND horario.id_docente = public.current_app_user_id()
              AND horario.estado_publicacion = 'publicado'
        )
    );
CREATE POLICY bloques_grid_insert ON public.bloques_clase
    FOR INSERT TO authenticated WITH CHECK (public.is_active_admin() OR public.is_active_planner());
CREATE POLICY bloques_grid_update ON public.bloques_clase
    FOR UPDATE TO authenticated
    USING (public.is_active_admin() OR public.is_active_planner())
    WITH CHECK (public.is_active_admin() OR public.is_active_planner());
CREATE POLICY bloques_grid_delete ON public.bloques_clase
    FOR DELETE TO authenticated USING (public.is_active_admin() OR public.is_active_planner());

DROP POLICY IF EXISTS dias_habilitados_periodo_read ON public.dias_habilitados_periodo;
CREATE POLICY dias_habilitados_grid_read ON public.dias_habilitados_periodo
    FOR SELECT TO authenticated USING (public.is_active_admin() OR public.is_active_planner() OR public.is_active_coordinator());

CREATE OR REPLACE FUNCTION public.set_period_enabled_days(
    p_period_id INTEGER,
    p_days public.dias_semana[],
    p_modality TEXT,
    p_shift TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    requested_days public.dias_semana[] := COALESCE(p_days, ARRAY[]::public.dias_semana[]);
BEGIN
    IF NOT public.is_active_admin() AND NOT public.is_active_planner() THEN
        RAISE EXCEPTION 'Only administration or planning can configure academic grids.' USING ERRCODE = '42501';
    END IF;
    IF p_modality NOT IN ('regular', 'encuentro', 'salud') OR p_shift NOT IN ('matutino', 'vespertino', 'nocturno') THEN
        RAISE EXCEPTION 'The modality or shift is invalid.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.periodos WHERE id_periodo = p_period_id) THEN
        RAISE EXCEPTION 'The selected period does not exist.' USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.bloques_clase AS bloque
        WHERE bloque.id_periodo = p_period_id
          AND bloque.modalidad = p_modality
          AND bloque.turno = p_shift
          AND NOT (bloque.dia = ANY(requested_days))
    ) THEN
        RAISE EXCEPTION 'Remove the blocks and breaks for a day before disabling that day.' USING ERRCODE = '23514';
    END IF;
    DELETE FROM public.dias_habilitados_periodo
    WHERE id_periodo = p_period_id AND modalidad = p_modality AND turno = p_shift
      AND NOT (dia = ANY(requested_days));
    INSERT INTO public.dias_habilitados_periodo (id_periodo, modalidad, turno, dia)
    SELECT p_period_id, p_modality, p_shift, requested.dia
    FROM (SELECT DISTINCT pg_catalog.unnest(requested_days) AS dia) AS requested
    ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_period_enabled_days(
    p_period_id INTEGER,
    p_days public.dias_semana[]
)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.set_period_enabled_days(p_period_id, p_days, 'regular', 'matutino')
$$;

REVOKE ALL ON FUNCTION public.set_period_enabled_days(INTEGER, public.dias_semana[], TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_period_enabled_days(INTEGER, public.dias_semana[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_period_enabled_days(INTEGER, public.dias_semana[], TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_period_enabled_days(INTEGER, public.dias_semana[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.require_enabled_day_for_class_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    duration_seconds INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.dias_habilitados_periodo AS enabled_day
        WHERE enabled_day.id_periodo = NEW.id_periodo
          AND enabled_day.modalidad = NEW.modalidad
          AND enabled_day.turno = NEW.turno
          AND enabled_day.dia = NEW.dia
    ) THEN
        RAISE EXCEPTION 'Enable this weekday for the selected academic grid before adding a block or break.' USING ERRCODE = '23514';
    END IF;
    IF NEW.turno = 'nocturno' AND NEW.es_receso THEN
        RAISE EXCEPTION 'Night grids do not use breaks.' USING ERRCODE = '23514';
    END IF;
    IF NEW.dia = 'Viernes' AND NEW.modalidad <> 'encuentro' THEN
        RAISE EXCEPTION 'Friday belongs to encounter grids.' USING ERRCODE = '23514';
    END IF;
    IF NEW.modalidad = 'encuentro' AND NEW.dia <> 'Viernes' THEN
        RAISE EXCEPTION 'Encounter grids are configured on Friday.' USING ERRCODE = '23514';
    END IF;
    duration_seconds := EXTRACT(EPOCH FROM (NEW.hora_fin - NEW.hora_inicio))::INTEGER;
    IF NOT NEW.es_receso AND NEW.modalidad = 'encuentro' AND duration_seconds <> 3600 THEN
        RAISE EXCEPTION 'Encounter class blocks must be 60 minutes.' USING ERRCODE = '23514';
    END IF;
    IF NOT NEW.es_receso AND NEW.modalidad = 'regular'
       AND NEW.turno IN ('matutino', 'vespertino')
       AND duration_seconds NOT IN (2700, 5400) THEN
        RAISE EXCEPTION 'Regular morning and evening class blocks must use exact 45-minute units or 90-minute sessions.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bloques_clase_require_enabled_day ON public.bloques_clase;
CREATE TRIGGER bloques_clase_require_enabled_day
    BEFORE INSERT OR UPDATE OF id_periodo, dia, modalidad, turno, hora_inicio, hora_fin, es_receso
    ON public.bloques_clase
    FOR EACH ROW EXECUTE FUNCTION public.require_enabled_day_for_class_block();

CREATE OR REPLACE FUNCTION public.prevent_overlapping_class_blocks()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acaplan_schedule_conflicts'));
    IF TG_OP = 'UPDATE'
       AND EXISTS (SELECT 1 FROM public.horarios WHERE id_bloque = OLD.id_bloque)
       AND pg_catalog.current_setting('acaplan.allow_grid_revalidation', TRUE) IS DISTINCT FROM 'on'
       AND (NEW.id_periodo IS DISTINCT FROM OLD.id_periodo
            OR NEW.dia IS DISTINCT FROM OLD.dia
            OR NEW.modalidad IS DISTINCT FROM OLD.modalidad
            OR NEW.turno IS DISTINCT FROM OLD.turno
            OR NEW.hora_inicio IS DISTINCT FROM OLD.hora_inicio
            OR NEW.hora_fin IS DISTINCT FROM OLD.hora_fin
            OR NEW.es_receso IS DISTINCT FROM OLD.es_receso) THEN
        RAISE EXCEPTION 'A class block assigned to a schedule cannot be changed.' USING ERRCODE = '23514';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
        NEW.id_periodo,
        pg_catalog.hashtext(NEW.modalidad || ':' || NEW.turno || ':' || NEW.dia::TEXT)
    );
    IF EXISTS (
        SELECT 1 FROM public.bloques_clase AS existing
        WHERE existing.id_periodo = NEW.id_periodo
          AND existing.modalidad = NEW.modalidad
          AND existing.turno = NEW.turno
          AND existing.dia = NEW.dia
          AND existing.id_bloque IS DISTINCT FROM NEW.id_bloque
          AND NEW.hora_inicio < existing.hora_fin
          AND NEW.hora_fin > existing.hora_inicio
    ) THEN
        RAISE EXCEPTION 'The class block overlaps another block in this grid and day.' USING ERRCODE = '23P01';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bloques_clase_prevent_overlap ON public.bloques_clase;
CREATE TRIGGER bloques_clase_prevent_overlap
    BEFORE INSERT OR UPDATE OF id_periodo, dia, modalidad, turno, hora_inicio, hora_fin, es_receso
    ON public.bloques_clase
    FOR EACH ROW EXECUTE FUNCTION public.prevent_overlapping_class_blocks();

CREATE OR REPLACE FUNCTION public.preview_class_block_revalidation(p_block_id INTEGER)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    affected_classes TEXT[];
BEGIN
    IF NOT public.is_active_admin() AND NOT public.is_active_planner() THEN
        RAISE EXCEPTION 'Only administration or planning can inspect grid changes.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bloques_clase WHERE id_bloque = p_block_id) THEN
        RAISE EXCEPTION 'The selected block does not exist.' USING ERRCODE = '23503';
    END IF;
    SELECT COALESCE(pg_catalog.array_agg(DISTINCT pg_catalog.format('%s · %s', seccion.codigo, asignatura.nombre)), ARRAY[]::TEXT[])
    INTO affected_classes
    FROM public.horarios AS horario
    JOIN public.secciones AS seccion ON seccion.id_seccion = horario.id_seccion
    JOIN public.asignaturas AS asignatura ON asignatura.id_asignatura = horario.id_asignatura
    WHERE horario.id_bloque = p_block_id;
    RETURN affected_classes;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_class_block_time(
    p_block_id INTEGER,
    p_start_time TIME,
    p_end_time TIME
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    IF NOT public.is_active_admin() AND NOT public.is_active_planner() THEN
        RAISE EXCEPTION 'Only administration or planning can change an academic grid.' USING ERRCODE = '42501';
    END IF;
    IF p_start_time IS NULL OR p_end_time IS NULL OR p_start_time >= p_end_time THEN
        RAISE EXCEPTION 'The start time must be earlier than the end time.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bloques_clase WHERE id_bloque = p_block_id) THEN
        RAISE EXCEPTION 'The selected block does not exist.' USING ERRCODE = '23503';
    END IF;

    UPDATE public.horarios
    SET estado_publicacion = 'borrador', fecha_actualizacion = pg_catalog.now()
    WHERE id_bloque = p_block_id;
    GET DIAGNOSTICS affected_count = ROW_COUNT;

    PERFORM pg_catalog.set_config('acaplan.allow_grid_revalidation', 'on', TRUE);
    UPDATE public.bloques_clase
    SET hora_inicio = p_start_time, hora_fin = p_end_time
    WHERE id_bloque = p_block_id;

    -- The existing database trigger rechecks room, teacher, group, and interval
    -- conflicts against the changed block. Any conflict rolls back the change.
    UPDATE public.horarios
    SET id_docente = id_docente, fecha_actualizacion = pg_catalog.now()
    WHERE id_bloque = p_block_id;
    RETURN affected_count;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_class_block_revalidation(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_class_block_time(INTEGER, TIME, TIME) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_class_block_revalidation(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_class_block_time(INTEGER, TIME, TIME) TO authenticated;
REVOKE UPDATE ON TABLE public.bloques_clase FROM authenticated;

COMMIT;
