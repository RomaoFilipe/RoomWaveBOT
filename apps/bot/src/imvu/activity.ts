import {readFile} from 'node:fs/promises';
import {activitySettings} from '../../../../tools/room-activity.mjs';
let pending=0;
export async function historyEnabled(){try{return (await activitySettings(process.env.ROOMWAVE_ROOM_ID!)).enabled;}catch{return false;}}
export async function captureActivity(event:{type:'message'|'join'|'leave'|'baseline';userId?:string;name?:string;text?:string}){
 if(pending>=4)return;pending++;
 try{
  if(!await historyEnabled())return;
  const key=(await readFile('/home/ubuntu/roomwave/.data/custom-commands.key','utf8')).trim();
  await fetch(`${process.env.ROOMWAVE_API_URL??'http://127.0.0.1:3001'}/api/rooms/${process.env.ROOMWAVE_ROOM_ID}/activity`,{method:'POST',headers:{'Content-Type':'application/json','x-roomwave-bot-key':key},body:JSON.stringify({action:'record',event}),signal:AbortSignal.timeout(3000)});
 }catch{/* History must not interrupt chat commands. */}finally{pending--;}
}
export function publicChat(to:unknown,queue:string,chatId:string,activeQueue:string|null,activeChat:string|null){return (to===0||to==='0')&&queue===activeQueue&&chatId===activeChat;}
