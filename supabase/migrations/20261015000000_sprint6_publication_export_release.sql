-- Sprint 6 / H19, H23, H24.
-- Atomic period publication, audited PDF exports, and EAS release preparation.

BEGIN;

ALTER TABLE public.periodos
    ADD COLUMN IF NOT EXISTS id_version_publicada INTEGER
        REFERENCES public.versiones_horario(id_version_horario) ON DELETE RESTRICT;

UPDATE public.periodos AS periodo
SET id_version_publicada = (
    SELECT version.id_version_horario
    FROM public.versiones_horario AS version
    WHERE version.id_periodo = periodo.id_periodo AND version.estado = 'publicado'
    ORDER BY version.numero_version DESC LIMIT 1
)
WHERE periodo.id_version_publicada IS NULL
  AND EXISTS (
      SELECT 1 FROM public.versiones_horario AS version
      WHERE version.id_periodo = periodo.id_periodo AND version.estado = 'publicado'
  );

CREATE UNIQUE INDEX IF NOT EXISTS versiones_horario_un_publicado_por_periodo_uidx
    ON public.versiones_horario (id_periodo) WHERE estado = 'publicado';

-- Publication is the only transition that can mark a class row as official.
-- Keep old rows and snapshots unchanged when a later approved version replaces it.
CREATE OR REPLACE FUNCTION public.publish_schedule_version(p_version_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_period INTEGER;
    current_official INTEGER;
    validation_result JSONB;
    published_rows INTEGER;
    new_state TEXT;
BEGIN
    IF NOT public.is_active_admin() AND NOT public.is_active_planner() THEN
        RAISE EXCEPTION 'Only administration or planning can publish a schedule.' USING ERRCODE = '42501';
    END IF;
    SELECT id_periodo INTO target_period
    FROM public.versiones_horario
    WHERE id_version_horario = p_version_id AND estado = 'aprobado'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only an approved version can be published.' USING ERRCODE = '23514'; END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acaplan_period_' || target_period::TEXT));
    SELECT id_version_publicada INTO current_official
    FROM public.periodos WHERE id_periodo = target_period FOR UPDATE;

    IF EXISTS (
        SELECT 1
        FROM public.horarios AS horario
        JOIN public.bloques_clase AS bloque ON bloque.id_bloque = horario.id_bloque
        JOIN public.secciones AS seccion ON seccion.id_seccion = horario.id_seccion
        WHERE horario.id_version_horario = p_version_id
          AND (bloque.id_periodo <> target_period
            OR bloque.modalidad <> seccion.modalidad
            OR bloque.turno <> seccion.turno
            OR COALESCE(horario.dia_snapshot, bloque.dia) <> bloque.dia
            OR NOT EXISTS (
                SELECT 1 FROM public.dias_habilitados_periodo AS habilitado
                WHERE habilitado.id_periodo = target_period
                  AND habilitado.modalidad = seccion.modalidad
                  AND habilitado.turno = seccion.turno
                  AND habilitado.dia = bloque.dia
            ))
    ) OR EXISTS (
        SELECT 1 FROM public.horarios AS horario
        JOIN public.aulas AS aula ON aula.id_aula = horario.id_aula
        WHERE horario.id_version_horario = p_version_id AND aula.estado <> 'activo'
    ) OR EXISTS (
        SELECT 1
        FROM public.horarios AS horario
        JOIN public.asignacion_componente_docente AS requerido ON requerido.id_componente = horario.id_componente
        WHERE horario.id_version_horario = p_version_id
          AND NOT EXISTS (
              SELECT 1 FROM public.horario_docente AS participante
              WHERE participante.id_horario = horario.id_horario
                AND participante.id_docente = requerido.id_docente
          )
    ) THEN
        RAISE EXCEPTION 'The proposal no longer matches current groups, class days, rooms, or official teacher assignments.' USING ERRCODE = '23514';
    END IF;

    validation_result := public.validate_schedule_version(p_version_id);
    SELECT estado_validacion INTO new_state FROM public.versiones_horario
    WHERE id_version_horario = p_version_id;
    IF new_state NOT IN ('valida', 'con_avisos') OR (validation_result->>'errores')::INTEGER > 0 THEN
        RAISE EXCEPTION 'The approved proposal has conflicts and cannot be published.' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.horarios WHERE id_version_horario = p_version_id) THEN
        RAISE EXCEPTION 'The approved proposal contains no scheduled classes.' USING ERRCODE = '23514';
    END IF;

    IF current_official IS NOT NULL AND current_official <> p_version_id THEN
        UPDATE public.versiones_horario SET estado = 'archivado', fecha_actualizacion = pg_catalog.now()
        WHERE id_version_horario = current_official AND id_periodo = target_period AND estado = 'publicado';
    END IF;
    UPDATE public.versiones_horario
    SET estado = 'publicado', publicada_por = public.current_app_user_id(),
        fecha_publicada = pg_catalog.now(), fecha_actualizacion = pg_catalog.now()
    WHERE id_version_horario = p_version_id AND estado = 'aprobado';
    IF NOT FOUND THEN RAISE EXCEPTION 'The approved version changed during publication.' USING ERRCODE = '40001'; END IF;

    PERFORM pg_catalog.set_config('acaplan.allow_schedule_publish', 'on', TRUE);
    UPDATE public.horarios
    SET estado_publicacion = 'publicado', fecha_actualizacion = pg_catalog.now()
    WHERE id_version_horario = p_version_id;
    GET DIAGNOSTICS published_rows = ROW_COUNT;
    UPDATE public.periodos SET id_version_publicada = p_version_id WHERE id_periodo = target_period;
    INSERT INTO public.auditoria_cambios_horario (id_version_horario, accion, detalle, realizada_por)
    VALUES (p_version_id, 'publicacion', jsonb_build_object(
        'periodo', target_period, 'version_anterior', current_official,
        'clases_publicadas', published_rows, 'estado_validacion', new_state
    ), public.current_app_user_id());
    RETURN jsonb_build_object(
        'id_periodo', target_period, 'id_version_horario', p_version_id,
        'version_anterior', current_official, 'clases_publicadas', published_rows,
        'estado_validacion', new_state
    );
