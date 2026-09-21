import type {FastifyInstance} from 'fastify';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {prisma} from '@roomwave/database';
import {readWelcome,writeWelcome} from '../../../../tools/welcome-settings.mjs';
const schema=z.object({imvuUserId:z.string().min(1).max(64),enabled:z.boolean(),message:z.string().trim().min(1).max(350).refine(s=>!/[\u0000-\u0008\u000b-\u001f]/.test(s))});
export async function welcomeRoutes(app:FastifyInstance){
 app.route({method:['GET','POST'],url:'/rooms/:roomId/welcome',handler:async(req,reply)=>{
  const key=Buffer.from((await readFile('/home/ubuntu/roomwave/.data/custom-commands.key','utf8')).trim());
  const supplied=Buffer.from(String(req.headers['x-roomwave-bot-key']??''));
  if(key.length!==supplied.length||!timingSafeEqual(key,supplied))return reply.code(401).send({error:'UNAUTHORIZED'});
  const {roomId}=req.params as {roomId:string};
  if(!z.string().uuid().safeParse(roomId).success)return reply.code(400).send({error:'INVALID_ROOM'});
  const room=await prisma.room.findUnique({where:{id:roomId},select:{name:true}});
  if(!room)return reply.code(404).send({error:'NOT_FOUND'});
  if(req.method==='GET')return {...await readWelcome(roomId),roomName:room.name};
  const parsed=schema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_WELCOME'});
  const {imvuUserId,...settings}=parsed.data;
  const member=await prisma.roomMember.findFirst({where:{roomId,role:'OWNER',user:{is:{imvuUserId}}}});
  if(!member)return reply.code(403).send({error:'OWNER_ONLY'});
  return writeWelcome(roomId,settings);
 }});
}
