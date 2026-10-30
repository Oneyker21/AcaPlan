# AcaPlan: aplicación móvil

AcaPlan es una aplicación móvil para apoyar la gestión y consulta de horarios académicos de la UNAN-Managua, CUR-Chontales. Este repositorio contiene la aplicación móvil; la PWA es un proyecto independiente.

La aplicación está desarrollada con React Native, Expo y TypeScript. Utiliza Expo Router para la navegación y Supabase para la autenticación y el acceso a datos.

## Generación de horarios

La app incluye una opción para **completar automáticamente una propuesta de horario** desde la pantalla de borradores. La pantalla solicita la generación a la función `generate_schedule_draft`, definida en la migración de Supabase `20261014000000_sprint5_generation_sharing_consultation.sql`; la búsqueda se ejecuta en la base de datos.

La función busca combinaciones de bloques y aulas para las sesiones oficiales pendientes. Considera datos como docentes asignados, duración, turno, capacidad, sede y recursos del aula, además de las comprobaciones aplicadas al guardar. Conserva las sesiones ya ubicadas y devuelve las que no pudo colocar, junto con el resultado de validación.

La implementación revisada realiza una búsqueda ordenada de candidatos con un límite de intentos; no se identificó en ella un modelo de IA ni OR-Tools. Puede dejar sesiones pendientes y no garantiza encontrar la mejor solución. La propuesta permanece como borrador y debe revisarse y validarse antes de compartirla o publicarla. Su funcionamiento real depende de la configuración de Supabase, los permisos y los datos disponibles; esta descripción se basa en la revisión del código, no en una prueba con datos reales.

## Requisitos

- Node.js y npm instalados.
- Un dispositivo con Expo Go o un emulador compatible para ejecutar la aplicación.
- Acceso al proyecto de Supabase que el equipo haya designado para la aplicación móvil y a sus credenciales públicas.

## Instalación y configuración

Desde una terminal abierta en la carpeta del proyecto móvil:

1. Instala las dependencias:

   ```powershell
   npm install
   ```

2. Si todavía no existe el archivo `.env`, crea una copia de la plantilla:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Abre `.env` y completa las variables `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` con la URL y la clave pública del proyecto Supabase correspondiente. Solicita estos datos al equipo si no los tienes.

Las variables `EXPO_PUBLIC_` están disponibles en la aplicación cliente. No coloques allí la clave `service_role`, claves secretas ni contraseñas. No subas el archivo `.env` al repositorio.

La configuración del esquema, las migraciones, la primera cuenta administradora y la función de administración se documentan en [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Antes de ejecutar cualquier script, verifica con el equipo a qué proyecto de Supabase apunta y si corresponde aplicarlo; una base existente puede contener datos de otras aplicaciones.

## Ejecutar la aplicación

```powershell
npm start
```

Expo mostrará las opciones disponibles para abrir la aplicación. Puedes escanear el código QR con Expo Go o utilizar un emulador configurado. El proyecto también ofrece:

```powershell
npm run android
npm run ios
npm run web
```

La disponibilidad de cada opción depende del sistema y del entorno configurado. Algunas funciones o dependencias nativas pueden requerir una compilación de desarrollo en lugar de Expo Go.

## Organización del proyecto

- `src/app/`: rutas y pantallas de Expo Router.
- `src/components/`: componentes y vistas utilizadas por la aplicación.
- `src/context/`: contexto de autenticación.
- `src/lib/`: configuración del cliente de Supabase.
- `src/types/`: tipos utilizados por el proyecto.
- `assets/`: imágenes y recursos visuales.
- `supabase/`: migraciones y funciones de Supabase del proyecto móvil.
- `paquete_postgresql_completo/`: documentación y scripts de apoyo para la base de datos.

## Comprobaciones

Para revisar el código y los tipos:

```powershell
npm run lint
npx tsc --noEmit
```

Si `npm install` muestra vulnerabilidades, consulta los detalles con `npm audit` antes de actualizar dependencias. Evita aplicar cambios incompatibles automáticamente sin revisar cómo afectan al proyecto.

## Colaboración

Antes de empezar, verifica que estés trabajando en la rama acordada y descarga los cambios del equipo. No compartas credenciales ni subas archivos de entorno al repositorio. Consulta con el equipo antes de modificar la configuración o ejecutar migraciones sobre una base compartida.
