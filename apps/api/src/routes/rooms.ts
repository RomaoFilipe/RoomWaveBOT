import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@roomwave/database";

const createRoomSchema = z.object({
  name: z.string().min(1).max(150),
  imvuRoomId: z.string().min(1).optional(),
  streamUrl: z.string().url().optional(),
});

export async function roomsRoutes(app: FastifyInstance) {
  app.get("/rooms", async () => {
    const rooms = await prisma.room.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        _count: {
          select: {
            members: true,
            queueItems: true,
          },
        },
      },
    });

    return {
      rooms,
    };
  });

  app.get("/rooms/:roomId", async (request, reply) => {
    const { roomId } = request.params as {
      roomId: string;
    };

    const room = await prisma.room.findUnique({
      where: {
        id: roomId,
      },
      include: {
        members: {
          include: {
            user: true,
          },
        },
        djs: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!room) {
      return reply.status(404).send({
        error: "ROOM_NOT_FOUND",
      });
    }

    return {
      room,
    };
  });

  app.post("/rooms", async (request, reply) => {
    const result = createRoomSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "INVALID_REQUEST",
        details: result.error.flatten(),
      });
    }

    const room = await prisma.room.create({
      data: {
        name: result.data.name,
        imvuRoomId: result.data.imvuRoomId,
        streamUrl: result.data.streamUrl,
      },
    });

    return reply.status(201).send({
      room,
    });
  });
}