END;
$$;
REVOKE ALL ON FUNCTION public.publish_schedule_version(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_schedule_version(INTEGER) TO authenticated;

-- Disable the original all-rows publisher so an older app cannot bypass review.
CREATE OR REPLACE FUNCTION public.publish_active_schedule()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Use publish_schedule_version after review and approval.' USING ERRCODE = '0A000';
END;
$$;
REVOKE ALL ON FUNCTION public.publish_active_schedule() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_schedule_export(
    p_version_id INTEGER,
    p_filter JSONB DEFAULT '{}'::JSONB,
    p_row_count INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.can_view_schedule_version(p_version_id) THEN
        RAISE EXCEPTION 'You cannot export this schedule version.' USING ERRCODE = '42501';
    END IF;
    IF p_row_count < 0 OR p_row_count > 20000 OR p_filter IS NULL
       OR jsonb_typeof(p_filter) <> 'object' OR pg_catalog.octet_length(p_filter::TEXT) > 5000 THEN
        RAISE EXCEPTION 'The export details are invalid.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.auditoria_cambios_horario (id_version_horario, accion, detalle, realizada_por)
    VALUES (p_version_id, 'exportacion', jsonb_build_object(
        'filtros', p_filter, 'filas', p_row_count
    ), public.current_app_user_id());
END;
$$;
REVOKE ALL ON FUNCTION public.log_schedule_export(INTEGER, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_schedule_export(INTEGER, JSONB, INTEGER) TO authenticated;

-- Current official reads resolve through this period pointer, so historical
-- published snapshots remain retained but do not appear as the current week.
DROP POLICY IF EXISTS horarios_visible_users_read ON public.horarios;
CREATE POLICY horarios_visible_users_read ON public.horarios
    FOR SELECT TO authenticated USING (public.can_view_schedule_version(id_version_horario));

COMMIT;
