import type {FastifyInstance} from 'fastify';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {prisma} from '@roomwave/database';
import {readActiveRoom} from '../../../../tools/room-runtime.mjs';
import {moderationAuthority,checkModeration} from '../../../../tools/imvu-moderation.mjs';
import {verifyOwnedRoom} from '../services/room-ownership.js';
const cid=z.string().regex(/^\d{1,20}$/);
const schema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('start'),id:z.string().uuid(),roomId:z.string().uuid(),actorCid:cid,actorName:z.string().min(1).max(100),targetCid:cid,targetName:z.string().min(1).max(100),reason:z.string().trim().min(1).max(200).regex(/^[^\r\n\x00-\x1f]+$/),action:z.enum(['WARN','KICK'])}),
 z.object({operation:z.literal('finish'),id:z.string().uuid(),roomId:z.string().uuid(),status:z.enum(['CONFIRMED','FAILED','UNCONFIRMED']),resultCode:z.enum(['CHAT_ECHO','SEND_FAILED','ECHO_TIMEOUT','ROOM_CHANGED','KICK_UNAVAILABLE','INTERRUPTED'])}),
 z.object({operation:z.literal('list'),roomId:z.string().uuid(),actorCid:cid,person:z.string().trim().max(100).optional(),action:z.enum(['WARN','KICK']).optional(),from:z.iso.datetime().optional(),to:z.iso.datetime().optional(),cursor:z.string().uuid().optional()}),
]);
export async function purgeModeration(){
 await prisma.moderationEvent.deleteMany({where:{createdAt:{lt:new Date(Date.now()-30*86400000)}}});
 await prisma.moderationEvent.updateMany({where:{status:'REQUESTED',createdAt:{lt:new Date(Date.now()-60000)}},data:{status:'UNCONFIRMED',resultCode:'INTERRUPTED'}});
}
export async function moderationRoutes(app:FastifyInstance,options:{activeRoom?:()=>string|undefined}={}){
 const activeRoom=options.activeRoom??(()=>readActiveRoom()?.roomId);
 const timer=setInterval(()=>void purgeModeration().catch(()=>app.log.error('MODERATION_CLEANUP_FAILED')),60000);timer.unref();
 app.addHook('onClose',async()=>clearInterval(timer));
 app.addHook('onReady',async()=>{await purgeModeration();});
 let starting=false;
 app.post('/moderation',async(req,reply)=>{
  const expected=Buffer.from((await readFile('/home/ubuntu/roomwave/.data/custom-commands.key','utf8')).trim());const supplied=Buffer.from(String(req.headers['x-roomwave-bot-key']??''));
  if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return reply.code(401).send({error:'UNAUTHORIZED'});
  const parsed=schema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_MODERATION'});const input=parsed.data;
  try{
   if(input.operation==='list'){
    await verifyOwnedRoom(input.roomId,input.actorCid);
    if(input.from&&input.to&&Date.parse(input.from)>Date.parse(input.to))return reply.code(400).send({error:'INVALID_MODERATION'});
    const rows=await prisma.moderationEvent.findMany({where:{roomId:input.roomId,...(input.action?{action:input.action}:{}),createdAt:{gte:new Date(Math.max(Date.now()-30*86400000,input.from?Date.parse(input.from):0)),...(input.to?{lte:new Date(input.to)}:{})},...(input.person?{OR:[{actorCid:input.person},{targetCid:input.person},{actorName:{contains:input.person,mode:'insensitive' as const}},{targetName:{contains:input.person,mode:'insensitive' as const}}]}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:51,...(input.cursor?{cursor:{id:input.cursor},skip:1}:{})});
    return {events:rows.slice(0,50),nextCursor:rows.length>50?rows[49]!.id:null};
   }
   if(input.operation==='finish'){
    if(input.status==='CONFIRMED'&&input.resultCode!=='CHAT_ECHO')return reply.code(400).send({error:'INVALID_MODERATION'});
    const result=await prisma.moderationEvent.updateMany({where:{id:input.id,roomId:input.roomId,status:'REQUESTED',...(input.status==='CONFIRMED'?{action:'WARN' as const}:{})},data:{status:input.status,resultCode:input.resultCode}});
    return {updated:result.count};
   }
   if(starting)return reply.code(429).send({error:'MODERATION_BUSY'});starting=true;
   try{
    if(activeRoom()!==input.roomId)return reply.code(409).send({error:'MODERATION_ROOM_CHANGED'});
    const room=await prisma.room.findUniqueOrThrow({where:{id:input.roomId}});
    const authority=await moderationAuthority(room.imvuRoomId??'');
    checkModeration(authority,input.actorCid,input.targetCid,process.env.IMVU_BOT_USER_ID??'','WARN');
    const recent=await prisma.moderationEvent.findFirst({where:{roomId:input.roomId,actorCid:input.actorCid,createdAt:{gt:new Date(Date.now()-5000)}}});
    if(recent)return reply.code(429).send({error:'MODERATION_COOLDOWN'});
    if(activeRoom()!==input.roomId)return reply.code(409).send({error:'MODERATION_ROOM_CHANGED'});
    const {operation,...data}=input;return await prisma.moderationEvent.create({data});
   }finally{starting=false;}
  }catch(e){const code=e instanceof Error?e.message:'';return reply.code(400).send({error:/^(MODERATION_|ROOM_NOT_OWNED|IMVU_OWNER_MISMATCH)/.test(code)?code:'MODERATION_UNAVAILABLE'});}
 });
}
