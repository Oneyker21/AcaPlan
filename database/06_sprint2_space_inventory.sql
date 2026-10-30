-- Sprint 2 / H08: mobile import of the official room inventory.
ALTER TABLE public.pabellones
    ADD COLUMN IF NOT EXISTS sede VARCHAR(150) NOT NULL DEFAULT 'Sin especificar';
ALTER TABLE public.aulas
    ADD COLUMN IF NOT EXISTS tipo VARCHAR(80) NOT NULL DEFAULT 'Aula';

ALTER TABLE public.pabellones DROP CONSTRAINT IF EXISTS pabellones_nombre_key;
ALTER TABLE public.pabellones DROP CONSTRAINT IF EXISTS pabellones_sede_name_not_blank;
ALTER TABLE public.pabellones
    ADD CONSTRAINT pabellones_sede_name_not_blank
    CHECK (btrim(sede) <> '' AND btrim(nombre) <> '');
ALTER TABLE public.aulas DROP CONSTRAINT IF EXISTS aulas_type_not_blank;
ALTER TABLE public.aulas
    ADD CONSTRAINT aulas_type_not_blank CHECK (btrim(tipo) <> '');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.pabellones
        GROUP BY lower(btrim(sede)), lower(btrim(nombre))
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate pavilion names exist within a site. Resolve them before importing the room inventory.';
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS pabellones_sede_nombre_normalizado_uidx
    ON public.pabellones (lower(btrim(sede)), lower(btrim(nombre)));

CREATE OR REPLACE FUNCTION public.is_active_planner()
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
          AND usuario.rol = 'planificacion'
    )
$$;

REVOKE ALL ON FUNCTION public.is_active_planner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_planner() TO authenticated;

DROP POLICY IF EXISTS pabellones_planner_read ON public.pabellones;
CREATE POLICY pabellones_planner_read ON public.pabellones
    FOR SELECT TO authenticated USING (public.is_active_planner());
DROP POLICY IF EXISTS aulas_planner_read ON public.aulas;
CREATE POLICY aulas_planner_read ON public.aulas
    FOR SELECT TO authenticated USING (public.is_active_planner());
DROP POLICY IF EXISTS recursos_planner_read ON public.recursos;
CREATE POLICY recursos_planner_read ON public.recursos
    FOR SELECT TO authenticated USING (public.is_active_planner());
DROP POLICY IF EXISTS aula_recurso_planner_read ON public.aula_recurso;
CREATE POLICY aula_recurso_planner_read ON public.aula_recurso
    FOR SELECT TO authenticated USING (public.is_active_planner());

