import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
export const runtimeDirectory = new URL('../.data/room-control/', import.meta.url);
export function normalizeImvuRoom(input) {
  if (typeof input !== 'string') throw new Error('INVALID_IMVU_ROOM');
  let value=input.trim();
  if (!/^\d+-\d+$/.test(value)) {
    let url;try {url=new URL(value);}catch{throw new Error('INVALID_IMVU_ROOM');}
    if(url.protocol!=='https:'||!['go.imvu.com','www.imvu.com','pt.imvu.com','imvu.com'].includes(url.hostname)||url.username||url.password||url.port)throw new Error('INVALID_IMVU_ROOM');
    const match=/^\/(?:next\/)?chat\/room-(\d+-\d+)\/?$/.exec(url.pathname);
    if(!match)throw new Error('INVALID_IMVU_ROOM');
    value=match[1];
  }
  if(value.length>64)throw new Error('INVALID_IMVU_ROOM');
  return {imvuRoomId:value,roomUrl:`https://go.imvu.com/chat/room-${value}`};
}
export function readActiveRoom() {
  try {
    const value=JSON.parse(readFileSync(new URL('active.json',runtimeDirectory),'utf8'));
    if(typeof value.roomId!=='string'||!/^[a-f0-9-]{36}$/i.test(value.roomId))throw new Error('INVALID_ACTIVE_ROOM');
    return {roomId:value.roomId,...normalizeImvuRoom(value.imvuRoomId)};
  }catch(error){if(error.code==='ENOENT')return null;throw error;}
}
export function applyActiveRoom() {
  const room=readActiveRoom();if(!room)return;
  process.env.ROOMWAVE_ROOM_ID=room.roomId;
  process.env.IMVU_ROOM_ID=room.imvuRoomId;
  process.env.IMVU_ROOM_URL=room.roomUrl;
}
export function reportBotRoom(state) {
  const value={roomId:process.env.ROOMWAVE_ROOM_ID,imvuRoomId:process.env.IMVU_ROOM_ID,state,pid:process.pid,updatedAt:Date.now()};
  mkdirSync(runtimeDirectory,{recursive:true,mode:0o700});
  const temp=new URL(`bot-${process.pid}.tmp`,runtimeDirectory);
  writeFileSync(temp,JSON.stringify(value),{mode:0o600});
  renameSync(temp,new URL('bot.json',runtimeDirectory));
}
