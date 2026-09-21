import {normalizeImvuRoom} from './room-runtime.mjs';
const base='https://api.imvu.com';
const cache=new Map(),pending=new Map();
const text=(value,max=200)=>typeof value==='string'?value.slice(0,max):null;
async function get(path){
 const old=cache.get(path);if(old&&old.until>Date.now())return old.value;
 if(pending.has(path))return pending.get(path);
 const job=(async()=>{
  let response;try{response=await fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(5000),headers:{Accept:'application/json'}});}catch{throw new Error('IMVU_UNAVAILABLE');}
  if(!response.ok)throw new Error(response.status===404?'IMVU_NOT_FOUND':response.status===401||response.status===403?'IMVU_RESTRICTED':response.status===429?'IMVU_RATE_LIMIT':'IMVU_UNAVAILABLE');
  const value=await response.json();if(value.status!=='success'||!value.denormalized)throw new Error('IMVU_UNAVAILABLE');
  if(cache.size>=100)cache.delete(cache.keys().next().value);
  cache.set(path,{value,until:Date.now()+60000});return value;
 })();pending.set(path,job);try{return await job;}finally{pending.delete(path);}
}
export async function lookupUser(input){
 if(typeof input!=='string')throw new Error('INVALID_IMVU_USER');
 let query=input.trim();if(!query||query.length>100)throw new Error('INVALID_IMVU_USER');
 if(query.startsWith('https://')){
  let url;try{url=new URL(query);}catch{throw new Error('INVALID_IMVU_USER');}
  if(url.username||url.password||url.port||!['www.imvu.com','imvu.com','api.imvu.com'].includes(url.hostname))throw new Error('INVALID_IMVU_USER');
  const match=/^\/(?:next\/av\/|user\/user-)(\d+)\/?$/.exec(url.pathname);
  if(!match)throw new Error('INVALID_IMVU_USER');query=match[1];
 }
 if(!/^[a-zA-Z0-9_]{1,64}$/.test(query))throw new Error('INVALID_IMVU_USER');
 let id=query;
 if(!/^\d+$/.test(query)){
  const data=await get('/user?username='+encodeURIComponent(query));
  const items=data.denormalized[data.id]?.data?.items;
  const ref=Array.isArray(items)?items.find(ref=>String(data.denormalized[ref]?.data?.username).toLowerCase()===query.toLowerCase()):null;
  id=typeof ref==='string'?/^https:\/\/api\.imvu\.com\/user\/user-(\d+)$/.exec(ref)?.[1]:null;
  if(!id)throw new Error('IMVU_NOT_FOUND');
 }
 const path='/user/user-'+id,data=await get(path),user=data.denormalized[base+path]?.data;
 if(!user||String(user.legacy_cid)!==id||typeof user.username!=='string')throw new Error('IMVU_NOT_FOUND');
 return {kind:'user',id,username:user.username,displayName:text(user.display_name)||user.username,created:text(user.created),tagline:text(user.tagline,500),isCreator:user.is_creator===true,isVip:user.is_vip===true,profileUrl:`https://www.imvu.com/next/av/${id}/`,source:'IMVU',fetchedAt:new Date().toISOString()};
}
export async function lookupRoom(input){
 const {imvuRoomId:id,roomUrl}=normalizeImvuRoom(input);
 const path='/room/room-'+id,payload=await get(path),room=payload.denormalized[base+path]?.data;
 if(!room||typeof room.name!=='string'||`${room.customers_id}-${room.customers_room_id}`!==id)throw new Error('IMVU_NOT_FOUND');
 return {kind:'room',id,name:room.name,description:text(room.description,1000),ownerId:String(room.customers_id),ownerName:text(room.owner_avatarname),capacity:Number.isFinite(room.capacity)?room.capacity:null,occupancy:Number.isFinite(room.occupancy)?room.occupancy:null,privacy:text(room.privacy),language:text(room.language),isAp:room.is_ap===true,isVip:room.is_vip===true,roomUrl,source:'IMVU',fetchedAt:new Date().toISOString()};
}