CREATE OR REPLACE FUNCTION public.import_room_inventory(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    imported_row JSONB;
    site_name TEXT;
    pavilion_name TEXT;
    room_code TEXT;
    room_type TEXT;
    room_capacity INTEGER;
    room_resources JSONB;
    requested_resource_ids INTEGER[];
    missing_resources INTEGER;
    pavilion_id INTEGER;
    room_id INTEGER;
    row_number TEXT;
    source_sheet TEXT;
    row_label TEXT;
    room_identity TEXT;
    seen_identities TEXT[] := ARRAY[]::TEXT[];
    imported_count INTEGER := 0;
BEGIN
    IF NOT public.is_active_admin() AND NOT public.is_active_planner() THEN
        RAISE EXCEPTION 'Only an active administrator or planning account can import room inventory.'
            USING ERRCODE = '42501';
    END IF;
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
        RAISE EXCEPTION 'The import must be a JSON array.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_rows) = 0 OR jsonb_array_length(p_rows) > 500 THEN
        RAISE EXCEPTION 'The import must contain between 1 and 500 room rows.' USING ERRCODE = '22023';
    END IF;

    FOR imported_row IN SELECT value FROM jsonb_array_elements(p_rows) AS row_data(value) LOOP
        row_number := COALESCE(imported_row->>'row', '?');
        source_sheet := COALESCE(NULLIF(btrim(imported_row->>'sheet'), ''), 'Hoja');
        row_label := source_sheet || ', fila ' || row_number;
        site_name := btrim(COALESCE(imported_row->>'sede', ''));
        pavilion_name := btrim(COALESCE(imported_row->>'pabellon', ''));
        room_code := upper(btrim(COALESCE(imported_row->>'identificacion', '')));
        room_type := btrim(COALESCE(imported_row->>'tipo', ''));

        IF site_name = '' OR length(site_name) > 150 THEN
            RAISE EXCEPTION '%: site is required and must contain at most 150 characters.', row_label USING ERRCODE = '22023';
        END IF;
        IF pavilion_name = '' OR length(pavilion_name) > 50 THEN
            RAISE EXCEPTION '%: pavilion is required and must contain at most 50 characters.', row_label USING ERRCODE = '22023';
        END IF;
        IF room_code = '' OR length(room_code) > 20 THEN
            RAISE EXCEPTION '%: room identification is required and must contain at most 20 characters.', row_label USING ERRCODE = '22023';
        END IF;
        IF room_type = '' OR length(room_type) > 80 THEN
            RAISE EXCEPTION '%: room type is required and must contain at most 80 characters.', row_label USING ERRCODE = '22023';
        END IF;
        IF COALESCE(imported_row->>'capacidad', '') !~ '^[0-9]+$' THEN
            RAISE EXCEPTION '%: capacity must be a positive whole number.', row_label USING ERRCODE = '22023';
        END IF;
        IF length(imported_row->>'capacidad') > 20 OR (imported_row->>'capacidad')::NUMERIC > 2147483647 THEN
            RAISE EXCEPTION '%: capacity is outside the supported range.', row_label USING ERRCODE = '22003';
        END IF;
        room_capacity := (imported_row->>'capacidad')::INTEGER;
        IF room_capacity <= 0 THEN
            RAISE EXCEPTION '%: capacity must be greater than zero.', row_label USING ERRCODE = '22023';
        END IF;

        room_identity := lower(site_name) || chr(31) || lower(pavilion_name) || chr(31) || lower(room_code);
        IF room_identity = ANY(seen_identities) THEN
            RAISE EXCEPTION '%: this site, pavilion, and room are repeated in the file.', row_label USING ERRCODE = '23505';
        END IF;
        seen_identities := array_append(seen_identities, room_identity);

        room_resources := COALESCE(imported_row->'recursos', '[]'::JSONB);
        IF jsonb_typeof(room_resources) <> 'array' THEN
            RAISE EXCEPTION '%: resources must be a list.', row_label USING ERRCODE = '22023';
        END IF;
        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(room_resources) AS item(value)
            WHERE jsonb_typeof(item.value) <> 'string' OR btrim(item.value #>> '{}') = ''
        ) THEN
            RAISE EXCEPTION '%: resource names must be non-empty text.', row_label USING ERRCODE = '22023';
        END IF;
        SELECT pg_catalog.array_agg(DISTINCT resource.id_recurso),
               (SELECT pg_catalog.count(DISTINCT lower(btrim(item.value #>> '{}')))
                FROM jsonb_array_elements(room_resources) AS item(value))
        INTO requested_resource_ids, missing_resources
        FROM jsonb_array_elements_text(room_resources) AS imported_resource(name)
        JOIN public.recursos AS resource ON lower(btrim(resource.nombre)) = lower(btrim(imported_resource.name));
        IF COALESCE(missing_resources, 0) <> COALESCE(pg_catalog.cardinality(requested_resource_ids), 0) THEN
            RAISE EXCEPTION '%: one or more resources are not in the resource catalog.', row_label USING ERRCODE = '23503';
        END IF;

        INSERT INTO public.pabellones (sede, nombre)
        VALUES (site_name, pavilion_name)
        ON CONFLICT ((lower(btrim(sede))), (lower(btrim(nombre))))
        DO UPDATE SET sede = EXCLUDED.sede, nombre = EXCLUDED.nombre
        RETURNING id_pabellon INTO pavilion_id;

        INSERT INTO public.aulas (codigo, id_pabellon, capacidad, tipo, estado)
        VALUES (room_code, pavilion_id, room_capacity, room_type, 'activo')
        ON CONFLICT (id_pabellon, (lower(btrim(codigo))))
        DO UPDATE SET capacidad = EXCLUDED.capacidad, tipo = EXCLUDED.tipo, estado = 'activo'
        RETURNING id_aula INTO room_id;

        IF EXISTS (
            SELECT 1 FROM public.horarios AS horario
            WHERE horario.id_aula = room_id
              AND (
                  EXISTS (
                      SELECT 1 FROM public.aula_recurso AS current_resource
                      WHERE current_resource.id_aula = room_id
                        AND NOT (current_resource.id_recurso = ANY(COALESCE(requested_resource_ids, ARRAY[]::INTEGER[])))
                  )
                  OR EXISTS (
                      SELECT 1 FROM pg_catalog.unnest(COALESCE(requested_resource_ids, ARRAY[]::INTEGER[])) AS requested(id_recurso)
                      WHERE NOT EXISTS (
                          SELECT 1 FROM public.aula_recurso AS current_resource
                          WHERE current_resource.id_aula = room_id
                            AND current_resource.id_recurso = requested.id_recurso
                      )
                  )
              )
        ) THEN
            RAISE EXCEPTION '%: resources cannot change while the room is assigned to a schedule.', row_label USING ERRCODE = '23514';
        END IF;

        DELETE FROM public.aula_recurso
        WHERE id_aula = room_id
          AND NOT (id_recurso = ANY(COALESCE(requested_resource_ids, ARRAY[]::INTEGER[])));
        INSERT INTO public.aula_recurso (id_aula, id_recurso)
        SELECT room_id, requested.id_recurso
        FROM pg_catalog.unnest(COALESCE(requested_resource_ids, ARRAY[]::INTEGER[])) AS requested(id_recurso)
        ON CONFLICT DO NOTHING;

        imported_count := imported_count + 1;
    END LOOP;

    RETURN imported_count;
END;
$$;

REVOKE ALL ON FUNCTION public.import_room_inventory(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_room_inventory(JSONB) TO authenticated;
