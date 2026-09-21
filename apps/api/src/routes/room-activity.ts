import type {FastifyInstance} from 'fastify';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {prisma} from '@roomwave/database';
import {readActiveRoom} from '../../../../tools/room-runtime.mjs';
import {activitySettings,saveActivitySettings,recordActivity,readActivity,clearActivity,purgeActivity} from '../../../../tools/room-activity.mjs';
const schema=z.object({action:z.enum(['read','settings','save','clear','record']),imvuUserId:z.string().max(64).optional(),enabled:z.boolean().optional(),query:z.string().max(100).optional(),kind:z.enum(['all','history','message']).optional(),event:z.object({type:z.enum(['message','join','leave','baseline']),userId:z.string().regex(/^\d{1,20}$/).optional(),name:z.string().max(100).optional(),text:z.string().max(1000).optional()}).optional()});
export async function roomActivityRoutes(app:FastifyInstance){
 const timer=setInterval(()=>void purgeActivity().catch(()=>{}),3600000);timer.unref();void purgeActivity().catch(()=>{});app.addHook('onClose',async()=>clearInterval(timer));
 app.post('/rooms/:roomId/activity',async(req,reply)=>{
 const expected=Buffer.from((await readFile('/home/ubuntu/roomwave/.data/custom-commands.key','utf8')).trim()),supplied=Buffer.from(String(req.headers['x-roomwave-bot-key']??''));
 if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return reply.code(401).send({error:'UNAUTHORIZED'});
 const {roomId}=req.params as {roomId:string};const parsed=schema.safeParse(req.body);
 if(!z.string().uuid().safeParse(roomId).success||!parsed.success)return reply.code(400).send({error:'INVALID_QUERY'});
 const input=parsed.data;
 if(input.action==='record'){
  if(readActiveRoom()?.roomId!==roomId||!input.event)return reply.code(400).send({error:'INVALID_ROOM'});
  return recordActivity(roomId,input.event);
 }
 if(!input.imvuUserId||!await prisma.roomMember.findFirst({where:{roomId,role:'OWNER',user:{is:{imvuUserId:input.imvuUserId}}}}))return reply.code(403).send({error:'OWNER_ONLY'});
 if(input.action==='save'){if(typeof input.enabled!=='boolean')return reply.code(400).send({error:'INVALID_QUERY'});return saveActivitySettings(roomId,input.enabled);}
 if(input.action==='clear')return clearActivity(roomId);
 if(input.action==='settings')return activitySettings(roomId);
 return {settings:await activitySettings(roomId),events:await readActivity(roomId,input.query,input.kind),roomId};
 });
}
