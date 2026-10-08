/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const calls = [];
let rpcData;
let invoked;
let invokeError = null;
const supabase = {
  functions: { invoke: async (name, options) => { invoked = { name, ...options }; return { data: { ok: true }, error: invokeError }; } },
  rpc(action, args) { calls.push({ action, args }); return { abortSignal: async () => ({ data: rpcData, error: null }) }; },
  auth: { getSession: async () => ({ data: { session: { access_token: 'session-test' } }, error: null }) },
};
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/services/management.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

const context = { exports: {}, require: () => ({ supabase }), process: { env: {} }, AbortController, setTimeout, clearTimeout,
  fetch: () => { throw new Error('El móvil no debe llamar al backend de la PWA'); },
};
vm.runInNewContext(code, context);
const api = context.exports;
(async () => {
  rpcData = [];
  await api.listAccounts();
  assert.equal(calls.at(-1).args.action, 'accounts.list');
  rpcData = [{ id_usuario: 7, nombre: 'Docente', cedula: 'ABC', correo: 'docente@example.test', rol: 'docente', estado: 'activo', funciones: ['coordinador'], carreras: [3] }];
  await api.updateAccount(7, { nombre: 'Nombre nuevo' });
  const payload = calls.at(-1).args.payload;
  assert.equal(payload.nombre, 'Nombre nuevo');
  assert.equal(payload.estado, 'activo');
  assert.equal(payload.funciones[0], 'coordinador');
  assert.equal(payload.carreras[0], 3);
  calls.length = 0;
  await api.activatePeriod(4, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.action, 'periods.activate');
  assert.equal(calls[0].args.payload.active, true);
  assert.throws(() => api.savePeriod({ nombre: 'I', ano_lectivo: 2026, fecha_inicio: '2026-02-30', fecha_fin: '2026-06-01' }));
  assert.throws(() => api.savePeriod({ nombre: 'I', ano_lectivo: 2026.5, fecha_inicio: '2026-02-01', fecha_fin: '2026-06-01' }));
  const input = { nombre: 'Nueva', cedula: 'XYZ', rol: 'docente', correo: 'new@example.test', password: 'test-only-password' };
  await api.createAccount(input);
  assert.equal(invoked.name, 'create-account');
  assert.equal(invoked.body.password, input.password);
  assert.equal(invoked.body.correo, input.correo);
  invokeError = { context: { status: 403, json: async () => ({ error: 'Sin permiso' }) } };
  await assert.rejects(api.createAccount(input), /Sin permiso/);
  invokeError = { context: { status: 404, json: async () => ({}) } };
  await assert.rejects(api.createAccount(input), /desplegar/);
  console.log('OK: RPC, conservación de permisos, activación única y alta por Edge Function sin backend PWA.');

})().catch(error => { console.error(error); process.exitCode = 1; });
