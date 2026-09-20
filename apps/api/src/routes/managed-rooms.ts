import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@roomwave/database";
import { normalizeImvuRoom } from "../../../../tools/room-runtime.mjs";
const schema=z.object({
  action:z.enum(["list","save","get","release"]),
  managementRoomId:z.string().uuid(), imvuUserId:z.string().min(1).max(64),
  roomId:z.string().uuid().optional(), name:z.string().trim().min(1).max(100).optional(),
  location:z.string().trim().min(1).max(300).optional(),
});
export async function managedRoomsRoutes(app: FastifyInstance) {
  app.post("/managed-rooms",async(request,reply)=>{
    const key=Buffer.from((await readFile("/home/ubuntu/roomwave/.data/custom-commands.key","utf8")).trim());
    const supplied=Buffer.from(String(request.headers["x-roomwave-bot-key"]??""));
    if(key.length!==supplied.length||!timingSafeEqual(key,supplied))return reply.code(401).send({error:"UNAUTHORIZED"});
    const parsed=schema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:"INVALID_ROOM"});
    const data=parsed.data;
    const member=await prisma.roomMember.findFirst({where:{roomId:data.managementRoomId,role:"OWNER",user:{is:{imvuUserId:data.imvuUserId}}}});
    if(!member)return reply.code(403).send({error:"OWNER_ONLY"});
    const owned={members:{some:{userId:member.userId,role:"OWNER" as const}}};
    if(data.action==="list")return {rooms:await prisma.room.findMany({where:{...owned,status:"ACTIVE"},select:{id:true,name:true,imvuRoomId:true},orderBy:{createdAt:"asc"}})};
    if(data.action==="save"){
      if(!data.name||!data.location)return reply.code(400).send({error:"INVALID_ROOM"});
      let location;try{location=normalizeImvuRoom(data.location);}catch{return reply.code(400).send({error:"INVALID_IMVU_ROOM"});}
      const existing=await prisma.room.findUnique({where:{imvuRoomId:location.imvuRoomId},include:{members:{where:{userId:member.userId,role:"OWNER"}}}});
      if(existing){if(!existing.members.length)return reply.code(403).send({error:"ROOM_NOT_OWNED"});return {room:{id:existing.id,name:existing.name,imvuRoomId:existing.imvuRoomId},existing:true};}
      try {
        const room=await prisma.room.create({data:{name:data.name,imvuRoomId:location.imvuRoomId,members:{create:{userId:member.userId,role:"OWNER"}}},select:{id:true,name:true,imvuRoomId:true}});
        return {room};
      }catch(error){if((error as {code?:string}).code==="P2002")return reply.code(409).send({error:"ROOM_ALREADY_EXISTS"});throw error;}
    }
    if(!data.roomId)return reply.code(400).send({error:"INVALID_ROOM"});
    const room=await prisma.room.findFirst({where:{id:data.roomId,...owned,status:"ACTIVE"},select:{id:true,name:true,imvuRoomId:true}});
    if(!room)return reply.code(403).send({error:"ROOM_NOT_OWNED"});
    if(data.action==="get")return {room};
    // Called only after both bot and player have stopped and audio has been stopped.
    // Preserve the interrupted track at the front of its own room's queue.
    await prisma.$transaction(async tx=>{
      const playing=await tx.queueItem.findMany({where:{roomId:room.id,status:"PLAYING"},orderBy:{position:"asc"}});
      const waiting=await tx.queueItem.findMany({where:{roomId:room.id,status:"WAITING"},orderBy:{position:"asc"}});
      let position=1;
      for(const item of [...playing,...waiting])await tx.queueItem.update({where:{id:item.id},data:{status:"WAITING",position:position++,playedAt:null}});
      if(playing.length)await tx.playbackHistory.updateMany({where:{roomId:room.id,endedAt:null,trackId:{in:playing.map(item=>item.trackId)}},data:{endedAt:new Date()}});
    },{maxWait:10000,timeout:20000});
    return {ok:true};
  });
}
