import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "@roomwave/database";

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z
    .enum([
      "OWNER",
      "ADMIN",
      "MODERATOR",
      "DJ",
      "VIP",
      "USER",
    ])
    .default("USER"),
});

const ensureImvuMemberSchema = z.object({
  imvuUserId: z
    .string()
    .trim()
    .min(1)
    .max(64),
});

export async function membersRoutes(
  app: FastifyInstance,
) {
  app.post(
    "/rooms/:roomId/members",
    async (request, reply) => {
      const { roomId } =
        request.params as {
          roomId: string;
        };

      const result =
        addMemberSchema.safeParse(
          request.body,
        );

      if (!result.success) {
        return reply.status(400).send({
          error: "INVALID_REQUEST",
          details:
            result.error.flatten(),
        });
      }

      const room =
        await prisma.room.findUnique({
          where: {
            id: roomId,
          },
        });

      if (!room) {
        return reply.status(404).send({
          error: "ROOM_NOT_FOUND",
        });
      }

      const user =
        await prisma.user.findUnique({
          where: {
            id: result.data.userId,
          },
        });

      if (!user) {
        return reply.status(404).send({
          error: "USER_NOT_FOUND",
        });
      }

      const membership =
        await prisma.roomMember.upsert({
          where: {
            roomId_userId: {
              roomId,
              userId:
                result.data.userId,
            },
          },

          update: {
            role: result.data.role,
          },

          create: {
            roomId,
            userId:
              result.data.userId,
            role: result.data.role,
          },
        });

      return reply
        .status(201)
        .send({
          membership,
        });
    },
  );

  /*
   * Garante que um utilizador IMVU
   * possui User + RoomMember.
   *
   * Utilizadores novos entram sempre
   * como USER. Nunca são elevados aqui.
   */
  app.post(
    "/rooms/:roomId/imvu-members/ensure",
    async (request, reply) => {
      const { roomId } =
        request.params as {
          roomId: string;
        };

      const parsed =
        ensureImvuMemberSchema.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return reply.status(400).send({
          error: "INVALID_REQUEST",
          details:
            parsed.error.flatten(),
        });
      }

      const room =
        await prisma.room.findUnique({
          where: {
            id: roomId,
          },
        });

      if (!room) {
        return reply.status(404).send({
          error: "ROOM_NOT_FOUND",
        });
      }

      const {
        imvuUserId,
      } = parsed.data;

      let user =
        await prisma.user.findUnique({
          where: {
            imvuUserId,
          },
        });

      if (!user) {
        user =
          await prisma.user.create({
            data: {
              imvuUserId,
              username:
                `IMVU-${imvuUserId}`,
            },
          });
      }

      const membership =
        await prisma.roomMember.upsert({
          where: {
            roomId_userId: {
              roomId,
              userId: user.id,
            },
          },

          update: {},

          create: {
            roomId,
            userId: user.id,
            role: "USER",
          },

          include: {
            user: true,
          },
        });

      return {
        user: membership.user,
        role: membership.role,
      };
    },
  );
}
