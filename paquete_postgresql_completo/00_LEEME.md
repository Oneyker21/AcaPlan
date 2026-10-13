# Paquete PostgreSQL completo de AcaPlan

Este paquete reúne el esquema inicial, las diez migraciones SQL del proyecto y los archivos de soporte para administrar usuarios en Supabase.

## Contenido

- `01_esquema_inicial/Supabase.sql`: crea el esquema inicial de la base.
- `02_migraciones/`: cambios incrementales de seguridad y de los Sprints 1 al 6, ordenados por su sello de tiempo.
- `03_sql_operativos/00_vincular_administrador.sql`: plantilla para vincular como administrador a una cuenta que ya existe en Supabase Auth. Debe editarse antes de ejecutarla.
- `04_funcion_supabase/`: fuente de la función Edge `admin-users` y configuración de Supabase copiada desde el proyecto.
- `05_scripts/`: verificación de integridad del paquete y despliegue manual de la función Edge.

## Base nueva

En el SQL Editor del proyecto Supabase, ejecute los archivos en este orden, uno por uno:

1. `01_esquema_inicial/Supabase.sql`
2. `02_migraciones/20260930000000_security_and_constraints.sql`
3. `02_migraciones/20261004000000_sprint2_completion.sql`
4. `02_migraciones/20261010000000_sprint1_role_values.sql`
5. `02_migraciones/20261010000001_sprint1_career_scopes.sql`
6. `02_migraciones/20261010120000_sprint2_career_groups_grids.sql`
7. `02_migraciones/20261011000000_sprint2_space_inventory.sql`
8. `02_migraciones/20261012000000_sprint3_assignments_restrictions_rules.sql`
9. `02_migraciones/20261013000000_sprint4_schedule_drafts_validation.sql`
10. `02_migraciones/20261014000000_sprint5_generation_sharing_consultation.sql`
11. `02_migraciones/20261015000000_sprint6_publication_export_release.sql`

Espere a que cada archivo termine correctamente antes de ejecutar el siguiente. No combine los archivos en uno solo.

Esta guía aplica las migraciones manualmente desde el SQL Editor. Si luego desea administrarlas con Supabase CLI, primero tendrá que conciliar ese historial: `supabase db push` usa la tabla `supabase_migrations.schema_migrations` para decidir qué aplicar y no sabe automáticamente que se pegó SQL en el Dashboard. No mezcle ambos métodos sin revisar `supabase migration list`.

## Base existente

No vuelva a ejecutar `Supabase.sql` sobre una base que ya tiene el esquema de AcaPlan. Revise el historial de migraciones y ejecute, en orden, solo las que todavía no se hayan aplicado. Si la base se administró manualmente y no tiene historial confiable, primero compare su esquema con cada migración y haga una copia de seguridad.

La primera migración de seguridad enlaza perfiles con cuentas de Supabase Auth y elimina el campo antiguo de contraseña en texto plano. Revise esa migración y respalde la base antes de aplicarla en un entorno existente.

## Cuenta administradora y función de administración

1. Cree primero la cuenta en **Supabase → Authentication → Users**.
2. Edite el correo y nombre en `03_sql_operativos/00_vincular_administrador.sql`; ejecútelo en el SQL Editor después de aplicar las migraciones.
3. Para habilitar la administración de cuentas desde la app, inicie sesión con la cuenta administradora y despliegue la función Edge `admin-users` desde la raíz del repositorio con `05_scripts/deploy_admin_users.ps1`. El despliegue requiere Supabase CLI, sesión autorizada y proyecto Supabase enlazado.

La función usa una clave privilegiada únicamente en el entorno de Supabase. No copie esa clave a la app ni a su archivo `.env`.

## Para probar la app

- Configure `.env` con `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` del proyecto correcto.
- En Supabase Authentication, permita la URL `acaplan://reset-password`.
- Importe los datos oficiales de carreras, materias, grupos, asignaciones, docentes, recursos, aulas, sedes y cuadrículas. Los scripts no inventan esos datos.
- Compruebe que las migraciones finalizaron y que existe un administrador activo antes de iniciar sesión.

Para una compilación Android de prueba, el perfil `preview` de `eas.json` ya produce un APK interno. Antes de iniciarla, vincule el repositorio a una cuenta/proyecto Expo, defina el identificador Android que usará la institución y configure en el entorno EAS las dos variables públicas de Supabase. Para iOS se necesita además el identificador de paquete y las credenciales/dispositivos de distribución correspondientes.

Las migraciones añaden o modifican tablas, columnas, restricciones, índices, funciones, políticas RLS y permisos. La app no puede completar los flujos de planificación hasta que se apliquen.

## Verificación

Desde la raíz del repositorio ejecute:

```powershell
& .\paquete_postgresql_completo\05_scripts\verificar_paquete.ps1
```

Este script compara los SQL originales del repositorio con las copias del paquete mediante SHA-256. No se conecta a Supabase ni modifica la base.
