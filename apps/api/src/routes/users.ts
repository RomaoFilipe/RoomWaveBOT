import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@roomwave/database";

const createUserSchema = z.object({
  username: z.string().min(1).max(100),
  imvuUserId: z.string().min(1).optional(),
});

export async function usersRoutes(app: FastifyInstance) {
  app.get("/users", async () => {
    const users = await prisma.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      users,
    };
  });

  app.post("/users", async (request, reply) => {
    const result = createUserSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "INVALID_REQUEST",
        details: result.error.flatten(),
      });
    }

    const user = await prisma.user.create({
      data: {
        username: result.data.username,
        imvuUserId: result.data.imvuUserId,
      },
    });

    return reply.status(201).send({
      user,
    });
  });
}
