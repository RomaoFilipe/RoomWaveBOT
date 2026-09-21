import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFunEngine} from '../src/commands/fun.js';
import {helpCommand} from '../src/commands/help.js';

test('games: consent, concurrency, persistent room scores, one attempt and expiry',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'roomwave-games-'));let now=1000000;
 const actor={id:'1',name:'Alice'},bob={id:'2',name:'Bob'},eve={id:'3',name:'Eve'};
 let calls=0;const deps={directory,now:()=>now,random:(_max:number)=>0,target:async()=>({id:'2',name:'Bob'}),dedicate:async(q:string,id:string)=>{calls++;assert.equal(q,'Ghost - Mary');assert.equal(id,'1');return '🎵 ADICIONADO À FILA';}};
 let run=createFunEngine(deps);
 const send=async(c:string,a='',who=actor,room='room-1')=>{now+=2100;return run(room,c,a,who);};
 try{
  assert.match(await send('duelo','@Bob'),/!aceitar/);
  assert.match(await send('aceitar','',eve),/Só a pessoa convidada/);
  assert.match(await send('recusar','',bob),/recusou/);
  assert.match(await send('aceitar','',bob),/Não há convite/);
  await send('quiz');
  assert.match(await send('responder','Porto',bob),/não é essa/);
  assert.match(await send('responder','Lisboa',bob),/Já respondeste/);
  now+=2100;
  const results=await Promise.all([run('room-1','responder','Lisboa',actor),run('room-1','responder','Lisboa',eve)]);
  assert.equal(results.filter(s=>s.includes('+5 pontos')).length,1);
  run=createFunEngine(deps);
  assert.match(await send('top'),/Alice — 5 pontos/);
  assert.match(await send('top','',actor,'room-2'),/Ainda não há pontos/);
  now+=61000;await send('quiz');now+=91000;
  assert.match(await send('responder','Lisboa'),/Não há pergunta ativa/);
  assert.match(await send('dedicar','@Bob Ghost - Mary'),/Alice dedica esta música a Bob/);
  assert.equal(calls,1);
  assert.match(await run('room-1','dedicar','@Bob Ghost - Mary',actor),/Espera 2 segundos/);
  assert.equal(calls,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('polls: one vote per identity, creator-only closing, deadline and room isolation',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'roomwave-polls-'));let now=1000000;
 const run=createFunEngine({directory,now:()=>now,random:()=>0,target:async()=>({id:'2',name:'Bob'}),dedicate:async()=>''});
 const send=async(c:string,a='',id='1',role='USER',room='room-1')=>{now+=2100;return run(room,c,a,{id,name:`User${id}`,role});};
 try{
  assert.match(await send('votar','Cor? | azul | azul'),/distintas/);
  assert.match(await send('votar','Cor? | azul | verde'),/!voto/);
  await send('voto','1');await send('voto','2');
  assert.match(await send('resultado'),/azul — 0 votos\n2. verde — 1 votos/);
  assert.match(await send('resultado','fechar','2'),/Só quem criou/);
  assert.match(await send('resultado','','2','USER','room-2'),/Ainda não há/);
  assert.match(await send('resultado','fechar','2','OWNER'),/encerrada/);
  assert.match(await send('voto','1'),/Não há votação ativa/);
  now+=61000;await send('votar','Cor? | azul | verde');now+=121000;
  assert.match(await send('voto','1'),/Não há votação ativa/);
  assert.match(await send('resultado'),/encerrada/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('duel winner scores only once and expired invitation cannot be accepted',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'roomwave-duel-'));let now=1000000,index=0;
 const run=createFunEngine({directory,now:()=>now,random:()=>[1,0][index++]!,target:async()=>({id:'2',name:'Bob'}),dedicate:async()=>''});
 const send=async(c:string,a='',id='1')=>{now+=2100;return run('room-1',c,a,{id,name:id==='1'?'Alice':'Bob'});};
 try{
  await send('duelo','Bob');assert.match(await send('aceitar','','2'),/Alice venceu/);
  assert.match(await send('aceitar','','2'),/Não há convite/);
  assert.match(await send('top'),/Alice — 3 pontos/);
  now+=61000;await send('duelo','Bob');now+=121000;
  assert.match(await send('aceitar','','2'),/Não há convite/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('help uses short categories and tolerates unknown names',()=>{
 assert.match(helpCommand(),/!help jogos/);
 assert.match(helpCommand('música'),/!dedicar/);
 assert.match(helpCommand('jogos'),/!responder/);
 assert.doesNotThrow(()=>helpCommand('__proto__'));
});
