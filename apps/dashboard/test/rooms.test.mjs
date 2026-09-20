import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImvuRoom } from '../../../tools/room-runtime.mjs';
import { createRoomController } from '../room-controller.mjs';
const previous={roomId:'old',imvuRoomId:'1-2',roomUrl:'https://go.imvu.com/chat/room-1-2'};
const target={roomId:'new',imvuRoomId:'3-4',roomUrl:'https://go.imvu.com/chat/room-3-4'};
function fixture(fail=false,operation=null){
 const events=[];let saved=previous;
 const deps={
  saveActive:async r=>{saved=r;events.push('save:'+r.roomId)},onActive:()=>{},
  saveOperation:async()=>{},states:async()=>({bot:true,player:true}),
  control:async action=>{events.push(action)},stopAudio:async()=>{events.push('stop-audio')},
  release:async id=>{events.push('release:'+id)},waitJoined:async r=>{events.push('joined:'+r.roomId);if(fail&&r.roomId==='new')throw new Error('ROOM_JOIN_TIMEOUT')},
 };
 return {events,controller:createRoomController(deps,previous,operation),saved:()=>saved};
}
async function settled(controller){for(let i=0;i<100&&controller.switching;i++)await new Promise(r=>setTimeout(r,1));assert.equal(controller.switching,false);}
test('canonical IMVU links only; mismatch and arbitrary navigation rejected',()=>{
 for(const value of ['123-456','https://go.imvu.com/chat/room-123-456','https://pt.imvu.com/next/chat/room-123-456/'])assert.deepEqual(normalizeImvuRoom(value),{imvuRoomId:'123-456',roomUrl:'https://go.imvu.com/chat/room-123-456'});
 for(const value of ['https://evil.test/chat/room-123-456','https://go.imvu.com.evil.test/chat/room-123-456','http://go.imvu.com/chat/room-123-456','https://user:pass@go.imvu.com/chat/room-123-456','abc','123','https://go.imvu.com/login'])assert.throws(()=>normalizeImvuRoom(value));
});
test('switch stops old player, preserves queue and waits for room before starting new player',async()=>{
 const {controller,events,saved}=fixture();await controller.begin(target);await settled(controller);
 assert.equal(controller.operation.status,'done');assert.equal(saved().roomId,'new');
 assert.deepEqual(events,['stop','stop-audio','release:old','save:new','start-bot','joined:new','start-player']);
});
test('failed entry restores previous room before resuming old player',async()=>{
 const {controller,events,saved}=fixture(true);await controller.begin(target);await settled(controller);
 assert.equal(controller.operation.status,'failed');assert.equal(controller.operation.error,'ROOM_JOIN_TIMEOUT');assert.equal(saved().roomId,'old');
 assert.ok(events.indexOf('save:old')>events.indexOf('joined:new'));
 assert.ok(events.indexOf('start-player')>events.indexOf('joined:old'));
});
test('simultaneous room switches are rejected',async()=>{
 const {controller}=fixture();const first=controller.begin(target);await assert.rejects(controller.begin(target),/IN_PROGRESS/);await first;await settled(controller);
});
test('restart during a switch recovers the saved prior room',async()=>{
 const operation={status:'switching',phase:'joining',target,previous,previousBot:true,previousPlayer:true};
 const {controller,events}=fixture(false,operation);await controller.recover();
 assert.equal(controller.operation.error,'ROOM_SWITCH_INTERRUPTED');assert.deepEqual(events,['stop','stop-audio','save:old','start-bot','joined:old','start-player']);
});
test('failed recovery leaves both room services stopped',async()=>{
 const events=[];
 const deps={saveActive:async()=>{},saveOperation:async()=>{},onActive:()=>{},states:async()=>({bot:true,player:true}),control:async a=>{events.push(a)},stopAudio:async()=>{},release:async()=>{},waitJoined:async()=>{throw new Error('ROOM_JOIN_TIMEOUT')}};
 const controller=createRoomController(deps,previous);await controller.begin(target);await settled(controller);
 assert.equal(controller.operation.error,'ROOM_RECOVERY_FAILED');assert.equal(events.at(-1),'stop');assert.equal(events.includes('start-player'),false);
});
