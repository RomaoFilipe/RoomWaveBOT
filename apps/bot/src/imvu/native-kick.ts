import type {APIRequestContext} from 'playwright';
import {moderationAuthority,checkModeration} from '../../../../tools/imvu-moderation.mjs';
export type KickResult='KICK_CONFIRMED'|'KICK_REJECTED'|'KICK_UNCONFIRMED'|'KICK_PREFLIGHT_FAILED'|'ROOM_CHANGED'|'TARGET_ABSENT';
// Verified in IMVU withme c0c70ab04c14dfe4: bootFromChat deletes the participant
// edge with JSON {reason:"booted"}; UiCore Rest supplies X-imvu-sauce from login/me.
export async function nativeKick(context:APIRequestContext,room:string,actor:string,target:string,bot:string,current:()=>Promise<boolean>):Promise<KickResult>{
 if(!/^\d{1,20}-\d{1,20}$/.test(room)||![actor,target,bot].every(id=>/^\d{1,20}$/.test(id)))return 'KICK_PREFLIGHT_FAILED';
 const base='https://api.imvu.com',participants=`${base}/chat/chat-${room}/participants`,edge=`${participants}/user-${target}`;
 const get=async(url:string)=>{const r=await context.get(url,{timeout:5000,maxRedirects:0,maxRetries:0});try{if(!r.ok())throw new Error('READ_FAILED');return await r.json();}finally{await r.dispose();}};
 const present=async()=>{const data=await get(participants);const items=data.denormalized?.[participants]?.data?.items;if(!Array.isArray(items))throw new Error('INVALID_PARTICIPANTS');return items.includes(edge);};
 let sauce:string;
 try{
  if(!await current())return 'ROOM_CHANGED';
  checkModeration(await moderationAuthority(room,get),actor,target,bot,'KICK');
  const data=await get(`${base}/login/me`),login=data.denormalized?.[data.id];
  if(login?.relations?.user!==`${base}/user/user-${bot}`||typeof login?.data?.sauce!=='string'||!login.data.sauce)throw new Error('INVALID_SESSION');
  sauce=login.data.sauce;
  if(!await present())return 'TARGET_ABSENT';
  if(!await current())return 'ROOM_CHANGED';
 }catch{return 'KICK_PREFLIGHT_FAILED';}
 try{
  // One request only. An ambiguous transport result must never trigger a retry.
  const response=await context.delete(edge,{data:{reason:'booted'},headers:{'X-imvu-sauce':sauce,Origin:'https://www.imvu.com',Referer:'https://www.imvu.com/'},timeout:8000,maxRedirects:0,maxRetries:0});
  const status=response.status();await response.dispose();
  if(status<200||status>=300)return status>=400&&status<500?'KICK_REJECTED':'KICK_UNCONFIRMED';
  for(let attempt=0;attempt<3;attempt++){
   if(!await current())return 'KICK_UNCONFIRMED';
   if(!await present())return 'KICK_CONFIRMED';
   if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500));
  }
 }catch{return 'KICK_UNCONFIRMED';}
 return 'KICK_UNCONFIRMED';
}
