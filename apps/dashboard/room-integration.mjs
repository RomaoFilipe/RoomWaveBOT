import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { normalizeImvuRoom, readActiveRoom, runtimeDirectory } from '../../tools/room-runtime.mjs';
import { createRoomController } from './room-controller.mjs';

export async function setupRoomControl({roomId,request,api,engine,exec,actorId,managementRoomId,onActive,serviceStates}){
  await mkdir(runtimeDirectory,{recursive:true,mode:0o700});
  const write=async(name,value)=>{
    const temp=new URL(`${name}.${randomUUID()}.tmp`,runtimeDirectory);
    await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,new URL(name,runtimeDirectory));
  };
  const managed=payload=>request(api,'/api/managed-rooms',{managementRoomId,imvuUserId:actorId,...payload});
  const initial=readActiveRoom()??{roomId,...normalizeImvuRoom(process.env.IMVU_ROOM_ID||process.env.IMVU_ROOM_URL)};
  if(!readActiveRoom())await write('active.json',initial);
  onActive(initial);
  let operation=null;try{operation=JSON.parse(await readFile(new URL('operation.json',runtimeDirectory),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  async function botStatus(){
    const states=await serviceStates();const bot=states.find(s=>s.Id==='roomwave-imvu.service');
    if(bot?.ActiveState!=='active')return {state:bot?.ActiveState==='activating'?'joining':'offline',roomId:null};
    try{
      const report=JSON.parse(await readFile(new URL('bot.json',runtimeDirectory),'utf8'));
      if(String(report.pid)!==String(bot.MainPID)||Date.now()-report.updatedAt>30000)return {state:'unknown',roomId:null};
      return {state:report.state,roomId:report.roomId,imvuRoomId:report.imvuRoomId};
    }catch{return {state:'unknown',roomId:null};}
  }
  const deps={
    saveActive:value=>write('active.json',value), saveOperation:value=>write('operation.json',value), onActive,
    async states(){const states=await serviceStates();return{bot:states.some(s=>s.Id==='roomwave-imvu.service'&&s.ActiveState==='active'),player:states.some(s=>s.Id==='roomwave-player.service'&&s.ActiveState==='active')};},
    control:action=>exec('/usr/bin/sudo',['-n','/usr/local/sbin/roomwave-dashboard-room',action],{timeout:45000,maxBuffer:8000}),
    async stopAudio(){
      const status=await request(engine,'/status');await request(engine,'/stop',{});
      const source=status.current?.source;
      const cache=fileURLToPath(new URL('../../.data/audio/cache/',import.meta.url));
      if(typeof source==='string'&&dirname(resolve(source))===resolve(cache))await rm(resolve(source),{force:true});
    },
    release:id=>managed({action:'release',roomId:id}),
    async waitJoined(target){
      const deadline=Date.now()+120000;
      while(Date.now()<deadline){
        const status=await botStatus();
        if(status.state==='joined'&&status.roomId===target.roomId&&status.imvuRoomId===target.imvuRoomId)return;
        if(status.state==='error'&&status.roomId===target.roomId)throw new Error('ROOM_JOIN_TIMEOUT');
        await new Promise(r=>setTimeout(r,2000));
      }
      throw new Error('ROOM_JOIN_TIMEOUT');
    },
  };
  const controller=createRoomController(deps,initial,operation);
  // A crash cannot silently leave two halves of the system in different rooms.
  if(operation?.status==='switching')void controller.recover().catch(()=>console.error('Room recovery failed'));
  return {controller,managed,botStatus};
}
