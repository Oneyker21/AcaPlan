import { createAccountHandler } from './handler.mjs';

function defaultKey(name: string): string {
  try { return JSON.parse(Deno.env.get(name) || '{}').default || ''; }
  catch { return ''; }
}
Deno.serve(createAccountHandler({
  url: Deno.env.get('SUPABASE_URL') || '',
  key: Deno.env.get('SUPABASE_ANON_KEY') || defaultKey('SUPABASE_PUBLISHABLE_KEYS'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || defaultKey('SUPABASE_SECRET_KEYS'),
}));
