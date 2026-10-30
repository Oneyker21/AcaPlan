-- Complete Sprint 2 catalog and class-block rules.
-- Run after 20260930000000_security_and_constraints.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.asignatura_recurso (
    id_asignatura INTEGER NOT NULL REFERENCES public.asignaturas(id_asignatura) ON DELETE RESTRICT,
    id_recurso INTEGER NOT NULL REFERENCES public.recursos(id_recurso) ON DELETE RESTRICT,
    PRIMARY KEY (id_asignatura, id_recurso)
);

CREATE TABLE IF NOT EXISTS public.dias_habilitados_periodo (
    id_periodo INTEGER NOT NULL REFERENCES public.periodos(id_periodo) ON DELETE CASCADE,
    dia public.dias_semana NOT NULL,
    PRIMARY KEY (id_periodo, dia)
);

-- Keep existing periods usable: days that already contain blocks remain enabled.
INSERT INTO public.dias_habilitados_periodo (id_periodo, dia)
SELECT DISTINCT id_periodo, dia
FROM public.bloques_clase
ON CONFLICT DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.asignaturas
        GROUP BY lower(btrim(codigo))
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate subject codes differ only by case or surrounding spaces. Resolve them before applying this migration.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.aulas
        GROUP BY id_pabellon, lower(btrim(codigo))
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate room codes exist within a pavilion. Resolve them before applying this migration.';
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS asignaturas_codigo_normalizado_uidx
    ON public.asignaturas (lower(btrim(codigo)));
CREATE UNIQUE INDEX IF NOT EXISTS aulas_pabellon_codigo_normalizado_uidx
    ON public.aulas (id_pabellon, lower(btrim(codigo)));

ALTER TABLE public.asignatura_recurso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dias_habilitados_periodo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.asignatura_recurso, public.dias_habilitados_periodo FROM anon, authenticated;
GRANT SELECT ON TABLE public.asignatura_recurso, public.dias_habilitados_periodo TO authenticated;

DROP POLICY IF EXISTS asignatura_recurso_admin_read ON public.asignatura_recurso;
CREATE POLICY asignatura_recurso_admin_read ON public.asignatura_recurso
    FOR SELECT TO authenticated USING (public.is_active_admin());
DROP POLICY IF EXISTS asignatura_recurso_teacher_read ON public.asignatura_recurso;
CREATE POLICY asignatura_recurso_teacher_read ON public.asignatura_recurso
    FOR SELECT TO authenticated USING (EXISTS (
        SELECT 1 FROM public.horarios AS horario
        WHERE horario.id_asignatura = asignatura_recurso.id_asignatura
          AND horario.id_docente = public.current_app_user_id()
          AND horario.estado_publicacion = 'publicado'
    ));

