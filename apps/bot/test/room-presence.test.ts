import {test} from 'node:test';
import assert from 'node:assert/strict';
import {presenceCommand} from '../src/commands/room-presence.ts';
import {setPresenceReader} from '../src/imvu/presence.ts';
import {canRunCommand} from '../src/imvu/permissions.ts';
test('presence commands restrict access and distinguish current presence from historical observations',async()=>{
 const original=globalThis.fetch,room=process.env.ROOMWAVE_ROOM_ID;process.env.ROOMWAVE_ROOM_ID='test';let role='ADMIN';
 try{
 globalThis.fetch=async (url)=>{
  if(String(url).includes('imvu-members/ensure'))return Response.json({role});
  if(String(url).includes('/user/user-12345'))return Response.json({status:'success',denormalized:{'https://api.imvu.com/user/user-12345':{data:{legacy_cid:12345,username:'Tester'}}}});
  if(String(url).endsWith('/activity'))return Response.json({settings:{enabled:true},events:[{userId:'123456',type:'join',time:'2026-09-21T10:00:00Z'},{userId:'12345',type:'leave',time:'2026-09-21T09:00:00Z'}]});
  throw new Error('Unexpected fetch');
 };
 assert.equal(canRunCommand('ADMIN','!onde 12345'),false);
 assert.equal(canRunCommand('OWNER','!historico 12345'),true);
 assert.match(await presenceCommand('onde','12345','1'),/Só o dono/);
 role='OWNER';setPresenceReader(async id=>id==='12345');
 assert.match(await presenceCommand('onde','12345','1'),/confirmado agora/);
 setPresenceReader(async()=>false);assert.match(await presenceCommand('onde','12345','1'),/não consta nesta sala/);
 const history=await presenceCommand('historico','12345','1');assert.match(history,/Saiu/);assert.doesNotMatch(history,/Entrou:/);assert.match(history,/não indicam a localização atual/);
 setPresenceReader(null);assert.match(await presenceCommand('onde','12345','1'),/Não foi possível confirmar/);
 }finally{globalThis.fetch=original;setPresenceReader(null);if(room===undefined)delete process.env.ROOMWAVE_ROOM_ID;else process.env.ROOMWAVE_ROOM_ID=room;}
});
