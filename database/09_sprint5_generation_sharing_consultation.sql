-- Sprint 5 / H21, H18, H20.
-- Server-side draft generation, reviewed sharing, approval decisions, and
-- read-only access to shared and official schedules.

BEGIN;

ALTER TABLE public.auditoria_cambios_horario
    DROP CONSTRAINT IF EXISTS auditoria_cambios_horario_accion_check;
ALTER TABLE public.auditoria_cambios_horario
    ADD CONSTRAINT auditoria_cambios_horario_accion_check CHECK (
        accion IN (
            'borrador_creado', 'clase_fijada', 'clase_desfijada',
            'movimiento_autorizado', 'sesion_eliminada', 'validacion',
            'generacion_automatica', 'compartir', 'decision', 'revision_requerida',
            'publicacion', 'exportacion'
        )
    );

-- A full shared version is visible to its selected active roles; official
-- versions are queryable by signed-in users. Neither path grants write access.
DROP POLICY IF EXISTS horarios_visible_users_read ON public.horarios;
CREATE POLICY horarios_visible_users_read ON public.horarios
    FOR SELECT TO authenticated USING (public.can_view_schedule_version(id_version_horario));

DROP POLICY IF EXISTS periodos_planning_read ON public.periodos;
CREATE POLICY periodos_schedule_consultation_read ON public.periodos
    FOR SELECT TO authenticated USING (
        public.is_active_admin() OR public.is_active_planner() OR public.is_active_coordinator()
        OR (public.is_active_app_user() AND es_activo = TRUE)
        OR EXISTS (
            SELECT 1 FROM public.versiones_horario AS version
            WHERE version.id_periodo = periodos.id_periodo
              AND public.can_view_schedule_version(version.id_version_horario)
        )
    );

DROP POLICY IF EXISTS carreras_catalog_read ON public.carreras;
CREATE POLICY carreras_catalog_read ON public.carreras
    FOR SELECT TO authenticated USING (
        public.is_active_admin()
        OR public.is_active_planner()
        OR (public.is_active_coordinator() AND public.can_manage_career(id_carrera))
        OR EXISTS (
            SELECT 1 FROM public.secciones AS seccion
            JOIN public.horarios AS horario ON horario.id_seccion = seccion.id_seccion
            WHERE seccion.id_carrera = carreras.id_carrera
              AND public.can_view_schedule_version(horario.id_version_horario)
        )
        OR EXISTS (SELECT 1 FROM public.usuarios WHERE auth_user_id = auth.uid() AND estado = 'activo' AND rol = 'docente')
    );

DROP POLICY IF EXISTS asignaturas_catalog_read ON public.asignaturas;
CREATE POLICY asignaturas_catalog_read ON public.asignaturas
    FOR SELECT TO authenticated USING (
        public.is_active_admin()
        OR public.is_active_planner()
        OR (public.is_active_coordinator() AND public.can_manage_career(id_carrera))
        OR EXISTS (
            SELECT 1 FROM public.horarios AS horario
            WHERE horario.id_asignatura = asignaturas.id_asignatura
              AND public.can_view_schedule_version(horario.id_version_horario)
        )
    );

DROP POLICY IF EXISTS secciones_group_read ON public.secciones;
CREATE POLICY secciones_group_read ON public.secciones
    FOR SELECT TO authenticated USING (
        public.is_active_admin()
        OR public.is_active_planner()
        OR (public.is_active_coordinator() AND public.can_manage_career(id_carrera))
        OR EXISTS (
            SELECT 1 FROM public.horarios AS horario
            WHERE horario.id_seccion = secciones.id_seccion
              AND public.can_view_schedule_version(horario.id_version_horario)
        )
    );

DROP POLICY IF EXISTS aulas_planner_read ON public.aulas;
CREATE POLICY aulas_visible_schedule_read ON public.aulas
    FOR SELECT TO authenticated USING (
        public.is_active_admin() OR public.is_active_planner()
        OR EXISTS (
            SELECT 1 FROM public.horarios AS horario
            WHERE horario.id_aula = aulas.id_aula
              AND public.can_view_schedule_version(horario.id_version_horario)
        )
    );

