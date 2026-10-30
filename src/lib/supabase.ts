import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://gobtehgwtqdrqqwhradh.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvYnRlaGd3dHFkcnFxd2hyYWRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NjU0NTAsImV4cCI6MjEwNzQ0MTQ1MH0.Rsv-0l7SBZR6ri5IWap2Dp2UmSUeulyZWmWpj5_fA1I';

// ── Diagnóstico de configuración ──
console.log('[SUPABASE] URL configurada:', supabaseUrl || '⚠️ VACÍA');
console.log('[SUPABASE] Anon Key presente:', supabaseAnonKey ? `Sí (${supabaseAnonKey.length} chars, empieza con "${supabaseAnonKey.substring(0, 10)}...")` : '⚠️ VACÍA');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[SUPABASE] ❌ FALTAN VARIABLES DE ENTORNO. Verifica tu .env con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

if (supabaseAnonKey && !supabaseAnonKey.startsWith('eyJ')) {
  console.warn('[SUPABASE] ⚠️ La Anon Key NO tiene formato JWT esperado (debería empezar con "eyJ..."). Verifica la clave en Supabase Dashboard → Settings → API.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

console.log('[SUPABASE] ✅ Cliente inicializado correctamente');
