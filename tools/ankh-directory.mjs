import {lookupUser} from './imvu-directory.mjs';
import {normalizeImvuRoom} from './room-runtime.mjs';
export async function lookupAnkh(kind,query){
 let id;
 if(kind==='room')id=normalizeImvuRoom(query).imvuRoomId;
 else if(kind==='user')id=/^\d{1,20}$/.test(query.trim())?query.trim():(await lookupUser(query)).id;
 else throw new Error('INVALID_QUERY');
 const url=new URL(`http://127.0.0.1:3250/api/info/${kind}`);url.searchParams.set(kind==='user'?'userId':'roomId',id);
 let response;
 try{response=await fetch(url,{method:kind==='room'?'POST':'GET',signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw new Error('ANKH_UNAVAILABLE');}
 if(!response.ok)throw new Error(response.status===404?'IMVU_NOT_FOUND':response.status===429?'ANKH_BUSY':'ANKH_UPSTREAM_ERROR');
 const data=await response.json();
 if(data.id!==id||data.kind!==kind||data.source!=='Ankh')throw new Error('ANKH_UPSTREAM_ERROR');
 return data;
}