DROP POLICY IF EXISTS pabellones_planner_read ON public.pabellones;
CREATE POLICY pabellones_visible_schedule_read ON public.pabellones
    FOR SELECT TO authenticated USING (
        public.is_active_admin() OR public.is_active_planner()
        OR EXISTS (
            SELECT 1 FROM public.aulas AS aula
            JOIN public.horarios AS horario ON horario.id_aula = aula.id_aula
            WHERE aula.id_pabellon = pabellones.id_pabellon
              AND public.can_view_schedule_version(horario.id_version_horario)
        )
    );

CREATE OR REPLACE FUNCTION public.invalidate_period_schedule_versions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_period INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN target_period := OLD.id_periodo;
    ELSE target_period := NEW.id_periodo;
    END IF;
    WITH affected AS (
        UPDATE public.versiones_horario AS version
        SET estado_validacion = 'obsoleta',
            estado = CASE WHEN version.estado = 'aprobado'
                THEN CASE WHEN version.compartida_por IS NOT NULL THEN 'compartido' ELSE 'borrador' END
                ELSE version.estado END,
            fecha_actualizacion = pg_catalog.now()
        WHERE version.id_periodo = target_period
          AND version.estado IN ('borrador', 'compartido', 'aprobado')
        RETURNING version.id_version_horario
    )
    INSERT INTO public.auditoria_cambios_horario (id_version_horario, accion, detalle, realizada_por)
    SELECT affected.id_version_horario, 'revision_requerida',
           jsonb_build_object('motivo', 'Cambió una restricción o una versión de reglas del período.'),
           public.current_app_user_id()
    FROM affected;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_assignment_schedule_versions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_component INTEGER;
    target_assignment INTEGER;
    target_period INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'asignaciones_academicas' THEN
        IF TG_OP = 'DELETE' THEN target_period := OLD.id_periodo; ELSE target_period := NEW.id_periodo; END IF;
    ELSE
        IF TG_OP = 'DELETE' THEN target_component := OLD.id_componente; ELSE target_component := NEW.id_componente; END IF;
        IF TG_TABLE_NAME = 'asignacion_componentes' THEN
            IF TG_OP = 'DELETE' THEN target_assignment := OLD.id_asignacion_academica; ELSE target_assignment := NEW.id_asignacion_academica; END IF;
        ELSE
            SELECT id_asignacion_academica INTO target_assignment
            FROM public.asignacion_componentes WHERE id_componente = target_component;
        END IF;
        SELECT id_periodo INTO target_period
        FROM public.asignaciones_academicas WHERE id_asignacion_academica = target_assignment;
    END IF;
    IF target_period IS NOT NULL THEN
        WITH affected AS (
            UPDATE public.versiones_horario AS version
            SET estado_validacion = 'obsoleta',
                estado = CASE WHEN version.estado = 'aprobado'
                    THEN CASE WHEN version.compartida_por IS NOT NULL THEN 'compartido' ELSE 'borrador' END
                    ELSE version.estado END,
                fecha_actualizacion = pg_catalog.now()
            WHERE version.id_periodo = target_period
              AND version.estado IN ('borrador', 'compartido', 'aprobado')
            RETURNING version.id_version_horario
        )
        INSERT INTO public.auditoria_cambios_horario (id_version_horario, accion, detalle, realizada_por)
        SELECT affected.id_version_horario, 'revision_requerida',
               jsonb_build_object('motivo', 'Cambió una asignación académica oficial.'),
               public.current_app_user_id()
        FROM affected;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_schedule_draft(p_version_id INTEGER, p_max_attempts INTEGER DEFAULT 2000)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_period INTEGER;
    session_row RECORD;
    candidate RECORD;
    teacher_ids INTEGER[];
    lead_teacher INTEGER;
    attempts INTEGER := 0;
    placed_count INTEGER := 0;
    unresolved JSONB := '[]'::JSONB;
    validation_result JSONB;
