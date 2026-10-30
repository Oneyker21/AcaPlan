-- ============================================================================
-- ACAPLAN - SCRIPT 13: ASIGNACIÓN DE AULA OPCIONAL EN HORARIOS
-- ============================================================================
-- Permite que los borradores y propuestas de horarios puedan crearse sin aula
-- asignada de forma obligatoria (id_aula NULL), facilitando que la planificación
-- horaria se realice primero por docentes/grupos y que la distribución física
-- de aulas sea opcional o se asigne posteriormente.
-- ============================================================================

ALTER TABLE public.horarios ALTER COLUMN id_aula DROP NOT NULL;
