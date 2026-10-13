-- Sprint 1: cédula and INSS remain optional until the institution confirms their rules.
ALTER TABLE public.usuarios ALTER COLUMN cedula DROP NOT NULL;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_cedula_key;
DROP INDEX IF EXISTS public.usuarios_cedula_key;

UPDATE public.usuarios
SET cedula = NULL
WHERE cedula IS NOT NULL AND btrim(cedula) = '';

ALTER TABLE public.periodos DROP CONSTRAINT IF EXISTS periodos_academic_year_valid;
ALTER TABLE public.periodos
    ADD CONSTRAINT periodos_academic_year_valid CHECK (ano_lectivo BETWEEN 1900 AND 9999);
ALTER TABLE public.periodos DROP CONSTRAINT IF EXISTS periodos_name_not_blank;
ALTER TABLE public.periodos
    ADD CONSTRAINT periodos_name_not_blank CHECK (btrim(nombre) <> '');

CREATE TABLE IF NOT EXISTS public.usuario_carrera (
    id_usuario INTEGER NOT NULL REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE,
    id_carrera INTEGER NOT NULL REFERENCES public.carreras(id_carrera) ON DELETE RESTRICT,
    PRIMARY KEY (id_usuario, id_carrera)
);

CREATE INDEX IF NOT EXISTS usuario_carrera_carrera_usuario_idx
    ON public.usuario_carrera (id_carrera, id_usuario);

ALTER TABLE public.usuario_carrera ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.usuario_carrera FROM anon, authenticated;
GRANT SELECT ON TABLE public.usuario_carrera TO authenticated;

DROP POLICY IF EXISTS usuario_carrera_select_admin_or_self ON public.usuario_carrera;
CREATE POLICY usuario_carrera_select_admin_or_self ON public.usuario_carrera
    FOR SELECT TO authenticated
    USING (
        public.is_active_admin()
        OR id_usuario = public.current_app_user_id()
    );

CREATE OR REPLACE FUNCTION public.admin_replace_user_careers(
    target_user_id INTEGER,
    career_ids INTEGER[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_role public.user_rol;
    normalized_ids INTEGER[] := COALESCE(career_ids, ARRAY[]::INTEGER[]);
BEGIN
    SELECT usuario.rol
    INTO target_role
    FROM public.usuarios AS usuario
    WHERE usuario.id_usuario = target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The requested account does not exist.' USING ERRCODE = '23503';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(normalized_ids) AS assigned(id_carrera)
        WHERE assigned.id_carrera IS NULL OR assigned.id_carrera <= 0
    ) THEN
        RAISE EXCEPTION 'The career list is invalid.' USING ERRCODE = '22023';
    END IF;

    IF (
        SELECT pg_catalog.count(DISTINCT assigned.id_carrera)
        FROM pg_catalog.unnest(normalized_ids) AS assigned(id_carrera)
    ) <> pg_catalog.cardinality(normalized_ids) THEN
        RAISE EXCEPTION 'The career list contains duplicates.' USING ERRCODE = '22023';
    END IF;

    IF target_role IN ('coordinacion', 'jefatura') AND pg_catalog.cardinality(normalized_ids) = 0 THEN
        RAISE EXCEPTION 'Coordination and department heads need an assigned career.' USING ERRCODE = '23514';
    END IF;

    IF target_role NOT IN ('coordinacion', 'jefatura') AND pg_catalog.cardinality(normalized_ids) > 0 THEN
        RAISE EXCEPTION 'This role cannot have career assignments.' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(normalized_ids) AS assigned(id_carrera)
        LEFT JOIN public.carreras AS carrera ON carrera.id_carrera = assigned.id_carrera
        WHERE carrera.id_carrera IS NULL
    ) THEN
        RAISE EXCEPTION 'One or more assigned careers do not exist.' USING ERRCODE = '23503';
    END IF;

    DELETE FROM public.usuario_carrera
    WHERE id_usuario = target_user_id;

    INSERT INTO public.usuario_carrera (id_usuario, id_carrera)
    SELECT target_user_id, assigned.id_carrera
    FROM pg_catalog.unnest(normalized_ids) AS assigned(id_carrera);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_replace_user_careers(INTEGER, INTEGER[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_replace_user_careers(INTEGER, INTEGER[]) TO service_role;
