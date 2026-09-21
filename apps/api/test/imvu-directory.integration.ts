import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {prisma} from '@roomwave/database';
import {imvuDirectoryRoutes} from '../src/routes/imvu-directory.ts';
const app=Fastify();await app.register(imvuDirectoryRoutes);const users:string[]=[];let roomId='';
try{
 const seed=randomUUID();
 const owner=await prisma.user.create({data:{username:'Lookup owner',imvuUserId:seed}});users.push(owner.id);
 const admin=await prisma.user.create({data:{username:'Lookup admin',imvuUserId:seed+'a'}});users.push(admin.id);
 const room=await prisma.room.create({data:{name:'Lookup test',members:{create:[{userId:owner.id,role:'OWNER'},{userId:admin.id,role:'ADMIN'}]}}});roomId=room.id;
 const key=(await readFile('.data/custom-commands.key','utf8')).trim();
 const call=(imvuUserId:string,query:string,authorized=true)=>app.inject({url:'/imvu/lookup',method:'POST',headers:authorized?{'x-roomwave-bot-key':key}:{},payload:{roomId,imvuUserId,kind:'user',query}});
 assert.equal((await call(seed,'208718276',false)).statusCode,401);
 assert.equal((await call(admin.imvuUserId!,'208718276')).statusCode,403);
 assert.equal((await call(seed,'http://localhost')).statusCode,400);
 const result=await call(seed,'Diiabllo');assert.equal(result.statusCode,200);assert.equal(result.json().result.id,'208718276');
 console.log('Lookup authentication, OWNER and live exact match: OK');
}finally{
 if(roomId)await prisma.room.delete({where:{id:roomId}});
 for(const id of users)await prisma.user.delete({where:{id}});
 await app.close();await prisma.$disconnect();
}
