import { radioVolume } from "../services/radio-volume.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "@roomwave/database";

const actorSchema = z.object({
  imvuUserId: z
    .string()
    .trim()
    .min(1)
    .max(64),
});

const removeSchema =
  actorSchema.extend({
    position:
      z.number().int().positive(),
  });

async function getActor(
  roomId: string,
  imvuUserId: string,
) {
  return prisma.roomMember.findFirst({
    where: {
      roomId,

      user: {
        is: {
          imvuUserId,
        },
      },
    },

    include: {
      user: true,
    },
  });
}

function canSkip(
  role: string,
) {
  return [
    "OWNER",
    "ADMIN",
    "MODERATOR",
    "DJ",
  ].includes(role);
}

function canRemove(
  role: string,
) {
  return [
    "OWNER",
    "ADMIN",
    "MODERATOR",
  ].includes(role);
}

function canClear(
  role: string,
) {
  return [
    "OWNER",
    "ADMIN",
  ].includes(role);
}

async function renumberQueue(
  roomId: string,
) {
  const waiting =
    await prisma.queueItem.findMany({
      where: {
        roomId,
        status: "WAITING",
      },

      orderBy: {
        position: "asc",
      },
    });

  await prisma.$transaction(
    waiting.map(
      (item, index) =>
        prisma.queueItem.update({
          where: {
            id: item.id,
          },

          data: {
            position:
              index + 1,
          },
        }),
    ),
  );
}