DROP POLICY IF EXISTS dias_habilitados_periodo_read ON public.dias_habilitados_periodo;
CREATE POLICY dias_habilitados_periodo_read ON public.dias_habilitados_periodo
    FOR SELECT TO authenticated USING (public.is_active_app_user());

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
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can change subject resources.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.asignaturas WHERE id_asignatura = p_subject_id) THEN
        RAISE EXCEPTION 'The selected subject does not exist.' USING ERRCODE = '23503';
    END IF;

    IF EXISTS (SELECT 1 FROM public.horarios WHERE id_asignatura = p_subject_id)
       AND (
           EXISTS (
               SELECT 1 FROM public.asignatura_recurso AS current_link
               WHERE current_link.id_asignatura = p_subject_id
                 AND NOT (current_link.id_recurso = ANY(requested_ids))
           )
           OR EXISTS (
               SELECT 1 FROM unnest(requested_ids) AS requested(id_recurso)
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
    WHERE id_asignatura = p_subject_id
      AND NOT (id_recurso = ANY(requested_ids));
    INSERT INTO public.asignatura_recurso (id_asignatura, id_recurso)
    SELECT p_subject_id, requested.id_recurso
    FROM (SELECT DISTINCT unnest(requested_ids) AS id_recurso) AS requested
    ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_room_resources(
    p_room_id INTEGER,
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
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can change room resources.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.aulas WHERE id_aula = p_room_id) THEN
        RAISE EXCEPTION 'The selected room does not exist.' USING ERRCODE = '23503';
    END IF;

    IF EXISTS (SELECT 1 FROM public.horarios WHERE id_aula = p_room_id)
       AND (
           EXISTS (
               SELECT 1 FROM public.aula_recurso AS current_link
               WHERE current_link.id_aula = p_room_id
                 AND NOT (current_link.id_recurso = ANY(requested_ids))
           )
           OR EXISTS (
               SELECT 1 FROM unnest(requested_ids) AS requested(id_recurso)
               WHERE NOT EXISTS (
                   SELECT 1 FROM public.aula_recurso AS current_link
                   WHERE current_link.id_aula = p_room_id
                     AND current_link.id_recurso = requested.id_recurso
               )
           )
       ) THEN
        RAISE EXCEPTION 'Remove the room from its schedule assignments before changing its resources.' USING ERRCODE = '23514';
    END IF;

    DELETE FROM public.aula_recurso
    WHERE id_aula = p_room_id
      AND NOT (id_recurso = ANY(requested_ids));
    INSERT INTO public.aula_recurso (id_aula, id_recurso)
    SELECT p_room_id, requested.id_recurso
    FROM (SELECT DISTINCT unnest(requested_ids) AS id_recurso) AS requested
    ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_period_enabled_days(
    p_period_id INTEGER,
    p_days public.dias_semana[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    requested_days public.dias_semana[] := COALESCE(p_days, ARRAY[]::public.dias_semana[]);
BEGIN
    IF NOT public.is_active_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can configure period days.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.periodos WHERE id_periodo = p_period_id) THEN
        RAISE EXCEPTION 'The selected period does not exist.' USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.bloques_clase AS bloque
        WHERE bloque.id_periodo = p_period_id
          AND NOT (bloque.dia = ANY(requested_days))
    ) THEN
        RAISE EXCEPTION 'Delete the blocks and breaks for a day before disabling that day.' USING ERRCODE = '23514';
    END IF;

    DELETE FROM public.dias_habilitados_periodo
    WHERE id_periodo = p_period_id
      AND NOT (dia = ANY(requested_days));
    INSERT INTO public.dias_habilitados_periodo (id_periodo, dia)
    SELECT p_period_id, requested.dia
    FROM (SELECT DISTINCT unnest(requested_days) AS dia) AS requested
    ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_subject_resources(INTEGER, INTEGER[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_room_resources(INTEGER, INTEGER[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_period_enabled_days(INTEGER, public.dias_semana[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_subject_resources(INTEGER, INTEGER[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_room_resources(INTEGER, INTEGER[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_period_enabled_days(INTEGER, public.dias_semana[]) TO authenticated;

-- Client writes to resource links and enabled weekdays must go through the
-- atomic, admin-checked functions above.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.aula_recurso, public.asignatura_recurso, public.dias_habilitados_periodo FROM authenticated;

CREATE OR REPLACE FUNCTION public.require_enabled_day_for_class_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.dias_habilitados_periodo AS enabled_day
        WHERE enabled_day.id_periodo = NEW.id_periodo
          AND enabled_day.dia = NEW.dia
    ) THEN
        RAISE EXCEPTION 'Enable this weekday for the academic period before adding a class block or break.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bloques_clase_require_enabled_day ON public.bloques_clase;
CREATE TRIGGER bloques_clase_require_enabled_day
    BEFORE INSERT OR UPDATE OF id_periodo, dia ON public.bloques_clase
    FOR EACH ROW EXECUTE FUNCTION public.require_enabled_day_for_class_block();

CREATE OR REPLACE FUNCTION public.prevent_deleting_used_class_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.horarios WHERE id_bloque = OLD.id_bloque) THEN
        RAISE EXCEPTION 'Remove schedule assignments using this block before deleting it.' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS bloques_clase_prevent_delete_used ON public.bloques_clase;
CREATE TRIGGER bloques_clase_prevent_delete_used
    BEFORE DELETE ON public.bloques_clase
    FOR EACH ROW EXECUTE FUNCTION public.prevent_deleting_used_class_block();

CREATE OR REPLACE FUNCTION public.protect_room_schedule_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.estado = 'activo' AND NEW.estado = 'inactivo'
       AND EXISTS (SELECT 1 FROM public.horarios WHERE id_aula = OLD.id_aula) THEN
        RAISE EXCEPTION 'Remove schedule assignments using this room before deactivating it.' USING ERRCODE = '23514';
    END IF;
    IF NEW.capacidad < OLD.capacidad AND EXISTS (
        SELECT 1
        FROM public.horarios AS horario
        JOIN public.secciones AS seccion ON seccion.id_seccion = horario.id_seccion
        WHERE horario.id_aula = OLD.id_aula
          AND seccion.cantidad_estudiantes > NEW.capacidad
    ) THEN
        RAISE EXCEPTION 'The new room capacity is below the enrollment of an assigned section.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aulas_protect_schedule_state ON public.aulas;
CREATE TRIGGER aulas_protect_schedule_state
    BEFORE UPDATE OF estado, capacidad ON public.aulas
    FOR EACH ROW EXECUTE FUNCTION public.protect_room_schedule_state();

CREATE OR REPLACE FUNCTION public.validate_assignment_room_requirements()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    section_size INTEGER;
    room_capacity INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.asignaturas
        WHERE id_asignatura = NEW.id_asignatura AND estado = 'activo'
    ) THEN
        RAISE EXCEPTION 'The selected subject is inactive and cannot be assigned to a new class.' USING ERRCODE = '23514';
    END IF;

    SELECT seccion.cantidad_estudiantes, aula.capacidad
    INTO section_size, room_capacity
    FROM public.secciones AS seccion
    CROSS JOIN public.aulas AS aula
    WHERE seccion.id_seccion = NEW.id_seccion
      AND aula.id_aula = NEW.id_aula;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The selected section or room does not exist.' USING ERRCODE = '23503';
    END IF;
    IF room_capacity < section_size THEN
        RAISE EXCEPTION 'Room capacity is below the number of students in the section.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.asignatura_recurso AS required_resource
        WHERE required_resource.id_asignatura = NEW.id_asignatura
          AND NOT EXISTS (
              SELECT 1 FROM public.aula_recurso AS room_resource
              WHERE room_resource.id_aula = NEW.id_aula
                AND room_resource.id_recurso = required_resource.id_recurso
          )
    ) THEN
        RAISE EXCEPTION 'The selected room is missing one or more resources required by the subject.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS horarios_validate_room_requirements ON public.horarios;
CREATE TRIGGER horarios_validate_room_requirements
    BEFORE INSERT OR UPDATE OF id_asignatura, id_seccion, id_aula ON public.horarios
    FOR EACH ROW EXECUTE FUNCTION public.validate_assignment_room_requirements();

COMMIT;
