import {prisma} from '@roomwave/database';
import {lookupRoom} from '../../../../tools/imvu-directory.mjs';
export async function verifyOwnedRoom(roomId:string,ownerId:string){
 const room=await prisma.room.findFirst({where:{id:roomId,status:'ACTIVE',members:{some:{role:'OWNER',user:{is:{imvuUserId:ownerId}}}}},select:{id:true,name:true,imvuRoomId:true}});
 if(!room?.imvuRoomId)throw new Error('ROOM_NOT_OWNED');
 const actual=await lookupRoom(room.imvuRoomId);
 if(actual.ownerId!==ownerId)throw new Error('IMVU_OWNER_MISMATCH');
 return {...room,imvuName:actual.name,ownerId:actual.ownerId,ownerName:actual.ownerName,verifiedAt:actual.fetchedAt};
}
export async function verifyRecordingRoom(roomId:string,ownerId?:string){
 if(ownerId)return verifyOwnedRoom(roomId,ownerId);
 // Existing opt-ins must also belong to a verified IMVU owner.
 const room=await prisma.room.findUnique({where:{id:roomId},select:{imvuRoomId:true}});
 if(!room?.imvuRoomId)throw new Error('ROOM_NOT_OWNED');
 const actual=await lookupRoom(room.imvuRoomId);
 return verifyOwnedRoom(roomId,actual.ownerId);
}
