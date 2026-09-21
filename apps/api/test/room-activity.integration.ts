import assert from 'node:assert/strict';
import {readFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {prisma} from '@roomwave/database';
import {roomActivityRoutes} from '../src/routes/room-activity.ts';
const app=Fastify();await app.register(roomActivityRoutes);const users:string[]=[];let roomId='';
try{
 const seed=randomUUID();const owner=await prisma.user.create({data:{username:'Activity test owner',imvuUserId:seed}});users.push(owner.id);
 const admin=await prisma.user.create({data:{username:'Activity test admin',imvuUserId:seed+'a'}});users.push(admin.id);
 const room=await prisma.room.create({data:{name:'Activity test',members:{create:[{userId:owner.id,role:'OWNER'},{userId:admin.id,role:'ADMIN'}]}}});roomId=room.id;
 const key=(await readFile('.data/custom-commands.key','utf8')).trim();
 const call=(payload:any,auth=true)=>app.inject({url:`/rooms/${roomId}/activity`,method:'POST',headers:auth?{'x-roomwave-bot-key':key}:{},payload});
 assert.equal((await call({action:'read',imvuUserId:seed},false)).statusCode,401);
 assert.equal((await call({action:'save',imvuUserId:seed+'a',enabled:true})).statusCode,403);
 assert.equal((await call({action:'read',imvuUserId:seed})).json().settings.enabled,false);
 assert.equal((await call({action:'save',imvuUserId:seed,enabled:true})).statusCode,200);
 assert.equal((await call({action:'read',imvuUserId:seed})).json().settings.enabled,true);
 assert.equal((await call({action:'record',event:{type:'message',text:'not active room'}})).statusCode,400);
 assert.equal((await call({action:'clear',imvuUserId:seed})).statusCode,200);
 console.log('Activity OWNER checks, opt-in and inactive-room rejection: OK');
}finally{
 if(roomId){await prisma.room.delete({where:{id:roomId}});await rm('.data/room-activity/'+roomId,{recursive:true,force:true});}
 for(const id of users)await prisma.user.delete({where:{id}});
 await app.close();await prisma.$disconnect();
}
