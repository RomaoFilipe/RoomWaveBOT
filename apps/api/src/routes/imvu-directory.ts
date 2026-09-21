import {lookupAnkh} from "../../../../tools/ankh-directory.mjs";
import type {FastifyInstance} from 'fastify';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {prisma} from '@roomwave/database';
import {lookupUser,lookupRoom} from '../../../../tools/imvu-directory.mjs';
const schema=z.object({roomId:z.string().uuid(),imvuUserId:z.string().min(1).max(64),kind:z.enum(['user','room']),provider:z.enum(['imvu','ankh']).default('imvu'),query:z.string().trim().min(1).max(300)});
export async function imvuDirectoryRoutes(app:FastifyInstance){
 let busy=0;
 app.post('/imvu/lookup',async(req,reply)=>{
  const expected=Buffer.from((await readFile('/home/ubuntu/roomwave/.data/custom-commands.key','utf8')).trim()),supplied=Buffer.from(String(req.headers['x-roomwave-bot-key']??''));
  if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return reply.code(401).send({error:'UNAUTHORIZED'});
  const parsed=schema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_QUERY'});
  const {roomId,imvuUserId,kind,query,provider}=parsed.data;
  if(!await prisma.roomMember.findFirst({where:{roomId,role:'OWNER',user:{is:{imvuUserId}}}}))return reply.code(403).send({error:'OWNER_ONLY'});
  if(busy>=3)return reply.code(429).send({error:'IMVU_RATE_LIMIT'});
  busy++;
  try{return {result:await (provider==='ankh'?lookupAnkh(kind,query):kind==='user'?lookupUser(query):lookupRoom(query))};}
  catch(e){const error=e instanceof Error?e.message:'';return reply.code(error==='IMVU_NOT_FOUND'?404:400).send({error:/^(ANKH_|IMVU_|INVALID_IMVU_)/.test(error)?error:'IMVU_UNAVAILABLE'});}
  finally{busy--;}
 });
}
