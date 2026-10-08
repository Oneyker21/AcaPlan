// Código de servidor para Supabase Edge Runtime. No se importa en React Native.
class HttpError extends Error {
  constructor(status, message, uncertain = false) { super(message); this.status = status; this.uncertain = uncertain; }
}
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};
function inputFields(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Formulario no válido.');
  const result = {};
  for (const [name, max] of [['nombre',100],['correo',100],['cedula',20]]) {
    if (typeof data[name] !== 'string' || !data[name].trim() || data[name].trim().length > max)
      throw new HttpError(400, 'Revisa nombre, correo y cédula.');
    result[name] = data[name].trim();
  }
  result.correo = result.correo.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.correo)) throw new HttpError(400, 'Correo no válido.');
  if (!['administrador','docente'].includes(data.rol)) throw new HttpError(400, 'Rol no válido.');
  if (typeof data.password !== 'string' || data.password.length < 8 || data.password.length > 128)
    throw new HttpError(400, 'La contraseña debe tener entre 8 y 128 caracteres.');
  return { ...result, rol: data.rol, password: data.password, estado: 'activo', funciones: [], carreras: [] };
}
async function readBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Se requiere JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Falta el formulario.');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) { await reader.cancel(); throw new HttpError(413, 'Formulario demasiado grande.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpError(400, 'JSON no válido.'); }
}
export function createAccountHandler({ url, key, serviceKey, fetchImpl = fetch }) {
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: cors });
  async function call(path, headers, body, method = 'POST') {
    try {
      const response = await fetchImpl(url + path, {
        method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      });
      return { response, data: await response.json().catch(() => null) };
    } catch { throw new HttpError(503, 'No se pudo confirmar la operación. Revisa las cuentas antes de reintentar.', true); }
  }
  async function rpc(headers, action, payload) {
    const { response, data } = await call('/rest/v1/rpc/pwa_sprint1', headers, { action, payload });
    if (response.ok && data !== null) return data;
    const known = {
      PERMISO_DENEGADO: [403, 'Solo un administrador activo puede crear cuentas.'],
      DUPLICADO: [409, 'El correo o la cédula ya están registrados.'],
      DATOS_INVALIDOS: [400, 'Revisa los datos de la cuenta.'],
      AUTH_NO_EXISTE: [409, 'No se encontró la cuenta de autenticación.'],
    };
    if (known[data?.message]) throw new HttpError(...known[data.message]);
    if (data?.code === '23505') throw new HttpError(409, 'El correo o la cédula ya están registrados.');
    if (data?.code === 'PGRST202') throw new HttpError(503, 'Falta aplicar el SQL del Sprint 1.');
    if (data?.code === '42501') throw new HttpError(403, 'No tienes permiso para crear cuentas.');
    throw new HttpError(503, 'No se pudo confirmar el perfil. Revisa Supabase antes de reintentar.', true);
  }
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { error: 'Método no permitido.' });
    try {
      const authorization = request.headers.get('authorization') || '';
      if (!/^Bearer [^\s]+$/.test(authorization)) throw new HttpError(401, 'Inicia sesión para continuar.');
      if (!url || !key || !serviceKey) throw new HttpError(503, 'Falta configurar la función en Supabase.');
      const userHeaders = { apikey: key, Authorization: authorization, 'Content-Type': 'application/json' };
      const auth = await call('/auth/v1/user', userHeaders, undefined, 'GET');
      if ([401,403].includes(auth.response.status)) throw new HttpError(401, 'La sesión no es válida.');
      if (!auth.response.ok || !auth.data?.id) throw new HttpError(503, 'No se pudo comprobar la sesión.');
      const input = inputFields(await readBody(request));
      // La RPC comprueba auth.uid(), perfil activo y rol. Ningún rol del cliente autoriza el alta.
      await rpc(userHeaders, 'accounts.check', { correo: input.correo, cedula: input.cedula });
      const adminHeaders = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
      const created = await call('/auth/v1/admin/users', adminHeaders, { email: input.correo, password: input.password, email_confirm: true });
      if (!created.response.ok) throw new HttpError(created.response.status >= 500 ? 503 : 409, 'No se pudo crear la cuenta Auth. Revisa correo, contraseña y configuración.');
      const id = created.data?.id || created.data?.user?.id;
      if (!id) throw new HttpError(503, 'No se pudo confirmar la cuenta creada. Revisa Supabase.', true);
      const { password: _password, ...profile } = input;
      try { return reply(201, await rpc(userHeaders, 'accounts.create', profile)); }
      catch (error) {
        // Si el commit pudo completarse, NO eliminar Auth ni reintentar automáticamente.
        if (error.uncertain) throw error;
        try {
          const cleanup = await call('/auth/v1/admin/users/' + encodeURIComponent(id), adminHeaders, undefined, 'DELETE');
          if (!cleanup.response.ok) throw new Error('cleanup');
        } catch { throw new HttpError(503, 'La cuenta Auth fue creada, pero no se pudo confirmar su perfil. Un administrador debe revisarla en Supabase.'); }
        throw error;
      }
    } catch (error) {
      return reply(error instanceof HttpError ? error.status : 503, { error: error instanceof HttpError ? error.message : 'No se pudo completar la operación.' });
    }
  };
}
