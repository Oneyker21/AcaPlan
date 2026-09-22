require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function test() {
    console.log("Attempting to insert user...");
    const { data, error } = await supabase.from('usuarios').insert({
        nombre: 'Administrador Principal',
        correo: 'admin@unan.edu.ni',
        cedula: '000-000000-0000A',
        contrasena: '***',
        rol: 'administrador',
        estado: 'activo'
    }).select();

    if (error) {
        console.error("Insert failed:", error.message);
    } else {
        console.log("Insert success!", data);
    }
}
test();
