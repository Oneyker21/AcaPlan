# Base de Datos AcaPlan — Nuevo Proyecto Supabase

Ejecuta los archivos SQL **en el orden numérico** desde el SQL Editor de Supabase.

## Orden de Ejecución

| Archivo | Descripción |
|---------|-------------|
| `00_esquema_base.sql` | Esquema inicial: tablas, enums y datos base |
| `01_security_and_constraints.sql` | RLS, políticas de seguridad, vinculación auth_user_id |
| `02_sprint2_completion.sql` | Recursos por asignatura/aula, días habilitados por período |
| `03_sprint1_role_values.sql` | Perfiles institucionales extendidos |
| `04_sprint1_career_scopes.sql` | Alcance autorizado por carrera por usuario |
| `05_sprint2_career_groups_grids.sql` | Catálogos por carrera, grupos modalidad/turno/sede, cuadrículas |
| `06_sprint2_space_inventory.sql` | Inventario oficial de espacios (importación atómica) |
| `07_sprint3_assignments_restrictions_rules.sql` | Asignaciones oficiales, restricciones, reglas versionadas |
| `08_sprint4_schedule_drafts_validation.sql` | Borradores por versión, validaciones, clases fijadas, historial |
| `09_sprint5_generation_sharing_consultation.sql` | Propuestas automáticas, consulta compartida, decisiones de revisión |
| `10_sprint6_publication_export_release.sql` | Publicación de versiones aprobadas y auditoría de exportaciones |
| `11_sprint3_departamentos_y_docentes.sql` | Departamentos, jefaturas y docentes con componentes |
| `12_usuarios_prueba_roles_y_rangos.sql` | Cuentas de prueba para TODOS los roles y rangos (Admin, Planificación, Coordinación, Jefatura, Docente Planta, Docente Horario) |
| `13_horarios_aula_opcional.sql` | Permite que las clases se programen sin aula asignada (asignación de aula opcional) |
| `14_datos_prueba_completos.sql` | Datos de prueba completos (Período activo, bloques de 90 min, 3 grupos, 9 asignaturas, aulas y asignaciones docentes para probar el generador IA) |

## Cuentas de prueba automáticas (Script 12)

Ejecutando `12_usuarios_prueba_roles_y_rangos.sql` en el SQL Editor de Supabase se generan automáticamente todas las identidades y perfiles de prueba con la contraseña común: **`AcaPlan2026*`**.

| Rol / Función | Rango / Tipo | Correo | Contraseña | Espacio en la App Móvil |
|---|---|---|---|---|
| **Administrador** | Personal directivo | `admin.qa@acaplan.edu.ni` | `AcaPlan2026*` | `/(admin)`: Catálogos, Cuentas, Departamentos, Períodos, Generador IA |
| **Planificación** | Planificador institucional | `planificador.qa@acaplan.edu.ni` | `AcaPlan2026*` | `/(planificacion)`: Cuadrículas, Espacios, Reglas, Generador IA, Borradores |
| **Coordinación** | Coordinador de Carrera | `coordinador.qa@acaplan.edu.ni` | `AcaPlan2026*` | `/(coordinacion)`: Asignaturas, Grupos, Asignación Docente, Restricciones |
| **Jefatura** | Jefe de Departamento | `jefatura.qa@acaplan.edu.ni` | `AcaPlan2026*` | `/(jefatura)`: Docentes del Departamento (Planta/Horario), Componentes |
| **Docente Planta** | `planta` (Tiempo Completo) | `docente.planta@acaplan.edu.ni` | `AcaPlan2026*` | `/(docente)`: Horario oficial de clases personal (sin restricciones) |
| **Docente Horario** | `horario` (Tiempo Parcial) | `docente.horario@acaplan.edu.ni` | `AcaPlan2026*` | `/(docente)`: Horario oficial y registro de restricciones de disponibilidad |

## Primera cuenta administradora manual (Opcional)

Después de ejecutar todos los scripts, crea la cuenta desde:
**Authentication → Users** en el dashboard de Supabase.

Luego vincula el UUID al perfil en el SQL Editor:

```sql
INSERT INTO public.usuarios (auth_user_id, nombre, correo, cedula, rol, estado)
SELECT id, 'Administrador inicial', email, '000-000000-0000A', 'administrador', 'activo'
FROM auth.users
WHERE lower(email) = lower('admin@unan.edu.ni');
```

Si el perfil ya existe pero sin `auth_user_id`:

```sql
UPDATE public.usuarios AS perfil
SET auth_user_id = auth_user.id
FROM auth.users AS auth_user
WHERE lower(perfil.correo) = lower(auth_user.email)
  AND perfil.auth_user_id IS NULL
  AND lower(perfil.correo) = lower('admin@unan.edu.ni');
```

## Variables de entorno (.env)

```env
EXPO_PUBLIC_SUPABASE_URL=https://TU-NUEVO-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...  (Settings → API → anon public)
```

## Redirect URL (Authentication → URL Configuration)

Agregar: `acaplan://reset-password`