export async function queueRoutes(
  app: FastifyInstance,
) {
  app.post("/rooms/:roomId/volume", async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const parsed = actorSchema.extend({ volume: z.number().int().min(0).max(100).optional() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_VOLUME" });
    const actor = await getActor(roomId, parsed.data.imvuUserId);
    if (!actor || !canSkip(actor.role)) return reply.code(403).send({ error: "INSUFFICIENT_ROLE" });
    try {
      return { volume: await radioVolume(parsed.data.volume) };
    } catch {
      return reply.code(503).send({ error: "RADIO_UNAVAILABLE" });
    }
  });
  app.get(
    "/rooms/:roomId/queue",
    async (request, reply) => {
      const { roomId } =
        request.params as {
          roomId: string;
        };

      const room =
        await prisma.room.findUnique({
          where: {
            id: roomId,
          },
        });

      if (!room) {
        return reply.status(404).send({
          error:
            "ROOM_NOT_FOUND",
        });
      }

      const queue =
        await prisma.queueItem.findMany({
          where: {
            roomId,
            status: "WAITING",
          },

          orderBy: {
            position: "asc",
          },

          include: {
            track: true,
            requestedBy: true,
          },
        });

      return {
        roomId,
        count: queue.length,
        queue,
      };
    },
  );

  /*
   * Música atualmente marcada PLAYING.
   * Se ainda não existir player, devolve
   * também a próxima WAITING.
   */
  app.get(
    "/rooms/:roomId/now",
    async (request, reply) => {
      const { roomId } =
        request.params as {
          roomId: string;
        };

      const room =
        await prisma.room.findUnique({
          where: {
            id: roomId,
          },
        });

      if (!room) {
        return reply.status(404).send({
          error:
            "ROOM_NOT_FOUND",
        });
      }

      const playing =
        await prisma.queueItem.findFirst({
          where: {
            roomId,
            status: "PLAYING",
          },

          orderBy: {
            position: "asc",
          },

          include: {
            track: true,
            requestedBy: true,
          },
        });

      const next =
        await prisma.queueItem.findFirst({
          where: {
            roomId,
            status: "WAITING",
          },

          orderBy: {
            position: "asc",
          },

          include: {
            track: true,
            requestedBy: true,
          },
        });

      return {
        playing,
        next,
      };
    },
  );

  /*
   * Saltar PLAYING.
   * Enquanto ainda não houver player,
   * salta o primeiro WAITING.
   */
  app.post(
    "/rooms/:roomId/skip",
    async (request, reply) => {
      const { roomId } =
        request.params as {
          roomId: string;
        };

      const parsed =
        actorSchema.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return reply.status(400).send({
          error:
            "INVALID_REQUEST",
        });
      }

      const actor =
        await getActor(
          roomId,
          parsed.data.imvuUserId,
        );

      if (!actor) {
        return reply.status(403).send({
          error:
            "USER_NOT_IN_ROOM",
        });
      }

      if (!canSkip(actor.role)) {
        return reply.status(403).send({
          error:
            "INSUFFICIENT_ROLE",
        });
      }

      let item =
        await prisma.queueItem.findFirst({
          where: {
            roomId,
            status: "PLAYING",
          },

          orderBy: {
            position: "asc",
          },

          include: {
            track: true,
            requestedBy: true,
          },
        });

      let wasPlaying = true;

      if (!item) {
        wasPlaying = false;

        item =
          await prisma.queueItem.findFirst({
            where: {
              roomId,
              status: "WAITING",
            },

            orderBy: {
              position: "asc",
            },

            include: {
              track: true,
              requestedBy: true,
            },
          });
      }

      if (!item) {
        return reply.status(409).send({
          error:
            "QUEUE_EMPTY",
        });
      }

      await prisma.queueItem.update({
        where: {
          id: item.id,
        },

        data: {
          status: "SKIPPED",
          playedAt: new Date(),
        },
      });

      await renumberQueue(roomId);

      return {
        message:
          "TRACK_SKIPPED",

        wasPlaying,

        track: item.track,

        actor: actor.user,
      };
    },
  );

  app.post(
    "/rooms/:roomId/remove",
    async (request, reply) => {
      const { roomId } =
        request.params as {
          roomId: string;
        };

      const parsed =
        removeSchema.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return reply.status(400).send({
          error:
            "INVALID_REQUEST",
        });
      }

      const actor =
        await getActor(
          roomId,
          parsed.data.imvuUserId,
        );

      if (!actor) {
        return reply.status(403).send({
          error:
            "USER_NOT_IN_ROOM",
        });
      }

      if (!canRemove(actor.role)) {
        return reply.status(403).send({
          error:
            "INSUFFICIENT_ROLE",
        });
      }

      const item =
        await prisma.queueItem.findFirst({
          where: {
            roomId,
            position:
              parsed.data.position,
            status: "WAITING",
          },

          include: {
            track: true,
          },
        });

      if (!item) {
        return reply.status(404).send({
          error:
            "QUEUE_ITEM_NOT_FOUND",
        });
      }

      await prisma.queueItem.update({
        where: {
          id: item.id,
        },

        data: {
          status: "REMOVED",
        },
      });

      await renumberQueue(roomId);

      return {
        message:
          "TRACK_REMOVED",

        position:
          parsed.data.position,

        track:
          item.track,

        actor:
          actor.user,
      };
    },
  );

  app.post(
    "/rooms/:roomId/clear",
    async (request, reply) => {
      const { roomId } =
        request.params as {
          roomId: string;
        };

      const parsed =
        actorSchema.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return reply.status(400).send({
          error:
            "INVALID_REQUEST",
        });
      }

      const actor =
        await getActor(
          roomId,
          parsed.data.imvuUserId,
        );

      if (!actor) {
        return reply.status(403).send({
          error:
            "USER_NOT_IN_ROOM",
        });
      }

      if (!canClear(actor.role)) {
        return reply.status(403).send({
          error:
            "INSUFFICIENT_ROLE",
        });
      }

      const result =
        await prisma.queueItem.updateMany({
          where: {
            roomId,
            status: "WAITING",
          },

          data: {
            status: "REMOVED",
          },
        });

      return {
        message:
          "QUEUE_CLEARED",

        removed:
          result.count,

        actor:
          actor.user,
      };
    },
  );
}
