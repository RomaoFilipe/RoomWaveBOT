import type {FastifyInstance} from 'fastify';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {prisma} from '@roomwave/database';
import {lookupUser,lookupRoom} from '../../../../tools/imvu-directory.mjs';
import {readActiveRoom} from '../../../../tools/room-runtime.mjs';
import {activitySettings,readActivity,saveActivitySettings} from '../../../../tools/room-activity.mjs';
import {readSecurity,changePerson} from '../../../../tools/room-security.mjs';
import {verifyOwnedRoom,verifyRecordingRoom} from '../services/room-ownership.js';
const schema=z.object({action:z.enum(['rooms','register','monitor','view','watch','unwatch','snapshot']),managementRoomId:z.string().uuid().optional(),imvuUserId:z.string().max(64).optional(),roomId:z.string().uuid().optional(),query:z.string().trim().min(1).max(300).optional(),enabled:z.boolean().optional(),note:z.string().trim().max(200).optional(),participants:z.array(z.object({id:z.string().regex(/^\d{1,20}$/),name:z.string().max(100)})).max(100).optional()});
export async function securityRoutes(app:FastifyInstance){
 const snapshots=new Map<string,{at:string;participants:Array<{id:string;name:string}>}>();
 const expiry=setInterval(()=>{for(const [id,snapshot] of snapshots)if(Date.now()-Date.parse(snapshot.at)>=30000)snapshots.delete(id);},30000);expiry.unref();app.addHook('onClose',async()=>clearInterval(expiry));
 app.post('/security',async(req,reply)=>{
  const expected=Buffer.from((await readFile('/home/ubuntu/roomwave/.data/custom-commands.key','utf8')).trim()),supplied=Buffer.from(String(req.headers['x-roomwave-bot-key']??''));
  if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return reply.code(401).send({error:'UNAUTHORIZED'});
  const parsed=schema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_QUERY'});const data=parsed.data;
  try{
   if(data.action==='snapshot'){
    if(!data.roomId||!data.participants||readActiveRoom()?.roomId!==data.roomId)return reply.code(400).send({error:'INVALID_ROOM'});
    const settings=await activitySettings(data.roomId);if(!settings.enabled)return {ok:true};
    await verifyRecordingRoom(data.roomId,settings.ownerImvuId);
    snapshots.clear();snapshots.set(data.roomId,{at:new Date().toISOString(),participants:data.participants});return {ok:true};
   }
   if(!data.managementRoomId||!data.imvuUserId||!await prisma.roomMember.findFirst({where:{roomId:data.managementRoomId,role:'OWNER',user:{is:{imvuUserId:data.imvuUserId}}}}))return reply.code(403).send({error:'OWNER_ONLY'});
   if(data.action==='register'){
    if(!data.query)return reply.code(400).send({error:'INVALID_QUERY'});
    const actual=await lookupRoom(data.query);if(actual.ownerId!==data.imvuUserId)return reply.code(403).send({error:'IMVU_OWNER_MISMATCH'});
    const owner=await prisma.user.findUniqueOrThrow({where:{imvuUserId:data.imvuUserId}});
    const room=await prisma.room.upsert({where:{imvuRoomId:actual.id},update:{},create:{name:actual.name,imvuRoomId:actual.id}});
    await prisma.roomMember.upsert({where:{roomId_userId:{roomId:room.id,userId:owner.id}},update:{role:'OWNER'},create:{roomId:room.id,userId:owner.id,role:'OWNER'}});
    return {room};
   }
   if(data.action==='rooms'){
    const rooms=await prisma.room.findMany({where:{status:'ACTIVE',members:{some:{role:'OWNER',user:{is:{imvuUserId:data.imvuUserId}}}}},select:{id:true,name:true,imvuRoomId:true},take:20,orderBy:{createdAt:'asc'}});
    const results=[];
    for(let i=0;i<rooms.length;i+=3)results.push(...await Promise.all(rooms.slice(i,i+3).map(async room=>{
     try{return {...await verifyOwnedRoom(room.id,data.imvuUserId!),verified:true};}
     catch(e){return {...room,verified:false,reason:e instanceof Error?e.message:'IMVU_UNAVAILABLE'};}
    })));
    return {rooms:results};
   }
   if(!data.roomId)return reply.code(400).send({error:'INVALID_ROOM'});
   const room=await verifyOwnedRoom(data.roomId,data.imvuUserId);
   if(data.action==='monitor'){if(typeof data.enabled!=='boolean')return reply.code(400).send({error:'INVALID_QUERY'});if(!data.enabled)snapshots.delete(room.id);return saveActivitySettings(room.id,data.enabled,data.imvuUserId);}
   if(data.action==='watch'){
    if(!data.query)return reply.code(400).send({error:'INVALID_QUERY'});const user=await lookupUser(data.query);
    return changePerson(room.id,{id:user.id,username:user.username,note:data.note??''});
   }
   if(data.action==='unwatch'){
    if(!data.query||!/^\d{1,20}$/.test(data.query))return reply.code(400).send({error:'INVALID_QUERY'});
    return changePerson(room.id,{id:data.query,username:'',note:''},true);
   }
   const settings=await activitySettings(room.id),security=await readSecurity(room.id),snapshot=snapshots.get(room.id);
   const current=readActiveRoom()?.roomId===room.id;
   const live=settings.enabled&&current&&snapshot&&Date.now()-Date.parse(snapshot.at)<30000?snapshot:null;
   const events=await readActivity(room.id);
   return {room,settings,people:security.people,snapshot:live,active:current,events:events.map(e=>({...e,highlighted:security.people.some(p=>p.id===e.userId)}))};
  }catch(e){const error=e instanceof Error?e.message:'IMVU_UNAVAILABLE';return reply.code(error==='IMVU_OWNER_MISMATCH'||error==='ROOM_NOT_OWNED'?403:400).send({error:/^(IMVU_|INVALID_|ROOM_|WATCH_)/.test(error)?error:'IMVU_UNAVAILABLE'});}
 });
}
