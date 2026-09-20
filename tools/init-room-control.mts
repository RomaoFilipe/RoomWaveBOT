import { prisma } from '../packages/database/src/index.js';
import { normalizeImvuRoom } from './room-runtime.mjs';
try {
  const id=process.env.ROOMWAVE_ROOM_ID;
  if(!id)throw new Error('ROOMWAVE_ROOM_ID required');
  const location=normalizeImvuRoom(process.env.IMVU_ROOM_ID||process.env.IMVU_ROOM_URL);
  const room=await prisma.room.findUniqueOrThrow({where:{id}});
  if(room.imvuRoomId && room.imvuRoomId!==location.imvuRoomId)throw new Error('ROOM_CONFIGURATION_MISMATCH');
  if(!room.imvuRoomId)await prisma.room.update({where:{id},data:{imvuRoomId:location.imvuRoomId}});
  console.log('Sala atual associada ao ID IMVU; fila e membros preservados.');
}finally{await prisma.$disconnect();}
