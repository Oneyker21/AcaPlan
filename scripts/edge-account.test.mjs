import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountHandler } from '../supabase/functions/create-account/handler.mjs';
const input={nombre:'Ana',correo:'ANA@example.test',cedula:'123',rol:'docente',password:'test-password'};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const valid=()=>response({id:'actor'});
const request=(data=input,authorization='Bearer user-token')=>new Request('https://example.test/functions/v1/create-account',{method:'POST',headers:{authorization,'Content-Type':'application/json'},body:JSON.stringify(data)});
function setup(responses) {
 const calls=[];
 const handler=createAccountHandler({url:'https://project.supabase.co',key:'public',serviceKey:'private-server-key',fetchImpl:async(url,options)=>{
   calls.push({url,...options});const next=responses.shift();if(next instanceof Error)throw next;
   assert.ok(next,'unexpected request');return next;
 }});
 return {handler,calls};
}
test('Sin token no contacta Supabase',async()=>{
 const {handler,calls}=setup([]);
 assert.equal((await handler(request(input,''))).status,401);assert.equal(calls.length,0);
});
test('Token inválido no permite operaciones privilegiadas',async()=>{
 const {handler,calls}=setup([response({},401)]);
 assert.equal((await handler(request())).status,401);assert.equal(calls.length,1);
});
test('Docente o cuenta inactiva rechazados por permisos de la base',async()=>{
 const {handler,calls}=setup([valid(),response({message:'PERMISO_DENEGADO'},400)]);
 assert.equal((await handler(request())).status,403);assert.equal(calls.length,2);
 assert.ok(calls.every(c=>c.headers.apikey==='public'));
});
test('Alta autorizada separa secreto y contraseña, sin llamadas al backend PWA',async()=>{
 const {handler,calls}=setup([valid(),response({ok:true}),response({id:'new-user'}),response({ok:true,id:5})]);
 const res=await handler(request());assert.equal(res.status,201);
 assert.deepEqual(await res.json(),{ok:true,id:5});
 assert.ok(calls.every(c=>c.url.startsWith('https://project.supabase.co/')));
 assert.equal(calls[2].headers.apikey,'private-server-key');
 assert.equal(calls[3].headers.Authorization,'Bearer user-token');
 assert.equal(calls[3].headers.apikey,'public');
 assert.ok(!calls[3].body.includes('test-password'));
 assert.equal(JSON.parse(calls[2].body).email,'ana@example.test');
});
test('Duplicado o SQL ausente impide crear Auth',async()=>{
 for(const [body,status] of [[{message:'DUPLICADO'},409],[{code:'PGRST202'},503]]){
   const {handler,calls}=setup([valid(),response(body,400)]);
   assert.equal((await handler(request())).status,status);assert.equal(calls.length,2);
 }
});
test('Rechazo confirmado del perfil revierte solo Auth recién creado',async()=>{
 const {handler,calls}=setup([valid(),response({ok:true}),response({id:'new-user'}),response({message:'DATOS_INVALIDOS'},400),response({})]);
 assert.equal((await handler(request())).status,400);
 assert.equal(calls[4].method,'DELETE');assert.ok(calls[4].url.endsWith('/new-user'));
});
test('Error incierto después de crear Auth no elimina el usuario',async()=>{
 const {handler,calls}=setup([valid(),response({ok:true}),response({id:'new-user'}),new Error('network')]);
 assert.equal((await handler(request())).status,503);assert.equal(calls.length,4);
});
test('Validación de contraseña, rol, JSON y tamaño antes del alta',async()=>{
 for(const data of [{...input,password:'x'},{...input,rol:'root'},[],{...input,nombre:'x'.repeat(17000)}]){
   const {handler,calls}=setup([valid()]);
   assert.ok([400,413].includes((await handler(request(data))).status));assert.equal(calls.length,1);
 }
});
test('Métodos y preflight CORS sin operaciones de datos',async()=>{
 const {handler,calls}=setup([]);
 assert.equal((await handler(new Request('https://example.test',{method:'OPTIONS'}))).status,204);
 assert.equal((await handler(new Request('https://example.test'))).status,405);
 assert.equal(calls.length,0);
});
