// Fresh authority checks: never infer IMVU privileges from local RoomWave roles.
export async function moderationAuthority(roomId, get = async url => {
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new Error('MODERATION_AUTHORITY_UNAVAILABLE');return response.json();
}) {
 if(!/^\d{1,20}-\d{1,20}$/.test(roomId))throw new Error('MODERATION_INVALID_ROOM');
 const root=`https://api.imvu.com/room/room-${roomId}`;
 const room=await get(root),data=room.denormalized?.[root]?.data;
 if(!data||`${data.customers_id}-${data.customers_room_id}`!==roomId)throw new Error('MODERATION_AUTHORITY_UNAVAILABLE');
 const url=root+'/moderators',payload=await get(url),entry=payload.denormalized?.[url];
 if(!Array.isArray(entry?.data?.items)||entry.relations?.next)throw new Error('MODERATION_AUTHORITY_UNAVAILABLE');
 const moderators=entry.data.items.map(ref=>{
  if(typeof ref!=='string'||!ref.startsWith(url+'/user-'))throw new Error('MODERATION_AUTHORITY_UNAVAILABLE');
  const cid=ref.slice((url+'/user-').length);
  if(!/^\d{1,20}$/.test(cid))throw new Error('MODERATION_AUTHORITY_UNAVAILABLE');return cid;
 });
 return {ownerId:String(data.customers_id),moderators};
}
export function checkModeration(authority, actorId, targetId, botId, action){
 const staff=id=>id===authority.ownerId||authority.moderators.includes(id);
 if(!staff(actorId))throw new Error('MODERATION_DENIED');
 if(targetId===actorId||targetId===botId||staff(targetId))throw new Error('MODERATION_PROTECTED');
 if(action==='KICK'&&!staff(botId))throw new Error('MODERATION_BOT_NOT_MODERATOR');
}
