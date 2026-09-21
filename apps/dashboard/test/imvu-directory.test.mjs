import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lookupUser,lookupRoom} from '../../../tools/imvu-directory.mjs';
test('directory validates inputs, exact identities, public projection and cache',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
 globalThis.fetch=async url=>{
  calls++;const parsed=new URL(url);assert.equal(parsed.origin,'https://api.imvu.com');
  if(parsed.pathname==='/user')return Response.json({status:'success',id:String(url),denormalized:{[String(url)]:{data:{items:['https://api.imvu.com/user/user-123']}},'https://api.imvu.com/user/user-123':{data:{username:'Tester'}}}});
  if(parsed.pathname==='/user/user-123')return Response.json({status:'success',denormalized:{[String(url)]:{data:{legacy_cid:123,username:'Tester',display_name:'<script>test</script>',email:'private',online:true},relations:{current_room:'private'}}}});
  if(parsed.pathname==='/user/user-999')return new Response(null,{status:403});
  if(parsed.pathname==='/room/room-123-456')return Response.json({status:'success',denormalized:{[String(url)]:{data:{name:'Room',customers_id:123,customers_room_id:456,occupancy:2,capacity:10}}}});
  throw new Error('Unexpected URL');
 };
 const user=await lookupUser('Tester');assert.equal(user.id,'123');assert.equal(user.username,'Tester');assert.equal('email' in user,false);assert.equal('online' in user,false);assert.equal('current_room' in user,false);
 const count=calls;await lookupUser('https://www.imvu.com/next/av/123/');assert.equal(calls,count);
 assert.equal((await lookupRoom('https://go.imvu.com/chat/room-123-456')).id,'123-456');
 await assert.rejects(lookupUser('someone-else'),/INVALID_IMVU_USER/);
 await assert.rejects(lookupUser('http://127.0.0.1/'),/INVALID_IMVU_USER/);
 await assert.rejects(lookupRoom('https://evil.test/chat/room-123-456'),/INVALID_IMVU_ROOM/);
 await assert.rejects(lookupUser('999'),/IMVU_RESTRICTED/);
 }finally{globalThis.fetch=original;}
});
