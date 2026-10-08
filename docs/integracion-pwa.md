# App móvil independiente de la PWA

La app móvil se comunica solo con Supabase. No requiere encender el backend Node de
ACAPLANWEB, no necesita su IP y no utiliza EXPO_PUBLIC_API_URL.

- Sesión: Supabase Auth.
- Crear cuentas: Edge Function create-account, alojada en Supabase.
- Consultar/editar cuentas y gestionar períodos: función SQL pwa_sprint1.
- PWA: conserva su propio backend Node. No llama a la app móvil.

Aunque el nombre histórico pwa_sprint1 contiene "pwa", es una función de la base compartida,
no un servicio del servidor web. Ambas aplicaciones aplican las mismas reglas de datos.

## Estado
Código preparado y probado localmente. La Edge Function y la migración SQL NO fueron
desplegadas en el proyecto remoto. Antes del despliegue, el alta móvil todavía no funcionará.
No poner claves privadas en el .env de Expo: solo URL y clave pública de Supabase.

## Despliegue
1. Respaldar la base y revisar políticas/triggers existentes. En particular, comprobar si
   algún trigger de auth.users ya crea perfiles: debe coordinarse con accounts.create.
2. Aplicar el archivo completo ACAPLANWEB/database.local/sprint-1.sql en SQL Editor.
   No ejecutar otra vez el Supabase.sql original.
3. Desde ACAPLAN, iniciar sesión en la CLI y desplegar la función al MISMO proyecto:
```powershell
npx supabase login
npx supabase functions deploy create-account --project-ref TU_PROJECT_REF
```
TU_PROJECT_REF es el identificador del proyecto Supabase. No es una API key.
No hace falta desplegar, iniciar ni tener la carpeta de la PWA para desplegar esta Edge Function.
Mantener verify_jwt=true (config.toml); no usar --no-verify-jwt.
La función además valida el JWT contra Auth y exige administrador activo mediante la RPC.
Supabase suministra las variables de servidor SUPABASE_URL y claves del proyecto.
El código admite las variables legacy y los diccionarios de claves nuevos.
No copiar el .env del backend Node al móvil ni subirlo como archivo público.
4. Reiniciar/recargar la app móvil después de actualizar su código y probar con un administrador.

Archivos desplegables:
- supabase/functions/create-account/index.ts: entrada Deno y configuración de servidor.
- supabase/functions/create-account/handler.mjs: validación, autorización y creación.
La carpeta supabase/functions se excluye del chequeo TypeScript de Expo porque ejecuta Deno;
el handler se prueba por separado. No se empaqueta ni importa en React Native.

## Errores y consistencia
Ante un fallo confirmado del perfil, intenta eliminar solo la cuenta Auth recién creada.
Ante resultado incierto, no borra ni reintenta automáticamente: un administrador debe revisar
Auth y usuarios antes de repetir. Contraseñas y claves no se devuelven ni se registran.
No se usa signUp en el móvil; el administrador conserva su sesión al crear otra cuenta.
La entrega de la contraseña inicial al titular se hace por un canal privado.

## Pruebas sin red ni cuentas reales
```powershell
node scripts/test-management.cjs
node --test scripts/edge-account.test.mjs
```
Después del despliegue, detener el backend de la PWA y comprobar desde el teléfono:
alta de cuenta, conservación de sesión, edición sin perder funciones/carreras,
períodos, rechazo de docente y bloqueo del último administrador.
Probar también la PWA con la app móvil cerrada.

La revisión global móvil conserva errores previos de TypeScript y lint en componentes
ajenos a esta adaptación. No se ha verificado una compilación Android/iOS ni un dispositivo real.

Documentación oficial:
- https://supabase.com/docs/guides/functions/deploy
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/secrets
