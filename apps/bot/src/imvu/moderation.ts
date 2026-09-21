import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {BrowserContext,Page} from 'playwright';
import {lookupUser} from '../../../../tools/imvu-directory.mjs';
import {moderationAuthority,checkModeration,type Authority} from '../../../../tools/imvu-moderation.mjs';
import {readActiveRoom} from '../../../../tools/room-runtime.mjs';
import {isInCurrentRoom} from './presence.js';
interface Actor {id:string;name:string}
interface Dependencies {
 authority:()=>Promise<Authority>;target:(name:string)=>Promise<Actor>;present:(cid:string)=>Promise<boolean>;
 current:()=>Promise<boolean>;audit:(body:any)=>Promise<any>;send:(text:string)=>Promise<'CHAT_ECHO'|'SEND_FAILED'|'ECHO_TIMEOUT'|'ROOM_CHANGED'>;
 roomId:string;botId:string;now:()=>number;
}
const messages:Record<string,string>={MODERATION_DENIED:'⛔ Só o dono e os moderadores reais desta sala no IMVU podem usar este comando.',MODERATION_PROTECTED:'⛔ Não posso atuar sobre o dono, moderadores, o próprio executor ou o bot.',MODERATION_ROOM_CHANGED:'❌ A sala ou ligação mudou. Ação cancelada.',MODERATION_TARGET_ABSENT:'❌ O destinatário não consta nesta sala.',MODERATION_COOLDOWN:'⏳ Espera 5 segundos entre ações de moderação.',MODERATION_BUSY:'⏳ Há uma ação de moderação em curso.',MODERATION_BOT_NOT_MODERATOR:'❌ O bot não tem permissão de moderador nesta sala no IMVU.'};
export function createModerationHandler(deps:Dependencies){
 const cooldown=new Map<string,number>();let busy=false;
 return async(command:string,args:string,actor:Actor,isPublic:boolean):Promise<string|null>=>{
  if(!isPublic)return null;
  if(busy)return messages.MODERATION_BUSY!;
  const match=args.trim().match(/^@?(\S+)\s+([^\r\n]+)$/);
  if(!match||match[2]!.trim().length>200||/[\x00-\x1f]/.test(match[2]!))return `❌ Usa !${command} @username motivo (até 200 caracteres).`;
  busy=true;
  try{
   if(!await deps.current())throw new Error('MODERATION_ROOM_CHANGED');
   const authority=await deps.authority();
   if(actor.id!==authority.ownerId&&!authority.moderators.includes(actor.id))throw new Error('MODERATION_DENIED');
   const now=deps.now();for(const [id,time]of cooldown)if(now-time>=5000)cooldown.delete(id);
   if(cooldown.has(actor.id))throw new Error('MODERATION_COOLDOWN');cooldown.set(actor.id,now);
   actor=await deps.target(actor.id);
   actor.name=actor.name.replace(/[\r\n\x00-\x1f]/g,' ').slice(0,100);
   const target=await deps.target(match[1]!);
   checkModeration(authority,actor.id,target.id,deps.botId,'WARN');
   if(!await deps.present(target.id))throw new Error('MODERATION_TARGET_ABSENT');
   if(!await deps.current())throw new Error('MODERATION_ROOM_CHANGED');
   const id=randomUUID(),action=command==='expulsar'?'KICK':'WARN';
   await deps.audit({operation:'start',id,roomId:deps.roomId,actorCid:actor.id,actorName:actor.name.slice(0,100),targetCid:target.id,targetName:target.name.slice(0,100),reason:match[2]!.trim(),action});
   const finish=async(status:string,resultCode:string)=>{try{await deps.audit({operation:'finish',id,roomId:deps.roomId,status,resultCode});return true;}catch{console.error('MODERATION_AUDIT_FINISH_FAILED',id);return false;}};
   if(action==='KICK'){
    await finish('FAILED','KICK_UNAVAILABLE');
    try{checkModeration(authority,actor.id,target.id,deps.botId,'KICK');}catch{return messages.MODERATION_BOT_NOT_MODERATOR!;}
    return '❌ Expulsão indisponível: a operação nativa do IMVU ainda não foi validada. Ninguém foi expulso.';
   }
   if(!await deps.current()){await finish('FAILED','ROOM_CHANGED');return messages.MODERATION_ROOM_CHANGED!;}
   const text=`⚠️ ${target.name}: ${match[2]!.trim()}\nModeração: ${actor.name} · Ref. ${id.slice(0,8)}`;
   let result:Awaited<ReturnType<Dependencies['send']>>;
   try{result=await deps.send(text);}catch{result='ECHO_TIMEOUT';}
   const saved=await finish(result==='CHAT_ECHO'?'CONFIRMED':result==='SEND_FAILED'||result==='ROOM_CHANGED'?'FAILED':'UNCONFIRMED',result);
   if(result==='CHAT_ECHO')return saved?null:'⚠️ Aviso publicado, mas a confirmação no histórico falhou.';
   return result==='ECHO_TIMEOUT'?'⚠️ Não consegui confirmar a publicação do aviso. Não foi repetido automaticamente.':'❌ O aviso não foi enviado.';
  }catch(e){const code=e instanceof Error?e.message:'';return messages[code]??(/^(IMVU_NOT_FOUND|INVALID_IMVU_USER)$/.test(code)?'❌ Utilizador não encontrado. Usa username ou CID.':'❌ Não consegui verificar permissões ou guardar o registo. Ação não executada.');}
  finally{busy=false;}
 };
}
let handler:ReturnType<typeof createModerationHandler>|null=null;
const echoes=new Map<string,()=>void>();
const echoKey=(text:string)=>text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();
export function observeModerationEcho(text:string,userId:string,isPublic:boolean){if(isPublic&&userId===process.env.IMVU_BOT_USER_ID)echoes.get(echoKey(text))?.();}
export function runModeration(command:string,args:string,actor:Actor,isPublic:boolean){return handler?handler(command,args,actor,isPublic):Promise.resolve('❌ Moderação ainda indisponível.');}
export function installModeration(context:BrowserContext,page:Page){
 const roomId=process.env.ROOMWAVE_ROOM_ID!,imvuRoom=process.env.IMVU_ROOM_ID!,botId=process.env.IMVU_BOT_USER_ID!;
 const current=async()=>readActiveRoom()?.roomId===roomId&&await page.evaluate((expected)=>{const s=(window as any).__roomwaveWsState;return s?.socket?.readyState===1&&Boolean(s.chatId)&&location.href.includes(expected);},imvuRoom);
 handler=createModerationHandler({roomId,botId,now:Date.now,current,present:isInCurrentRoom,
  authority:()=>moderationAuthority(imvuRoom,async url=>{const r=await context.request.get(url,{timeout:5000,maxRedirects:0});try{if(!r.ok())throw new Error('MODERATION_AUTHORITY_UNAVAILABLE');return await r.json();}finally{await r.dispose();}}),
  target:async name=>{const u=await lookupUser(name);return {id:u.id,name:u.username};},
  audit:async body=>{const key=(await readFile('/home/ubuntu/roomwave/.data/custom-commands.key','utf8')).trim();const r=await fetch(`${process.env.ROOMWAVE_API_URL??'http://127.0.0.1:3001'}/api/moderation`,{method:'POST',headers:{'Content-Type':'application/json','x-roomwave-bot-key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});const data=await r.json();if(!r.ok)throw new Error(data.error??'MODERATION_UNAVAILABLE');if(body.operation==='finish'&&data.updated!==1)throw new Error('MODERATION_AUDIT_NOT_UPDATED');return data;},
  send:async text=>{
   if(!await current())return 'ROOM_CHANGED';
   let resolve!:(value:'CHAT_ECHO'|'ECHO_TIMEOUT'|'SEND_FAILED')=>void;
   const promise=new Promise<'CHAT_ECHO'|'ECHO_TIMEOUT'|'SEND_FAILED'>(r=>resolve=r);
   const timer=setTimeout(()=>resolve('ECHO_TIMEOUT'),8000);
   echoes.set(echoKey(text),()=>resolve('CHAT_ECHO'));
   try{await page.evaluate(({text,expected})=>{if(!location.href.includes(expected))throw new Error('ROOM_CHANGED');(window as any).__roomwaveSendChat(text);},{text,expected:imvuRoom});return await promise;}
   catch{return 'ECHO_TIMEOUT';}
   finally{clearTimeout(timer);echoes.delete(echoKey(text));}
  },
 });
 return ()=>{handler=null;echoes.clear();};
}
