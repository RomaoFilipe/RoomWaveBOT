import {recordActivity} from "../../../tools/room-activity.mjs";
import assert from 'node:assert/strict';
import {readFile,rm} from 'node:fs/promises';
import Fastify from 'fastify';
import {prisma} from '@roomwave/database';
import {securityRoutes} from '../src/routes/security.ts';
import {roomActivityRoutes} from '../src/routes/room-activity.ts';
const app=Fastify();await app.register(securityRoutes);await app.register(roomActivityRoutes);
const users:string[]=[],rooms:string[]=[];const original=globalThis.fetch;const cid=String(Date.now());
try{
 const owner=await prisma.user.create({data:{username:'Security owner',imvuUserId:cid}});users.push(owner.id);
 const admin=await prisma.user.create({data:{username:'Security admin',imvuUserId:cid+'a'}});users.push(admin.id);
 for(const n of [1,2]){const room=await prisma.room.create({data:{name:'Security test',imvuRoomId:cid+'-'+n,members:{create:[{userId:owner.id,role:'OWNER'},{userId:admin.id,role:'ADMIN'}]}}});rooms.push(room.id);}
 globalThis.fetch=async(input)=>{
  const url=String(input);if(url.includes('/room/room-')){const number=url.endsWith('-2')?2:1;return Response.json({status:'success',denormalized:{[url]:{data:{name:'Verified room',customers_id:cid,customers_room_id:number,owner_avatarname:'Owner'}}}});}
  if(url.includes('/user/user-12345'))return Response.json({status:'success',denormalized:{[url]:{data:{legacy_cid:12345,username:'Watched'}}}});
  throw new Error('Unexpected fetch');
 };
 // Ownership comparison must use the actual owner CID, not a local OWNER role.
 const key=(await readFile('.data/custom-commands.key','utf8')).trim();
 const call=(payload:any,auth=true)=>app.inject({url:'/security',method:'POST',headers:auth?{'x-roomwave-bot-key':key}:{},payload:{managementRoomId:rooms[0],imvuUserId:cid,roomId:rooms[0],...payload}});
 assert.equal((await call({action:'view'},false)).statusCode,401);
 assert.equal((await call({action:'view',imvuUserId:cid+'a'})).statusCode,403);
 assert.equal((await call({action:'view'})).json().room.ownerId,cid);
 assert.equal((await call({action:'monitor',enabled:true})).statusCode,200);
 assert.equal((await call({action:'watch',query:'12345',note:'Test note'})).statusCode,200);
 assert.equal((await call({action:'view'})).json().people[0].id,'12345');
 await recordActivity(rooms[0],{type:'join',userId:'12345',name:'Watched'});
 assert.equal((await call({action:'view'})).json().events[0].highlighted,true);
 assert.equal((await call({action:'view',roomId:rooms[1]})).json().people.length,0);
 assert.equal((await call({action:'snapshot',participants:[]})).statusCode,400);
 assert.equal((await call({action:'unwatch',query:'12345'})).json().people.length,0);
 const impostor=await prisma.user.create({data:{username:'Local owner only',imvuUserId:cid+'9'}});users.push(impostor.id);
 await prisma.roomMember.create({data:{roomId:rooms[0],userId:impostor.id,role:'OWNER'}});
 assert.equal((await call({action:'monitor',imvuUserId:impostor.imvuUserId,enabled:true})).statusCode,403);
 const denied=await app.inject({url:`/rooms/${rooms[0]}/activity`,method:'POST',headers:{'x-roomwave-bot-key':key},payload:{action:'save',imvuUserId:impostor.imvuUserId,enabled:true}});assert.equal(denied.statusCode,403);
 console.log('Security: real ownership, local-role rejection, opt-in, person isolation and access checks OK');
}finally{
 globalThis.fetch=original;
 for(const id of rooms){await prisma.room.delete({where:{id}});await rm('.data/room-activity/'+id,{recursive:true,force:true});await rm('.data/room-security/'+id+'.json',{force:true});}
 for(const id of users)await prisma.user.delete({where:{id}});
 await app.close();await prisma.$disconnect();
}
