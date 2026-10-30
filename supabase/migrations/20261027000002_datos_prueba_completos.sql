-- ============================================================================
-- ACAPLAN - SCRIPT 14: DATOS DE PRUEBA COMPLETOS PARA PLANIFICACIÓN Y HORARIOS
-- ============================================================================
-- Estructura oficial de horarios (Horario_Matutino_IISem_2026_Final.pdf):
--
-- Horario Matutino Oficial:
--   Bloque 1: 08:00 - 09:30  (90 min)
--   Receso:   09:30 - 09:40  (10 min de receso)
--   Bloque 2: 09:40 - 11:10  (90 min)
--   Receso:   11:10 - 11:20  (10 min de receso)
--   Bloque 3: 11:20 - 12:50  (90 min)
--
-- Días lectivos: Lunes, Martes, Miércoles y Jueves (12 bloques lectivos por semana)
-- Cobertura: 4 Grupos (1M1-IS, 2M1-IS, 3M1-IS, 4M1-IS), 20 Asignaturas (5 por año),
-- 9 Docentes balanceados (máx 2 bloques por materia), y 40 sesiones semanales totales.
-- ============================================================================

DO $$
DECLARE
    d RECORD;
    v_admin_id INTEGER;
    v_planta_id INTEGER;
    v_horario_id INTEGER;
    v_coord_id INTEGER;
    v_jefe_id INTEGER;
    v_plan_id INTEGER;

    -- Docentes auxiliares
    v_doc_javier INTEGER;
    v_doc_sofia INTEGER;
    v_doc_pedro INTEGER;
    v_doc_martha INTEGER;

    v_periodo_id INTEGER;
    v_carrera_id INTEGER;
    v_pabellon_id INTEGER;

    -- Aulas
    v_aula101_id INTEGER;
    v_aula102_id INTEGER;
    v_aula103_id INTEGER;
    v_aula104_id INTEGER;
    v_lab1_id INTEGER;
    v_lab2_id INTEGER;

    -- Secciones
    v_sec1_id INTEGER;
    v_sec2_id INTEGER;
    v_sec3_id INTEGER;
    v_sec4_id INTEGER;

    -- Asignaturas (5 por año)
    -- Año 1
    v_asig101_id INTEGER;
    v_asig102_id INTEGER;
    v_asig103_id INTEGER;
    v_asig104_id INTEGER;
    v_asig105_id INTEGER;
    -- Año 2
    v_asig201_id INTEGER;
    v_asig202_id INTEGER;
    v_asig203_id INTEGER;
    v_asig204_id INTEGER;
    v_asig205_id INTEGER;
    -- Año 3
    v_asig301_id INTEGER;
    v_asig302_id INTEGER;
    v_asig303_id INTEGER;
    v_asig304_id INTEGER;
    v_asig305_id INTEGER;
    -- Año 4
    v_asig401_id INTEGER;
    v_asig402_id INTEGER;
    v_asig403_id INTEGER;
    v_asig404_id INTEGER;
    v_asig405_id INTEGER;

    -- Variables auxiliares para inserts
    v_asig_acad_id INTEGER;
    v_comp_id INTEGER;
