import {captureActivity,historyEnabled} from "./activity.js";
import type {BrowserContext,Page} from 'playwright';
import {readFile} from 'node:fs/promises';
import {WelcomeTracker,renderWelcome,type Visitor} from './welcome-state.js';

// Use the authenticated IMVU session; no second browser and no DOM dependency.
export function startWelcomes(context:BrowserContext,page:Page){
 const names=new Map<string,string>();
 let previousVisitors:Map<string,string>|null=null;
 const tracker=new WelcomeTracker();let busy=false,stopped=false,wasEnabled=false,failures=0,baselineLogged=false;
 async function imvuJson(url:string){
  const response=await context.request.get(url,{timeout:7000});
  try{if(!response.ok())throw new Error(`WELCOME_IMVU_HTTP_${response.status()}`);return await response.json();}
  finally{await response.dispose();}
 }
 async function tick(){
  if(busy||stopped)return;busy=true;
  try{
   const connection=await page.evaluate('({connected:window.__roomwaveWsState?.socket?.readyState===1,self:window.__roomwaveWsState?.userId})') as {connected:boolean;self:string|null};
   if(!connection.connected||!connection.self){tracker.reset();previousVisitors=null;return;}
   const key=(await readFile('/home/ubuntu/roomwave/.data/custom-commands.key','utf8')).trim();
   const res=await fetch(`${process.env.ROOMWAVE_API_URL??'http://127.0.0.1:3001'}/api/rooms/${process.env.ROOMWAVE_ROOM_ID}/welcome`,{headers:{'x-roomwave-bot-key':key},signal:AbortSignal.timeout(5000)});
   if(!res.ok)throw new Error('WELCOME_SETTINGS_UNAVAILABLE');
   const settings=await res.json() as {enabled:boolean;message:string;roomName:string};
   if(settings.enabled!==wasEnabled){tracker.reset();wasEnabled=settings.enabled;}
   // One initial read verifies the connection even when the feature is disabled.
   const logging=await historyEnabled();
   if(!logging)previousVisitors=null;
   if(!settings.enabled&&!logging&&baselineLogged)return;
   const url=`https://api.imvu.com/chat/chat-${process.env.IMVU_ROOM_ID}/participants`;
   const payload=await imvuJson(url);
   const collection=payload.denormalized?.[payload.id]?.data;
   if(!Array.isArray(collection?.items))throw new Error('WELCOME_PARTICIPANTS_FORMAT');
   const visitors:Visitor[]=[];
   for(const ref of collection.items){
    const entry=payload.denormalized?.[ref];
    const userRef=entry?.relations?.ref??entry?.relations?.user;
    const id=typeof userRef==='string'?/\/user-(\d+)$/.exec(userRef)?.[1]:null;
    if(!id)throw new Error('WELCOME_PARTICIPANT_FORMAT');
    if(names.has(id)){visitors.push({id,name:names.get(id)!});continue;}
    let data=payload.denormalized?.[userRef]?.data;
    if(!data){const user=await imvuJson(`https://api.imvu.com/user/user-${id}`);data=user.denormalized?.[user.id]?.data;}
    const name=data?.display_name??data?.username??data?.avatarname;
    if(typeof name!=='string'||!name.trim())throw new Error('WELCOME_NAME_UNAVAILABLE');
    names.set(id,name);visitors.push({id,name});
   }
   for(const id of names.keys())if(!visitors.some(v=>v.id===id))names.delete(id);
   if(!baselineLogged){console.log(`👋 Boas-vindas: lista de participantes confirmada (${visitors.length}); ${settings.enabled?'ativo':'desligado'}.`);baselineLogged=true;}
   if(logging){
    await fetch(`${process.env.ROOMWAVE_API_URL??'http://127.0.0.1:3001'}/api/security`,{method:'POST',headers:{'Content-Type':'application/json','x-roomwave-bot-key':key},body:JSON.stringify({action:'snapshot',roomId:process.env.ROOMWAVE_ROOM_ID,participants:visitors.map(v=>({id:v.id,name:v.name.slice(0,100)}))}),signal:AbortSignal.timeout(5000)});

    const current=new Map(visitors.map(v=>[v.id,v.name]));
    if(previousVisitors){
     for(const [id,name] of current)if(!previousVisitors.has(id))await captureActivity({type:'join',userId:id,name:name.slice(0,100)});
     for(const [id,name] of previousVisitors)if(!current.has(id))await captureActivity({type:'leave',userId:id,name:name.slice(0,100)});
    }else await captureActivity({type:'baseline',text:'Observação iniciada na sala do bot.'});
    previousVisitors=current;
   }
   const visitor=tracker.observe(visitors,String(connection.self),settings.enabled);
   failures=0;
   if(visitor&&!stopped){
    const message=renderWelcome(settings.message,visitor.name,settings.roomName,process.env.ROOMWAVE_PUBLIC_RADIO_URL??'https://roomwavebot.duckdns.org/roomwave.mp3');
    await page.evaluate(text=>(window as any).__roomwaveSendChat(text),message);
    console.log(`👋 Boas-vindas enviadas: IMVU=${visitor.id}`);
   }
  }catch(error){tracker.reset();previousVisitors=null;if(failures++%6===0)console.warn('⚠️ Boas-vindas:',error instanceof Error&&/^WELCOME_/.test(error.message)?error.message:'consulta temporariamente indisponível');}
  finally{busy=false;}
 }
 const timer=setInterval(()=>void tick(),10000);timer.unref();void tick();
 return ()=>{stopped=true;clearInterval(timer);};
}
