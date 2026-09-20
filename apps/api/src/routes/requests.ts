import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "@roomwave/database";
import { searchTrack } from "@roomwave/music";

const requestSchema = z
  .object({
    userId:
      z.string().uuid().optional(),

    imvuUserId:
      z
        .string()
        .trim()
        .min(1)
        .max(64)
        .optional(),

    query:
      z
        .string()
        .trim()
        .min(1)
        .max(200),
  })
  .refine(
    (data) =>
      Boolean(
        data.userId ||
        data.imvuUserId,
      ),
    {
      message:
        "userId ou imvuUserId é obrigatório",
    },
  );

export async function requestsRoutes(
  app: FastifyInstance,
) {
  app.post(
    "/rooms/:roomId/requests",
    async (request, reply) => {
      const { roomId } =
        request.params as {
          roomId: string;
        };

      const parsed =
        requestSchema.safeParse(
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

      const membership =
        parsed.data.imvuUserId
          ? await prisma.roomMember.findFirst({
              where: {
                roomId,

                user: {
                  is: {
                    imvuUserId:
                      parsed.data
                        .imvuUserId,
                  },
                },
              },

              include: {
                user: true,
              },
            })
          : await prisma.roomMember.findUnique({
              where: {
                roomId_userId: {
                  roomId,
                  userId:
                    parsed.data
                      .userId!,
                },
              },

              include: {
                user: true,
              },
            });

      if (!membership) {
        return reply.status(403).send({
          error:
            "USER_NOT_IN_ROOM",
        });
      }

      let foundTrack;

      try {
        foundTrack =
          await searchTrack(
            parsed.data.query,
          );
      } catch (error) {
        request.log.error(error);

        return reply.status(502).send({
          error:
            "MUSIC_SEARCH_FAILED",
        });
      }

      if (!foundTrack) {
        return reply.status(404).send({
          error:
            "TRACK_NOT_FOUND",
        });
      }

      const result =
        await prisma.$transaction(
          async (tx) => {
            const track =
              await tx.track.upsert({
                where: {
                  provider_externalId: {
                    provider:
                      foundTrack.provider,
                    externalId:
                      foundTrack.externalId,
                  },
                },

                update: {
                  title:
                    foundTrack.title,
                  artist:
                    foundTrack.artist,
                  durationSec:
                    foundTrack.durationSec,
                  artworkUrl:
                    foundTrack.artworkUrl,
                  sourceUrl:
                    foundTrack.sourceUrl,
                },

                create: {
                  provider:
                    foundTrack.provider,
                  externalId:
                    foundTrack.externalId,
                  title:
                    foundTrack.title,
                  artist:
                    foundTrack.artist,
                  durationSec:
                    foundTrack.durationSec,
                  artworkUrl:
                    foundTrack.artworkUrl,
                  sourceUrl:
                    foundTrack.sourceUrl,
                },
              });

            const lastItem =
              await tx.queueItem.findFirst({
                where: {
                  roomId,
                  status: "WAITING",
                },

                orderBy: {
                  position: "desc",
                },
              });

            const position =
              (lastItem?.position ??
                0) + 1;

            const musicRequest =
              await tx.musicRequest.create({
                data: {
                  roomId,
                  requestedById:
                    membership.userId,
                  trackId:
                    track.id,
                  query:
                    parsed.data.query,
                  status: "QUEUED",
                },
              });

            const queueItem =
              await tx.queueItem.create({
                data: {
                  roomId,
                  trackId:
                    track.id,
                  requestedById:
                    membership.userId,
                  position,
                  status: "WAITING",
                },

                include: {
                  track: true,
                  requestedBy: true,
                },
              });

            return {
              musicRequest,
              queueItem,
            };
          },
        );

      return reply
        .status(201)
        .send({
          message:
            "TRACK_ADDED_TO_QUEUE",

          position:
            result.queueItem.position,

          track:
            result.queueItem.track,

          requestedBy:
            result.queueItem
              .requestedBy,

          requestId:
            result.musicRequest.id,
        });
    },
  );
}
