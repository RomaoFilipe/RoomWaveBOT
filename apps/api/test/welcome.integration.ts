import assert from 'node:assert/strict';
import {readFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {prisma} from '@roomwave/database';
import {welcomeRoutes} from '../src/routes/welcome.ts';
const app=Fastify();await app.register(welcomeRoutes);const rooms:string[]=[],users:string[]=[];
try{
 const seed=randomUUID();
 const owner=await prisma.user.create({data:{username:'Welcome owner',imvuUserId:seed}});users.push(owner.id);
 const admin=await prisma.user.create({data:{username:'Welcome admin',imvuUserId:seed+'a'}});users.push(admin.id);
 for(let i=0;i<2;i++){const room=await prisma.room.create({data:{name:'Welcome test',members:{create:[{userId:owner.id,role:'OWNER'},{userId:admin.id,role:'ADMIN'}]}}});rooms.push(room.id);}
 const key=(await readFile('.data/custom-commands.key','utf8')).trim();
 const call=(room:string,method:'GET'|'POST',payload?:any,authorized=true)=>app.inject({url:`/rooms/${room}/welcome`,method,headers:authorized?{'x-roomwave-bot-key':key}:{},payload});
 assert.equal((await call(rooms[0],'GET',undefined,false)).statusCode,401);
 assert.equal((await call(rooms[0],'GET')).json().enabled,false);
 assert.equal((await call(rooms[0],'POST',{imvuUserId:admin.imvuUserId,enabled:true,message:'Olá'})).statusCode,403);
 assert.equal((await call(rooms[0],'POST',{imvuUserId:owner.imvuUserId,enabled:true,message:' '})).statusCode,400);
 assert.equal((await call(rooms[0],'POST',{imvuUserId:owner.imvuUserId,enabled:true,message:'Olá {nome}'})).statusCode,200);
 assert.equal((await call(rooms[0],'GET')).json().message,'Olá {nome}');
 assert.equal((await call(rooms[1],'GET')).json().enabled,false);
 console.log('Welcome permissions, validation and room isolation: OK');
}finally{
 for(const id of rooms){await prisma.room.delete({where:{id}});await unlink(`.data/welcome/${id}.json`).catch(()=>{});}
 for(const id of users)await prisma.user.delete({where:{id}});
 await app.close();await prisma.$disconnect();
}