BEGIN
    IF NOT public.is_active_admin() AND NOT public.is_active_planner() THEN
        RAISE EXCEPTION 'Only planning can generate schedule drafts.' USING ERRCODE = '42501';
    END IF;
    IF p_max_attempts < 1 OR p_max_attempts > 10000 THEN
        RAISE EXCEPTION 'The attempt limit must be between 1 and 10000.' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acaplan_version_' || p_version_id::TEXT));
    SELECT id_periodo INTO target_period FROM public.versiones_horario
    WHERE id_version_horario = p_version_id AND estado = 'borrador' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only an active draft can be generated.' USING ERRCODE = '23514'; END IF;

    -- Fixed and already placed sessions remain in place. The generator fills
    -- only missing official sessions and uses database checks for final safety.
    FOR session_row IN
        SELECT componente.id_componente, componente.sesiones_semana, componente.duracion_minutos,
               asignacion.id_seccion, asignacion.id_asignatura, seccion.id_carrera,
               seccion.codigo AS group_code, seccion.cantidad_estudiantes, seccion.modalidad,
               seccion.turno, seccion.sede, asignatura.nombre AS subject_name,
               session_number.value AS session_number
        FROM public.asignacion_componentes AS componente
        JOIN public.asignaciones_academicas AS asignacion USING (id_asignacion_academica)
        JOIN public.secciones AS seccion ON seccion.id_seccion = asignacion.id_seccion
        JOIN public.asignaturas AS asignatura ON asignatura.id_asignatura = asignacion.id_asignatura
        CROSS JOIN LATERAL pg_catalog.generate_series(1, componente.sesiones_semana) AS session_number(value)
        WHERE asignacion.id_periodo = target_period
          AND NOT EXISTS (
              SELECT 1 FROM public.horarios AS horario
              WHERE horario.id_version_horario = p_version_id
                AND horario.id_componente = componente.id_componente
                AND horario.numero_sesion = session_number.value
          )
        ORDER BY seccion.id_carrera, seccion.id_seccion, asignacion.id_asignatura,
                 componente.id_componente, session_number.value
    LOOP
        IF attempts >= p_max_attempts THEN
            unresolved := unresolved || jsonb_build_array(jsonb_build_object(
                'group', session_row.group_code, 'subject', session_row.subject_name,
                'session', session_row.session_number, 'reason', 'Se alcanzó el límite de búsqueda configurado.'
            ));
            CONTINUE;
        END IF;

        SELECT COALESCE(pg_catalog.array_agg(asignado.id_docente ORDER BY asignado.id_docente), ARRAY[]::INTEGER[])
        INTO teacher_ids FROM public.asignacion_componente_docente AS asignado
        WHERE asignado.id_componente = session_row.id_componente;
        IF pg_catalog.cardinality(teacher_ids) = 0 THEN
            unresolved := unresolved || jsonb_build_array(jsonb_build_object(
                'group', session_row.group_code, 'subject', session_row.subject_name,
                'session', session_row.session_number, 'reason', 'La asignación oficial no tiene docente.'
            ));
            CONTINUE;
        END IF;
        lead_teacher := teacher_ids[1];

        FOR candidate IN
            SELECT block.id_bloque, room.id_aula
            FROM public.bloques_clase AS block
            CROSS JOIN public.aulas AS room
            JOIN public.pabellones AS pavilion ON pavilion.id_pabellon = room.id_pabellon
            WHERE block.id_periodo = target_period
              AND block.modalidad = session_row.modalidad
              AND block.turno = session_row.turno
              AND NOT block.es_receso
              AND EXTRACT(EPOCH FROM (block.hora_fin - block.hora_inicio)) / 60 = session_row.duracion_minutos
              AND room.estado = 'activo'
              AND room.capacidad >= session_row.cantidad_estudiantes
              AND NULLIF(btrim(session_row.sede), '') IS NOT NULL
              AND lower(btrim(pavilion.sede)) = lower(btrim(session_row.sede))
              AND NOT EXISTS (
                  SELECT 1 FROM public.asignacion_componente_recurso AS needed
                  WHERE needed.id_componente = session_row.id_componente
                    AND NOT EXISTS (SELECT 1 FROM public.aula_recurso AS available
                        WHERE available.id_aula = room.id_aula AND available.id_recurso = needed.id_recurso)
              )
              AND NOT EXISTS (
                  SELECT 1 FROM public.asignatura_recurso AS needed
                  WHERE needed.id_asignatura = session_row.id_asignatura
                    AND NOT EXISTS (SELECT 1 FROM public.aula_recurso AS available
                        WHERE available.id_aula = room.id_aula AND available.id_recurso = needed.id_recurso)
              )
              AND NOT EXISTS (
                  SELECT 1 FROM public.asignacion_componentes AS component
                  WHERE component.id_componente = session_row.id_componente
                    AND component.requiere_espacio_especializado
                    AND (NULLIF(btrim(room.tipo), '') IS NULL
                      OR (lower(room.tipo) NOT LIKE '%' || lower(btrim(component.observacion_espacio)) || '%'
                          AND lower(btrim(component.observacion_espacio)) NOT LIKE '%' || lower(btrim(room.tipo)) || '%'))
              )
            ORDER BY
              (SELECT COUNT(*) FROM public.horarios AS existing
               WHERE existing.id_version_horario = p_version_id
                 AND existing.id_seccion = session_row.id_seccion
                 AND existing.dia_snapshot = block.dia),
              (SELECT COUNT(*) FROM public.restricciones_planificacion AS preference
               WHERE preference.id_periodo = target_period AND preference.id_carrera = session_row.id_carrera
                 AND preference.condicion = 'preferencia'
                 AND CASE preference.tipo_afectado
                     WHEN 'docente' THEN preference.id_afectado = ANY(teacher_ids)
                     WHEN 'asignatura' THEN preference.id_afectado = session_row.id_asignatura
                     WHEN 'grupo' THEN preference.id_afectado = session_row.id_seccion
                     WHEN 'sede' THEN session_row.sede = COALESCE(preference.parametros->>'sede', '')
                     WHEN 'carrera' THEN TRUE ELSE FALSE END
                 AND ((preference.dia IS NOT NULL AND preference.dia <> block.dia)
                   OR (preference.hora_inicio IS NOT NULL AND NOT (preference.hora_inicio <= block.hora_inicio AND preference.hora_fin >= block.hora_fin)))),
              block.dia, block.hora_inicio, room.codigo
        LOOP
            attempts := attempts + 1;
            BEGIN
                PERFORM public.save_schedule_session(
                    p_version_id, session_row.id_componente, session_row.session_number,
                    candidate.id_bloque, candidate.id_aula, FALSE, FALSE, NULL
                );
                placed_count := placed_count + 1;
                EXIT;
            EXCEPTION WHEN exclusion_violation OR check_violation OR foreign_key_violation OR unique_violation THEN
                -- Try the next room/block. The complete rule validator reports
                -- any remaining distribution or simultaneous-group issues.
                NULL;
            END;
            IF attempts >= p_max_attempts THEN EXIT; END IF;
        END LOOP;
        IF NOT EXISTS (
            SELECT 1 FROM public.horarios AS horario
            WHERE horario.id_version_horario = p_version_id
              AND horario.id_componente = session_row.id_componente
              AND horario.numero_sesion = session_row.session_number
        ) THEN
            unresolved := unresolved || jsonb_build_array(jsonb_build_object(
                'group', session_row.group_code, 'subject', session_row.subject_name,
                'session', session_row.session_number,
                'reason', 'No se encontró una combinación libre de bloque, espacio, docente y restricciones.'
            ));
        END IF;
    END LOOP;

    validation_result := public.validate_schedule_version(p_version_id);
    INSERT INTO public.auditoria_cambios_horario (id_version_horario, accion, detalle, realizada_por)
    VALUES (p_version_id, 'generacion_automatica', jsonb_build_object(
        'colocadas', placed_count, 'intentos', attempts, 'pendientes', unresolved
    ), public.current_app_user_id());
    RETURN jsonb_build_object(
        'id_version_horario', p_version_id, 'colocadas', placed_count,
        'intentos', attempts, 'pendientes', unresolved, 'validacion', validation_result
    );
