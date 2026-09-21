import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createModerationHandler} from '../src/imvu/moderation.js';
import {moderationAuthority} from '../../../tools/imvu-moderation.mjs';
function fixture(overrides:any={}){
 let now=10000;const records:any[]=[],sent:string[]=[];
 const deps={authority:async()=>({ownerId:'1',moderators:['2']}),target:async(name:string)=>({id:name==='visitor'?'4':name,name}),present:async()=>true,current:async()=>true,audit:async(body:any)=>{records.push(body);return {};},send:async(text:string)=>{sent.push(text);return 'CHAT_ECHO' as const;},roomId:'test-room',botId:'3',now:()=>now,...overrides};
 return {run:createModerationHandler(deps),deps,records,sent,advance:()=>now+=5001};
}
const owner={id:'1',name:'Owner'},mod={id:'2',name:'Mod'};
test('IMVU permission and public-room gates: no side effects for private/nonstaff/protected/absent',async()=>{
 const f=fixture();assert.equal(await f.run('avisar','visitor motivo',owner,false),null);
 assert.match((await f.run('avisar','visitor motivo',{id:'5',name:'Local ADMIN'},true))!,/Só o dono/);
 for(const target of ['1','2','3']){f.advance();assert.match((await f.run('avisar',target+' motivo',owner,true))!,/Não posso atuar/);}
 assert.equal(f.records.length,0);assert.equal(f.sent.length,0);
 const absent=fixture({present:async()=>false});assert.match((await absent.run('avisar','visitor motivo',owner,true))!,/não consta/);
 assert.equal(absent.records.length,0);
 const failure=fixture({authority:async()=>{throw new Error('API failure');}});await failure.run('avisar','visitor motivo',owner,true);assert.equal(failure.records.length,0);
});
test('warn confirmation, cooldown, native kick disabled, and IMVU moderators accepted',async()=>{
 const f=fixture();assert.equal(await f.run('avisar','visitor respeita a sala',mod,true),null);
 assert.equal(f.records[0].operation,'start');assert.equal(f.records[1].status,'CONFIRMED');assert.equal(f.records[1].resultCode,'CHAT_ECHO');assert.equal(f.sent.length,1);
 assert.match((await f.run('avisar','visitor motivo',mod,true))!,/5 segundos/);assert.equal(f.sent.length,1);
 f.advance();assert.match((await f.run('expulsar','visitor motivo',mod,true))!,/não tem permissão/);assert.equal(f.sent.length,1);assert.equal(f.records.at(-1).resultCode,'KICK_PREFLIGHT_FAILED');
 const capable=fixture({authority:async()=>({ownerId:'1',moderators:['2','3']})});assert.match((await capable.run('expulsar','visitor motivo',owner,true))!,/indisponível/);assert.equal(capable.sent.length,0);
});
test('timeouts, send failure, room changes, audit failure never claim success or resend',async()=>{
 for(const result of ['ECHO_TIMEOUT','SEND_FAILED','ROOM_CHANGED']){
  const f=fixture({send:async()=>result});await f.run('avisar','visitor motivo',owner,true);
  assert.equal(f.records.at(-1).status,result==='ECHO_TIMEOUT'?'UNCONFIRMED':'FAILED');
 }
 let checks=0;const changed=fixture({current:async()=>++checks<3});await changed.run('avisar','visitor motivo',owner,true);assert.equal(changed.sent.length,0);assert.equal(changed.records.at(-1).resultCode,'ROOM_CHANGED');
 const unavailable=fixture({audit:async()=>{throw new Error('DB offline');}});await unavailable.run('avisar','visitor motivo',owner,true);assert.equal(unavailable.sent.length,0);
});
test('duplicate concurrent requests cannot publish twice',async()=>{
 const f=fixture();await Promise.all([f.run('avisar','visitor motivo',owner,true),f.run('avisar','visitor motivo',owner,true)]);assert.equal(f.sent.length,1);
});
test('authority parser uses exact room and complete moderator collection; malformed data denies',async()=>{
 const base='https://api.imvu.com/room/room-1-2';
 const get=async(url:string)=>({denormalized:{[url]:url===base?{data:{customers_id:1,customers_room_id:2}}:{data:{items:[url+'/user-3']},relations:{}}}});
 assert.deepEqual(await moderationAuthority('1-2',get),{ownerId:'1',moderators:['3']});
 await assert.rejects(()=>moderationAuthority('1-2',async()=>({})),/UNAVAILABLE/);
 await assert.rejects(()=>moderationAuthority('1-2',async(url:string)=>url===base?get(url):{denormalized:{[url]:{data:{items:[]},relations:{next:'more'}}}}),/UNAVAILABLE/);
});
test('native kick confirmation and uncertainty are audited truthfully',async()=>{
 for(const result of ['KICK_CONFIRMED','KICK_UNCONFIRMED','KICK_REJECTED'] as const){
  let kicks=0;const f=fixture({authority:async()=>({ownerId:'1',moderators:['2','3']}),kick:async(actor:string,target:string)=>{assert.equal(actor,'1');assert.equal(target,'4');kicks++;return result;}});
  const reply=await f.run('expulsar','visitor motivo',owner,true);
  assert.equal(kicks,1);assert.equal(f.records.at(-1).status,result==='KICK_CONFIRMED'?'CONFIRMED':result==='KICK_UNCONFIRMED'?'UNCONFIRMED':'FAILED');
  assert.equal(reply!.includes('✅'),result==='KICK_CONFIRMED');assert.equal(f.sent.length,0);
 }
});
