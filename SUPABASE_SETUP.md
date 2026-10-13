# Configuración de Supabase

El paquete completo de SQL, la plantilla para vincular el administrador y los scripts de soporte están reunidos en [`paquete_postgresql_completo/00_LEEME.md`](paquete_postgresql_completo/00_LEEME.md). Para comprobar que las once copias SQL originales coinciden con el proyecto, ejecute `paquete_postgresql_completo/05_scripts/verificar_paquete.ps1` desde la raíz del repositorio.

## Aplicación móvil

1. Copie `.env.example` como `.env` y complete la URL del proyecto y la clave pública de Supabase. La clave pública puede estar en el cliente porque las tablas quedan protegidas por RLS; nunca coloque aquí `service_role` ni una clave secreta.
2. En el SQL Editor de Supabase, ejecute `Supabase.sql` si está creando la base desde cero.
3. Ejecute `supabase/migrations/20260930000000_security_and_constraints.sql`. En bases existentes, esta migración enlaza cuentas de Auth por correo y elimina la columna antigua de contraseñas en texto plano. Las cuentas sin coincidencia quedan sin acceso hasta enlazarlas a su usuario de Auth.
4. Ejecute `supabase/migrations/20261004000000_sprint2_completion.sql` para habilitar los recursos requeridos por asignatura, recursos disponibles por aula y días habilitados por período.
5. Ejecute, en orden, `supabase/migrations/20261010000000_sprint1_role_values.sql` y `supabase/migrations/20261010000001_sprint1_career_scopes.sql`. Amplían los perfiles institucionales, mantienen cédula opcional y guardan el alcance autorizado por carrera.
6. Ejecute `supabase/migrations/20261010120000_sprint2_career_groups_grids.sql`. Habilita los catálogos por carrera, grupos con modalidad/turno/sede y cuadrículas separadas por período, modalidad y turno.
7. Ejecute `supabase/migrations/20261011000000_sprint2_space_inventory.sql` para agregar el inventario oficial de espacios y habilitar su importación móvil sin cambios parciales.
8. Ejecute `supabase/migrations/20261012000000_sprint3_assignments_restrictions_rules.sql` para instalar asignaciones oficiales, docentes y recursos por componente, restricciones autorizadas y reglas versionadas.
9. Ejecute `supabase/migrations/20261013000000_sprint4_schedule_drafts_validation.sql` para crear borradores por versión, validaciones, clases fijadas e historial.
10. Ejecute `supabase/migrations/20261014000000_sprint5_generation_sharing_consultation.sql` para habilitar propuestas automáticas, consulta compartida y decisiones de revisión.
11. Ejecute `supabase/migrations/20261015000000_sprint6_publication_export_release.sql` para publicar versiones aprobadas por período y auditar exportaciones PDF.
12. En Authentication → URL Configuration, agregue `acaplan://reset-password` a las URL de redirección permitidas.

## Primera cuenta administradora

La función de administración exige un administrador ya autenticado. Cree la primera cuenta desde Authentication → Users y luego vincule su UUID a un perfil en SQL Editor. Sustituya los valores de ejemplo antes de ejecutar:

```sql
INSERT INTO public.usuarios (auth_user_id, nombre, correo, cedula, rol, estado)
SELECT id, 'Administrador inicial', email, '000-000000-0000A', 'administrador', 'activo'
FROM auth.users
WHERE lower(email) = lower('admin@unan.edu.ni');
```

Si ya existe un perfil con ese correo, actualice ese registro y no inserte uno duplicado:

```sql
UPDATE public.usuarios AS perfil
SET auth_user_id = auth_user.id
FROM auth.users AS auth_user
WHERE lower(perfil.correo) = lower(auth_user.email)
  AND perfil.auth_user_id IS NULL
  AND lower(perfil.correo) = lower('admin@unan.edu.ni');
```

## Función de administración de cuentas

Desde el proyecto Supabase vinculado, publique la función `admin-users`:

```sh
supabase functions deploy admin-users
```

La función valida el JWT y comprueba que quien llama sea un administrador activo. Usa la clave privilegiada únicamente en el entorno de Supabase para crear usuarios de Auth y sincronizar su perfil y carreras autorizadas. No copie esa clave al proyecto móvil.

Después de iniciar sesión como administrador, registre las carreras, materias, recursos, pabellones y aulas desde **Catálogos**. Marque los recursos requeridos en cada materia y los disponibles en cada aula; configure los días habilitados antes de crear bloques o recesos. Luego configure secciones y asignaciones oficiales, complete el borrador, compártalo para revisión, registre su aprobación y publíquelo desde **Planificar Horarios**. La propuesta automática deja sin ubicar las sesiones que no pueda resolver; revise y corrija los hallazgos antes de compartir.

Para probar o producir archivos móviles, `eas.json` incluye perfiles de distribución interna y de tienda. La generación firmada requiere vincular el proyecto a la cuenta institucional de Expo, definir los identificadores de la app para Android e iOS y configurar las credenciales correspondientes. Los canales de actualizaciones permanecen sin configurar hasta que la institución determine sus nombres y política de lanzamiento. No inicie una publicación en tiendas ni envíe actualizaciones mientras esos datos estén pendientes.

La lista oficial de aulas y la distribución aprobada de bloques todavía deben importarse desde las fuentes institucionales. No se incluyen filas inventadas en la base.

## Restricciones aplicadas por la migración

- RLS limita a Coordinación a las carreras vinculadas a su perfil; Planificación puede administrar los catálogos y cuadrículas institucionales. Las asignaciones del docente siguen limitadas a sus horarios publicados.
- La base garantiza un solo período activo, códigos únicos según su alcance, grupos con modalidad/turno/sede, bloques sin traslapes dentro de su cuadrícula y en días habilitados, y asignaciones sin conflictos de docente, aula o sección.
- Al cambiar la hora de un bloque usado, la aplicación muestra las clases afectadas; se guardan como borrador y se revalidan dentro de la misma operación. Si se detecta un conflicto, el cambio completo se revierte.
- Los vínculos de asignaturas con grupos se reemplazan atómicamente y solo aceptan materias activas de la misma carrera y año de estudio. No se eliminan físicamente carreras, asignaturas ni grupos desde la aplicación.
