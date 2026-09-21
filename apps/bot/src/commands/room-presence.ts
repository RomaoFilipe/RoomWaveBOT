import {readFile} from 'node:fs/promises';
import {ensureImvuMember} from '../services/api.js';
import {lookupUser} from '../../../../tools/imvu-directory.mjs';
import {isInCurrentRoom} from '../imvu/presence.js';
export async function presenceCommand(command:'onde'|'historico',args:string,actor?:string){
 if(!actor||(await ensureImvuMember(actor)).role!=='OWNER')return '❌ Só o dono pode usar este comando.';
 if(!args.trim())return `❌ Utilização: !${command} username ou CID`;
 try{
  const user=await lookupUser(args.trim());
  if(command==='onde')return await isInCurrentRoom(user.id)?`📍 ${user.username} está nesta sala, confirmado agora.`:`📍 ${user.username} não consta nesta sala agora. Não consulto a localização noutras salas.`;
  const key=(await readFile('/home/ubuntu/roomwave/.data/custom-commands.key','utf8')).trim();
  const r=await fetch(`${process.env.ROOMWAVE_API_URL??'http://127.0.0.1:3001'}/api/rooms/${process.env.ROOMWAVE_ROOM_ID}/activity`,{method:'POST',headers:{'Content-Type':'application/json','x-roomwave-bot-key':key},body:JSON.stringify({action:'read',imvuUserId:actor,kind:'history',targetUserId:user.id}),signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new Error('HISTORY_UNAVAILABLE');
  const data=await r.json() as {settings:{enabled:boolean};events:Array<{userId:string;type:string;time:string}>};
  const events=data.events.filter(e=>e.userId===user.id&&['join','leave'].includes(e.type)).slice(0,3);
  if(!events.length)return `📋 ${user.username}: sem entradas/saídas registadas nesta sala.${data.settings.enabled?'':' A recolha está desligada no dashboard.'}`;
  return [`📋 ${user.username} — registos desta sala (UTC)`,...events.map(e=>`${e.type==='join'?'Entrou':'Saiu'}: ${new Date(e.time).toISOString().replace('T',' ').slice(0,16)}`),'São observações guardadas; não indicam a localização atual.'].join('\n');
 }catch(error){return error instanceof Error&&/^(INVALID_IMVU_USER|IMVU_NOT_FOUND)$/.test(error.message)?'❌ Utilizador não encontrado. Usa o username exato ou CID.':'❌ Não foi possível confirmar os dados agora. Tenta novamente.';}
}
