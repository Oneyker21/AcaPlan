-- Sprint 1: register the organizational functions used by account management.
-- Keep enum additions isolated so later migrations can safely use the new values.
ALTER TYPE public.user_rol ADD VALUE IF NOT EXISTS 'coordinacion';
ALTER TYPE public.user_rol ADD VALUE IF NOT EXISTS 'jefatura';
ALTER TYPE public.user_rol ADD VALUE IF NOT EXISTS 'planificacion';
