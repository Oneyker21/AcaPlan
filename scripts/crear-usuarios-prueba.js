/**
 * AcaPlan - Script para crear usuarios de prueba de cada rol y rango
 * 
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=tu_clave_secreta node scripts/crear-usuarios-prueba.js
 * 
 * O simplemente ejecuta el archivo SQL directamente en Supabase SQL Editor:
 *   database/12_usuarios_prueba_roles_y_rangos.sql
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Leer variables de .env si existe
const envPath = path.resolve(__dirname, '..', '.env');
const envVars = {};
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...vals] = trimmed.split('=');
      envVars[key.trim()] = vals.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || envVars.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY;

console.log('=====================================================');
console.log('  AcaPlan - Generador de Usuarios de Prueba (Roles y Rangos)');
console.log('=====================================================\n');

if (!supabaseUrl) {
  console.error('❌ Error: Falta EXPO_PUBLIC_SUPABASE_URL en el archivo .env');
  process.exit(1);
}

if (!serviceKey) {
  console.log('ℹ️  No se detectó SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  console.log('👉 Recomendación directa:');
  console.log('   Ejecuta el script SQL en el SQL Editor de tu Dashboard de Supabase:');
  console.log('   📄 database/12_usuarios_prueba_roles_y_rangos.sql\n');
  console.log('   Ese script crea automáticamente en una sola transacción todas las cuentas');
  console.log('   en auth.users, auth.identities, public.usuarios, docentes y tipos.');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEFAULT_PASSWORD = 'AcaPlan2026*';

const USUARIOS_PRUEBA = [
  {
    correo: 'admin.qa@acaplan.edu.ni',
    nombre: 'Administrador General AcaPlan',
    cedula: '001-010180-0001A',
    rol: 'administrador',
    tipo: null,
    especialidad: null,
  },
  {
    correo: 'planificador.qa@acaplan.edu.ni',
    nombre: 'Lic. Carlos Mendoza - Planificador',
    cedula: '001-150582-0002B',
    rol: 'planificacion',
    tipo: null,
    especialidad: null,
  },
  {
    correo: 'coordinador.qa@acaplan.edu.ni',
    nombre: 'Ing. Ana Patricia Ruiz - Coordinadora',
    cedula: '001-200885-0003C',
    rol: 'coordinacion',
    tipo: null,
    especialidad: null,
  },
  {
    correo: 'jefatura.qa@acaplan.edu.ni',
    nombre: 'MSc. Roberto Gómez - Jefe de Departamento',
    cedula: '001-100478-0004D',
    rol: 'jefatura',
    tipo: null,
    especialidad: null,
  },
  {
    correo: 'docente.planta@acaplan.edu.ni',
    nombre: 'Prof. Eduardo Morales (Docente de Planta)',
    cedula: '001-050983-0005E',
    rol: 'docente',
    tipo: 'planta',
    especialidad: 'Ingeniería de Software y Bases de Datos',
  },
  {
    correo: 'docente.horario@acaplan.edu.ni',
    nombre: 'Lic. Lucía Salgado (Docente por Horario)',
    cedula: '001-121288-0006F',
    rol: 'docente',
    tipo: 'horario',
    especialidad: 'Redes y Ciberseguridad',
  },
];

async function main() {
  console.log(`Conectando a Supabase en: ${supabaseUrl}`);

  for (const user of USUARIOS_PRUEBA) {
    process.stdout.write(`Creando usuario [${user.rol}] ${user.correo}... `);

    // 1. Crear o actualizar en Auth
    let authUser = null;
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email: user.correo,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { nombre: user.nombre },
    });

    if (createError) {
      if (createError.message.includes('already registered') || createError.code === 'email_exists') {
        const { data: listData } = await supabase.auth.admin.listUsers();
        authUser = listData?.users.find((u) => u.email?.toLowerCase() === user.correo.toLowerCase());
        if (authUser) {
          await supabase.auth.admin.updateUserById(authUser.id, {
            password: DEFAULT_PASSWORD,
            email_confirm: true,
          });
        }
      } else {
        console.error(`❌ Error Auth: ${createError.message}`);
        continue;
      }
    } else {
      authUser = createData.user;
    }

    if (!authUser) {
      console.error('❌ No se pudo obtener el authUser');
      continue;
    }

    // 2. Upsert en public.usuarios
    const { data: dbUser, error: dbError } = await supabase
      .from('usuarios')
      .upsert(
        {
          auth_user_id: authUser.id,
          nombre: user.nombre,
          correo: user.correo,
          cedula: user.cedula,
          rol: user.rol,
          estado: 'activo',
        },
        { onConflict: 'correo' }
      )
      .select('id_usuario')
      .single();

    if (dbError) {
      console.error(`❌ Error public.usuarios: ${dbError.message}`);
      continue;
    }

    // 3. Si es docente, upsert en docentes y tipo
    if (user.rol === 'docente' || user.tipo) {
      await supabase
        .from('docentes')
        .upsert(
          {
            id_docente: dbUser.id_usuario,
            especialidad: user.especialidad || 'General',
          },
          { onConflict: 'id_docente' }
        );

      if (user.tipo) {
        await supabase
          .from('pwa_docente_tipo')
          .upsert(
            {
              id_docente: dbUser.id_usuario,
              tipo_docente: user.tipo,
            },
            { onConflict: 'id_docente' }
          );
      }
    }

    console.log(`✅ OK (ID: ${dbUser.id_usuario})`);
  }

  console.log('\n🎉 ¡Proceso completado exitosamente!');
  console.log(`Contraseña para todos: ${DEFAULT_PASSWORD}`);
}

main().catch((err) => {
  console.error('Error general:', err);
  process.exit(1);
});