BEGIN
    -- ------------------------------------------------------------------------
    -- 0. Obtener IDs de usuarios principales de prueba (Script 12)
    -- ------------------------------------------------------------------------
    SELECT id_usuario INTO v_admin_id   FROM public.usuarios WHERE correo = 'admin.qa@acaplan.edu.ni';
    SELECT id_usuario INTO v_planta_id  FROM public.usuarios WHERE correo = 'docente.planta@acaplan.edu.ni';
    SELECT id_usuario INTO v_horario_id FROM public.usuarios WHERE correo = 'docente.horario@acaplan.edu.ni';
    SELECT id_usuario INTO v_coord_id   FROM public.usuarios WHERE correo = 'coordinador.qa@acaplan.edu.ni';
    SELECT id_usuario INTO v_jefe_id    FROM public.usuarios WHERE correo = 'jefatura.qa@acaplan.edu.ni';
    SELECT id_usuario INTO v_plan_id    FROM public.usuarios WHERE correo = 'planificador.qa@acaplan.edu.ni';

    IF v_admin_id IS NULL THEN
        SELECT id_usuario INTO v_admin_id FROM public.usuarios WHERE estado = 'activo' LIMIT 1;
    END IF;

    -- Asegurar perfil docente para roles de gestión
    IF v_coord_id IS NOT NULL THEN
        INSERT INTO public.docentes (id_docente, especialidad) VALUES (v_coord_id, 'Gestión de Proyectos de Software')
        ON CONFLICT (id_docente) DO NOTHING;
    END IF;
    IF v_jefe_id IS NOT NULL THEN
        INSERT INTO public.docentes (id_docente, especialidad) VALUES (v_jefe_id, 'Ingeniería de Software')
        ON CONFLICT (id_docente) DO NOTHING;
    END IF;
    IF v_plan_id IS NOT NULL THEN
        INSERT INTO public.docentes (id_docente, especialidad) VALUES (v_plan_id, 'Matemática Aplicada')
        ON CONFLICT (id_docente) DO NOTHING;
    END IF;

    -- Docentes auxiliares para completar la carga realista
    INSERT INTO public.usuarios (nombre, correo, cedula, rol, estado)
    VALUES 
        ('Lic. Javier Blanco Estrada', 'docente.javier@acaplan.edu.ni', '001-100588-0001A', 'docente', 'activo'),
        ('Ing. Sofía Morales Ruiz', 'docente.sofia@acaplan.edu.ni', '001-150892-0002B', 'docente', 'activo'),
        ('MSc. Pedro Antonio Rivas', 'docente.pedro@acaplan.edu.ni', '001-200385-0003C', 'docente', 'activo'),
        ('Lic. Martha Elena Guido', 'docente.martha@acaplan.edu.ni', '001-051290-0004D', 'docente', 'activo')
    ON CONFLICT (correo) DO UPDATE SET nombre = EXCLUDED.nombre;

    SELECT id_usuario INTO v_doc_javier FROM public.usuarios WHERE correo = 'docente.javier@acaplan.edu.ni';
    SELECT id_usuario INTO v_doc_sofia  FROM public.usuarios WHERE correo = 'docente.sofia@acaplan.edu.ni';
    SELECT id_usuario INTO v_doc_pedro  FROM public.usuarios WHERE correo = 'docente.pedro@acaplan.edu.ni';
    SELECT id_usuario INTO v_doc_martha FROM public.usuarios WHERE correo = 'docente.martha@acaplan.edu.ni';

    INSERT INTO public.docentes (id_docente, especialidad) VALUES
        (v_doc_javier, 'Comunicaciones y Metodología'),
        (v_doc_sofia, 'Arquitectura de Software y Móvil'),
        (v_doc_pedro, 'Inteligencia Artificial y Datos'),
        (v_doc_martha, 'Estadística y Probabilidades')
    ON CONFLICT (id_docente) DO NOTHING;

    INSERT INTO public.pwa_docente_tipo (id_docente, tipo_docente) VALUES
        (v_doc_javier, 'planta'),
        (v_doc_sofia, 'planta'),
        (v_doc_pedro, 'horario'),
        (v_doc_martha, 'horario')
    ON CONFLICT (id_docente) DO UPDATE SET tipo_docente = EXCLUDED.tipo_docente;

    -- ------------------------------------------------------------------------
    -- 1. Período Académico Activo ("II Semestre 2026")
    -- ------------------------------------------------------------------------
    UPDATE public.periodos SET es_activo = FALSE WHERE es_activo = TRUE AND nombre <> 'II Semestre 2026';

    SELECT id_periodo INTO v_periodo_id FROM public.periodos WHERE nombre = 'II Semestre 2026';
    IF v_periodo_id IS NULL THEN
        INSERT INTO public.periodos (nombre, ano_lectivo, fecha_inicio, fecha_fin, es_activo)
        VALUES ('II Semestre 2026', 2026, '2026-08-10', '2026-12-18', TRUE)
        RETURNING id_periodo INTO v_periodo_id;
    ELSE
        UPDATE public.periodos
        SET es_activo = TRUE, ano_lectivo = 2026, fecha_inicio = '2026-08-10', fecha_fin = '2026-12-18'
        WHERE id_periodo = v_periodo_id;
    END IF;

    -- ------------------------------------------------------------------------
    -- 2. Días Habilitados y Cuadrícula Oficial (08:00 AM, 90 min, 10 min receso)
    -- ------------------------------------------------------------------------
    INSERT INTO public.dias_habilitados_periodo (id_periodo, modalidad, turno, dia)
    VALUES 
        (v_periodo_id, 'regular', 'matutino', 'Lunes'),
        (v_periodo_id, 'regular', 'matutino', 'Martes'),
        (v_periodo_id, 'regular', 'matutino', 'Miercoles'),
        (v_periodo_id, 'regular', 'matutino', 'Jueves')
    ON CONFLICT DO NOTHING;

    -- Limpiar horarios y bloques antiguos si existieran para evitar violaciones FK
    DELETE FROM public.horarios WHERE id_bloque IN (SELECT id_bloque FROM public.bloques_clase WHERE id_periodo = v_periodo_id);
    DELETE FROM public.bloques_clase WHERE id_periodo = v_periodo_id;

    -- Insertar Bloques Oficiales (08:00 inicio, 90 min c/u, 10 min receso)
    FOR d IN SELECT unnest(ARRAY['Lunes', 'Martes', 'Miercoles', 'Jueves']::public.dias_semana[]) AS dia LOOP
        -- Bloque 1: 08:00 a 09:30 (90 min)
        INSERT INTO public.bloques_clase (id_periodo, dia, modalidad, turno, hora_inicio, hora_fin, es_receso)
        VALUES (v_periodo_id, d.dia, 'regular', 'matutino', '08:00:00', '09:30:00', FALSE);

        -- Receso 1: 09:30 a 09:40 (10 min)
        INSERT INTO public.bloques_clase (id_periodo, dia, modalidad, turno, hora_inicio, hora_fin, es_receso)
        VALUES (v_periodo_id, d.dia, 'regular', 'matutino', '09:30:00', '09:40:00', TRUE);

        -- Bloque 2: 09:40 a 11:10 (90 min)
        INSERT INTO public.bloques_clase (id_periodo, dia, modalidad, turno, hora_inicio, hora_fin, es_receso)
        VALUES (v_periodo_id, d.dia, 'regular', 'matutino', '09:40:00', '11:10:00', FALSE);

        -- Receso 2: 11:10 a 11:20 (10 min)
        INSERT INTO public.bloques_clase (id_periodo, dia, modalidad, turno, hora_inicio, hora_fin, es_receso)
        VALUES (v_periodo_id, d.dia, 'regular', 'matutino', '11:10:00', '11:20:00', TRUE);

        -- Bloque 3: 11:20 a 12:50 (90 min)
        INSERT INTO public.bloques_clase (id_periodo, dia, modalidad, turno, hora_inicio, hora_fin, es_receso)
        VALUES (v_periodo_id, d.dia, 'regular', 'matutino', '11:20:00', '12:50:00', FALSE);
    END LOOP;

    -- ------------------------------------------------------------------------
    -- 3. Espacios Físicos (Aulas y Laboratorios)
    -- ------------------------------------------------------------------------
    INSERT INTO public.pabellones (sede, nombre)
    VALUES ('Recinto Universitario Rubén Darío', 'Pabellón 14 - Informática')
    ON CONFLICT (sede, nombre) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id_pabellon INTO v_pabellon_id;

    IF v_pabellon_id IS NULL THEN
        SELECT id_pabellon INTO v_pabellon_id FROM public.pabellones WHERE sede = 'Recinto Universitario Rubén Darío' AND nombre = 'Pabellón 14 - Informática';
    END IF;

    INSERT INTO public.aulas (codigo, id_pabellon, capacidad, tipo, estado) VALUES
        ('1401', v_pabellon_id, 45, 'Aula', 'activo'),
        ('1402', v_pabellon_id, 45, 'Aula', 'activo'),
        ('1403', v_pabellon_id, 40, 'Aula', 'activo'),
        ('1404', v_pabellon_id, 40, 'Aula', 'activo'),
        ('Lab-1', v_pabellon_id, 40, 'Laboratorio', 'activo'),
        ('Lab-2', v_pabellon_id, 35, 'Laboratorio', 'activo')
    ON CONFLICT (codigo, id_pabellon) DO UPDATE SET capacidad = EXCLUDED.capacidad, estado = 'activo';

    SELECT id_aula INTO v_aula101_id FROM public.aulas WHERE codigo = '1401' AND id_pabellon = v_pabellon_id;
    SELECT id_aula INTO v_aula102_id FROM public.aulas WHERE codigo = '1402' AND id_pabellon = v_pabellon_id;
    SELECT id_aula INTO v_aula103_id FROM public.aulas WHERE codigo = '1403' AND id_pabellon = v_pabellon_id;
    SELECT id_aula INTO v_aula104_id FROM public.aulas WHERE codigo = '1404' AND id_pabellon = v_pabellon_id;
    SELECT id_aula INTO v_lab1_id    FROM public.aulas WHERE codigo = 'Lab-1' AND id_pabellon = v_pabellon_id;
    SELECT id_aula INTO v_lab2_id    FROM public.aulas WHERE codigo = 'Lab-2' AND id_pabellon = v_pabellon_id;

    -- ------------------------------------------------------------------------
    -- 4. Carrera y 20 Asignaturas de Ingeniería en Sistemas
    -- ------------------------------------------------------------------------
    SELECT id_carrera INTO v_carrera_id FROM public.carreras WHERE nombre = 'Ingeniería en Sistemas de Información';
    IF v_carrera_id IS NULL THEN
        INSERT INTO public.carreras (nombre) VALUES ('Ingeniería en Sistemas de Información')
        RETURNING id_carrera INTO v_carrera_id;
    END IF;

    -- Año 1
    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-101', 'Introducción a la Programación', v_carrera_id, 1, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig101_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-102', 'Matemática Básica', v_carrera_id, 1, 4, 0, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig102_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-103', 'Contabilidad Financiera', v_carrera_id, 1, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig103_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-104', 'Comunicación Oral y Escrita', v_carrera_id, 1, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig104_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-105', 'Metodología de la Investigación', v_carrera_id, 1, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig105_id;

    -- Año 2
    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-201', 'Estructuras de Datos y Algoritmos', v_carrera_id, 2, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig201_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-202', 'Arquitectura de Computadoras', v_carrera_id, 2, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig202_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-203', 'Cálculo para Ciencias de la Computación', v_carrera_id, 2, 4, 0, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig203_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-204', 'Sistemas Operativos', v_carrera_id, 2, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig204_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-205', 'Estadística y Probabilidades', v_carrera_id, 2, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig205_id;

    -- Año 3
    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-301', 'Sistemas de Gestión de Bases de Datos', v_carrera_id, 3, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig301_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-302', 'Ingeniería de Software I', v_carrera_id, 3, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig302_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-303', 'Redes de Comunicación de Datos', v_carrera_id, 3, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig303_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-304', 'Programación Web y Móvil', v_carrera_id, 3, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig304_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-305', 'Análisis y Diseño de Sistemas', v_carrera_id, 3, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig305_id;

    -- Año 4
    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-401', 'Seguridad y Criptografía', v_carrera_id, 4, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig401_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-402', 'Inteligencia Artificial Aplicada', v_carrera_id, 4, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig402_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-403', 'Gestión de Proyectos de TI', v_carrera_id, 4, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig403_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-404', 'Auditoría de Sistemas de Información', v_carrera_id, 4, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig404_id;

    INSERT INTO public.asignaturas (codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado)
    VALUES ('IS-405', 'Ética y Legislación Informática', v_carrera_id, 4, 2, 2, 'activo')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id_asignatura INTO v_asig405_id;

    -- ------------------------------------------------------------------------
    -- 5. Secciones / Grupos Académicos (4 Años)
    -- ------------------------------------------------------------------------
    -- 1M1-IS
    INSERT INTO public.secciones (id_periodo, codigo, id_carrera, ano_estudio, cantidad_estudiantes, modalidad, turno, sede)
    VALUES (v_periodo_id, '1M1-IS', v_carrera_id, 1, 35, 'regular', 'matutino', 'RURD')
    ON CONFLICT (id_periodo, id_carrera, lower(btrim(codigo))) DO UPDATE SET cantidad_estudiantes = 35
    RETURNING id_seccion INTO v_sec1_id;
    IF v_sec1_id IS NULL THEN
        SELECT id_seccion INTO v_sec1_id FROM public.secciones WHERE id_periodo = v_periodo_id AND codigo = '1M1-IS';
    END IF;

    -- 2M1-IS
    INSERT INTO public.secciones (id_periodo, codigo, id_carrera, ano_estudio, cantidad_estudiantes, modalidad, turno, sede)
    VALUES (v_periodo_id, '2M1-IS', v_carrera_id, 2, 32, 'regular', 'matutino', 'RURD')
    ON CONFLICT (id_periodo, id_carrera, lower(btrim(codigo))) DO UPDATE SET cantidad_estudiantes = 32
    RETURNING id_seccion INTO v_sec2_id;
    IF v_sec2_id IS NULL THEN
        SELECT id_seccion INTO v_sec2_id FROM public.secciones WHERE id_periodo = v_periodo_id AND codigo = '2M1-IS';
    END IF;

    -- 3M1-IS
    INSERT INTO public.secciones (id_periodo, codigo, id_carrera, ano_estudio, cantidad_estudiantes, modalidad, turno, sede)
    VALUES (v_periodo_id, '3M1-IS', v_carrera_id, 3, 28, 'regular', 'matutino', 'RURD')
    ON CONFLICT (id_periodo, id_carrera, lower(btrim(codigo))) DO UPDATE SET cantidad_estudiantes = 28
    RETURNING id_seccion INTO v_sec3_id;
    IF v_sec3_id IS NULL THEN
        SELECT id_seccion INTO v_sec3_id FROM public.secciones WHERE id_periodo = v_periodo_id AND codigo = '3M1-IS';
    END IF;

    -- 4M1-IS
    INSERT INTO public.secciones (id_periodo, codigo, id_carrera, ano_estudio, cantidad_estudiantes, modalidad, turno, sede)
    VALUES (v_periodo_id, '4M1-IS', v_carrera_id, 4, 25, 'regular', 'matutino', 'RURD')
    ON CONFLICT (id_periodo, id_carrera, lower(btrim(codigo))) DO UPDATE SET cantidad_estudiantes = 25
    RETURNING id_seccion INTO v_sec4_id;
    IF v_sec4_id IS NULL THEN
        SELECT id_seccion INTO v_sec4_id FROM public.secciones WHERE id_periodo = v_periodo_id AND codigo = '4M1-IS';
    END IF;

    -- Vinculación seccion_asignatura
    INSERT INTO public.seccion_asignatura (id_seccion, id_asignatura) VALUES
        -- 1M1-IS
        (v_sec1_id, v_asig101_id), (v_sec1_id, v_asig102_id), (v_sec1_id, v_asig103_id), (v_sec1_id, v_asig104_id), (v_sec1_id, v_asig105_id),
        -- 2M1-IS
        (v_sec2_id, v_asig201_id), (v_sec2_id, v_asig202_id), (v_sec2_id, v_asig203_id), (v_sec2_id, v_asig204_id), (v_sec2_id, v_asig205_id),
        -- 3M1-IS
        (v_sec3_id, v_asig301_id), (v_sec3_id, v_asig302_id), (v_sec3_id, v_asig303_id), (v_sec3_id, v_asig304_id), (v_sec3_id, v_asig305_id),
        -- 4M1-IS
        (v_sec4_id, v_asig401_id), (v_sec4_id, v_asig402_id), (v_sec4_id, v_asig403_id), (v_sec4_id, v_asig404_id), (v_sec4_id, v_asig405_id)
    ON CONFLICT DO NOTHING;

    -- ------------------------------------------------------------------------
    -- 6. Asignaciones Académicas (2 sesiones semanales de 90 min por asignatura)
    -- ------------------------------------------------------------------------

    -- === GRUPO 1M1-IS (5 Asignaturas) ===
    -- 1. IS-101 con Prof. Eduardo Morales (Planta)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec1_id, v_asig101_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_planta_id);

    -- 2. IS-102 con Lic. Carlos Mendoza (Planificador)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec1_id, v_asig102_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_plan_id);

    -- 3. IS-103 con Ing. Ana Patricia Ruiz (Coordinadora)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec1_id, v_asig103_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_coord_id);

    -- 4. IS-104 con Lic. Javier Blanco (Planta)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec1_id, v_asig104_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_doc_javier);

    -- 5. IS-105 con Lic. Javier Blanco (Planta)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec1_id, v_asig105_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_doc_javier);

    -- === GRUPO 2M1-IS (5 Asignaturas) ===
    -- 1. IS-201 con Prof. Eduardo Morales (Planta)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec2_id, v_asig201_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_planta_id);

    -- 2. IS-202 con Lic. Lucía Salgado (Horario)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec2_id, v_asig202_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_horario_id);

    -- 3. IS-203 con Lic. Carlos Mendoza (Planificador)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec2_id, v_asig203_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_plan_id);

    -- 4. IS-204 con Ing. Sofía Morales (Planta)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec2_id, v_asig204_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_doc_sofia);

    -- 5. IS-205 con Lic. Martha Elena Guido (Horario)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec2_id, v_asig205_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_doc_martha);

    -- === GRUPO 3M1-IS (5 Asignaturas) ===
    -- 1. IS-301 con Prof. Eduardo Morales (Planta)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec3_id, v_asig301_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_planta_id);

    -- 2. IS-302 con MSc. Roberto Gómez (Jefatura)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec3_id, v_asig302_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_jefe_id);

    -- 3. IS-303 con Lic. Lucía Salgado (Horario)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec3_id, v_asig303_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_horario_id);

    -- 4. IS-304 con Ing. Sofía Morales (Planta)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec3_id, v_asig304_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_doc_sofia);

    -- 5. IS-305 con Ing. Ana Patricia Ruiz (Coordinadora)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec3_id, v_asig305_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_coord_id);

    -- === GRUPO 4M1-IS (5 Asignaturas) ===
    -- 1. IS-401 con Lic. Lucía Salgado (Horario)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec4_id, v_asig401_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_horario_id);

    -- 2. IS-402 con MSc. Pedro Antonio Rivas (Horario)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec4_id, v_asig402_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_doc_pedro);

    -- 3. IS-403 con MSc. Roberto Gómez (Jefatura)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec4_id, v_asig403_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_jefe_id);

    -- 4. IS-404 con MSc. Pedro Antonio Rivas (Horario)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec4_id, v_asig404_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_doc_pedro);

    -- 5. IS-405 con Lic. Martha Elena Guido (Horario)
    INSERT INTO public.asignaciones_academicas (id_periodo, id_seccion, id_asignatura, creado_por)
    VALUES (v_periodo_id, v_sec4_id, v_asig405_id, v_admin_id)
    ON CONFLICT (id_seccion, id_asignatura) DO UPDATE SET creado_por = EXCLUDED.creado_por
    RETURNING id_asignacion_academica INTO v_asig_acad_id;
    INSERT INTO public.asignacion_componentes (id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos)
    VALUES (v_asig_acad_id, 'teorica', 2, 90)
    ON CONFLICT (id_asignacion_academica, tipo_sesion) DO UPDATE SET sesiones_semana = 2, duracion_minutos = 90
    RETURNING id_componente INTO v_comp_id;
    DELETE FROM public.asignacion_componente_docente WHERE id_componente = v_comp_id;
    INSERT INTO public.asignacion_componente_docente (id_componente, id_docente) VALUES (v_comp_id, v_doc_martha);

    -- ------------------------------------------------------------------------
    -- 7. Restricciones de Disponibilidad para Docentes por Horario
    -- ------------------------------------------------------------------------
    DELETE FROM public.restricciones_planificacion WHERE id_periodo = v_periodo_id;

    -- Lic. Lucía Salgado (no disponible Jueves bloques 1 y 2)
    INSERT INTO public.restricciones_planificacion (
        id_periodo, id_carrera, tipo_afectado, id_afectado, condicion,
        dia, hora_inicio, hora_fin, detalle, creada_por
    ) VALUES (
        v_periodo_id, v_carrera_id, 'docente', v_horario_id, 'bloqueo',
        'Jueves', '08:00:00', '11:10:00',
        'Compromiso laboral externo (Bloques 1 y 2)', v_admin_id
    );

    -- MSc. Pedro Antonio Rivas (no disponible Lunes bloque 1)
    INSERT INTO public.restricciones_planificacion (
        id_periodo, id_carrera, tipo_afectado, id_afectado, condicion,
        dia, hora_inicio, hora_fin, detalle, creada_por
    ) VALUES (
        v_periodo_id, v_carrera_id, 'docente', v_doc_pedro, 'bloqueo',
        'Lunes', '08:00:00', '09:30:00',
        'Reunión institucional externa', v_admin_id
    );

END $$;

-- ============================================================================
-- VERIFICACIÓN INMEDIATA DEL CONJUNTO DE DATOS
-- ============================================================================
SELECT 
    s.codigo AS grupo,
    s.ano_estudio AS año,
    count(DISTINCT a.id_asignatura) AS total_asignaturas,
    sum(c.sesiones_semana) AS total_sesiones_semanales
FROM public.secciones s
JOIN public.asignaciones_academicas a ON a.id_seccion = s.id_seccion
JOIN public.asignacion_componentes c ON c.id_asignacion_academica = a.id_asignacion_academica
WHERE s.id_periodo = (SELECT id_periodo FROM public.periodos WHERE es_activo = TRUE)
GROUP BY s.id_seccion, s.codigo, s.ano_estudio
ORDER BY s.ano_estudio;