END;
$$;
REVOKE ALL ON FUNCTION public.generate_schedule_draft(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_schedule_draft(INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.share_schedule_version(p_version_id INTEGER, p_roles public.user_rol[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    version_row public.versiones_horario%ROWTYPE;
    latest_rules INTEGER;
BEGIN
    IF NOT public.is_active_admin() AND NOT public.is_active_planner() THEN
        RAISE EXCEPTION 'Only planning can share schedule proposals.' USING ERRCODE = '42501';
    END IF;
    IF p_roles IS NULL OR pg_catalog.cardinality(p_roles) = 0
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_roles) AS selected(role)
                  WHERE selected.role NOT IN ('coordinacion', 'jefatura', 'docente'))
       OR (SELECT COUNT(*) FROM pg_catalog.unnest(p_roles)) <> (SELECT COUNT(DISTINCT role) FROM pg_catalog.unnest(p_roles) AS selected(role)) THEN
        RAISE EXCEPTION 'Choose one or more valid review roles without duplicates.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO version_row FROM public.versiones_horario
    WHERE id_version_horario = p_version_id AND estado = 'borrador' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only an active draft can be shared.' USING ERRCODE = '23514'; END IF;
    SELECT id_version_reglas INTO latest_rules FROM public.versiones_reglas_planificacion
    WHERE id_periodo = version_row.id_periodo ORDER BY numero_version DESC LIMIT 1;
    IF version_row.estado_validacion NOT IN ('valida', 'con_avisos')
       OR version_row.reglas_version_id IS DISTINCT FROM latest_rules THEN
        RAISE EXCEPTION 'Validate the current proposal against the latest rules before sharing.' USING ERRCODE = '23514';
    END IF;
    UPDATE public.versiones_horario
    SET estado = 'compartido', roles_compartidos = p_roles,
        compartida_por = public.current_app_user_id(), fecha_compartida = pg_catalog.now(),
        fecha_actualizacion = pg_catalog.now()
    WHERE id_version_horario = p_version_id;
    INSERT INTO public.auditoria_cambios_horario (id_version_horario, accion, detalle, realizada_por)
    VALUES (p_version_id, 'compartir', jsonb_build_object('roles', p_roles), public.current_app_user_id());
END;
$$;
REVOKE ALL ON FUNCTION public.share_schedule_version(INTEGER, public.user_rol[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_schedule_version(INTEGER, public.user_rol[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_schedule_version(p_version_id INTEGER, p_approved BOOLEAN, p_note TEXT DEFAULT '')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    version_row public.versiones_horario%ROWTYPE;
    latest_rules INTEGER;
BEGIN
    IF NOT public.is_active_admin() AND NOT public.is_active_planner() AND NOT public.is_active_coordinator() THEN
        RAISE EXCEPTION 'Only an authorized reviewer can decide on a shared proposal.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.can_view_schedule_version(p_version_id) THEN
        RAISE EXCEPTION 'Your role is not included in the review scope for this proposal.' USING ERRCODE = '42501';
    END IF;
    IF length(COALESCE(p_note, '')) > 500 THEN RAISE EXCEPTION 'The review note is too long.' USING ERRCODE = '22023'; END IF;
    SELECT * INTO version_row FROM public.versiones_horario
    WHERE id_version_horario = p_version_id AND estado = 'compartido' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only a shared proposal can be reviewed.' USING ERRCODE = '23514'; END IF;
    IF public.is_active_coordinator() AND EXISTS (
        SELECT 1 FROM public.horarios AS horario
        JOIN public.secciones AS seccion ON seccion.id_seccion = horario.id_seccion
        WHERE horario.id_version_horario = p_version_id
          AND NOT public.can_manage_career(seccion.id_carrera)
    ) THEN
        RAISE EXCEPTION 'This proposal includes careers outside your review scope.' USING ERRCODE = '42501';
    END IF;
    SELECT id_version_reglas INTO latest_rules FROM public.versiones_reglas_planificacion
    WHERE id_periodo = version_row.id_periodo ORDER BY numero_version DESC LIMIT 1;
    IF p_approved AND (version_row.estado_validacion NOT IN ('valida', 'con_avisos')
       OR version_row.reglas_version_id IS DISTINCT FROM latest_rules) THEN
        RAISE EXCEPTION 'The proposal needs current validation before a decision.' USING ERRCODE = '23514';
    END IF;
    UPDATE public.versiones_horario
    SET estado = CASE WHEN p_approved THEN 'aprobado' ELSE 'borrador' END,
        roles_compartidos = CASE WHEN p_approved THEN roles_compartidos ELSE ARRAY[]::public.user_rol[] END,
        aprobada_por = CASE WHEN p_approved THEN public.current_app_user_id() ELSE NULL END,
        fecha_aprobada = CASE WHEN p_approved THEN pg_catalog.now() ELSE NULL END,
        compartida_por = CASE WHEN p_approved THEN compartida_por ELSE NULL END,
        fecha_compartida = CASE WHEN p_approved THEN fecha_compartida ELSE NULL END,
        fecha_actualizacion = pg_catalog.now()
    WHERE id_version_horario = p_version_id;
    INSERT INTO public.auditoria_cambios_horario (id_version_horario, accion, detalle, realizada_por)
    VALUES (p_version_id, 'decision', jsonb_build_object(
        'decision', CASE WHEN p_approved THEN 'aprobada' ELSE 'devuelta' END,
        'nota', COALESCE(NULLIF(btrim(p_note), ''), '')), public.current_app_user_id());
END;
$$;
REVOKE ALL ON FUNCTION public.decide_schedule_version(INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_schedule_version(INTEGER, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_schedule_version_teachers(p_version_id INTEGER)
RETURNS TABLE(id_docente INTEGER, nombre TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.can_view_schedule_version(p_version_id) THEN
        RAISE EXCEPTION 'You cannot view this schedule version.' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT DISTINCT participant.id_docente, usuario.nombre::TEXT
    FROM public.horarios AS horario
    JOIN public.horario_docente AS participant ON participant.id_horario = horario.id_horario
    JOIN public.usuarios AS usuario ON usuario.id_usuario = participant.id_docente
    WHERE horario.id_version_horario = p_version_id AND usuario.estado = 'activo'
    ORDER BY usuario.nombre;
END;
$$;
REVOKE ALL ON FUNCTION public.list_schedule_version_teachers(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_schedule_version_teachers(INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_schedule_version_teacher_links(p_version_id INTEGER)
RETURNS TABLE(id_horario INTEGER, id_docente INTEGER, nombre TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.can_view_schedule_version(p_version_id) THEN
        RAISE EXCEPTION 'You cannot view this schedule version.' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT participant.id_horario, participant.id_docente, usuario.nombre::TEXT
    FROM public.horarios AS horario
    JOIN public.horario_docente AS participant ON participant.id_horario = horario.id_horario
    JOIN public.usuarios AS usuario ON usuario.id_usuario = participant.id_docente
    WHERE horario.id_version_horario = p_version_id AND usuario.estado = 'activo'
    ORDER BY participant.id_horario, usuario.nombre;
END;
$$;
REVOKE ALL ON FUNCTION public.list_schedule_version_teacher_links(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_schedule_version_teacher_links(INTEGER) TO authenticated;

COMMIT;
