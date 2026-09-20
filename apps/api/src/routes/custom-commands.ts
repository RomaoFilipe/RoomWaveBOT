import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@roomwave/database";

export const reservedNames = new Set([
  "ping", "help", "comandos", "regras", "radio", "staff", "add", "queue", "now",
  "volume", "skip", "remove", "clear", "disconnect", "pause", "resume", "stop",
  "criarcomando", "editarcomando", "apagarcomando", "listarcomandos",
]);
const bodySchema = z.object({
  action: z.enum(["create", "edit", "delete", "list"]),
  imvuUserId: z.string().trim().min(1).max(64),
  name: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/).optional(),
  response: z.string().trim().min(1).max(500).optional(),
});
const keyPath = "/home/ubuntu/roomwave/.data/custom-commands.key";

export async function customCommandsRoutes(app: FastifyInstance) {
  app.get("/rooms/:roomId/commands/:name", async (request, reply) => {
    const { roomId, name } = request.params as { roomId: string; name: string };
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name) || reservedNames.has(name)) return reply.code(404).send({ error: "NOT_FOUND" });
    const command = await prisma.customCommand.findUnique({ where: { roomId_name: { roomId, name } }, select: { response: true } });
    return command ?? reply.code(404).send({ error: "NOT_FOUND" });
  });

  app.post("/rooms/:roomId/commands", async (request, reply) => {
    // Only the trusted bot may assert an IMVU identity for management actions.
    const expected = Buffer.from((await readFile(keyPath, "utf8")).trim());
    const supplied = Buffer.from(String(request.headers["x-roomwave-bot-key"] ?? ""));
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_COMMAND" });
    const { roomId } = request.params as { roomId: string };
    const { action, name, response, imvuUserId } = parsed.data;
    const actor = await prisma.roomMember.findFirst({ where: { roomId, user: { is: { imvuUserId } } }, select: { role: true } });
    if (actor?.role !== "OWNER") return reply.code(403).send({ error: "OWNER_ONLY" });
    if (action === "list") return { names: (await prisma.customCommand.findMany({ where: { roomId }, orderBy: { name: "asc" }, select: { name: true } })).map(c => c.name) };
    if (!name || reservedNames.has(name)) return reply.code(400).send({ error: "RESERVED_OR_INVALID_NAME" });
    if (action !== "delete" && !response) return reply.code(400).send({ error: "RESPONSE_REQUIRED" });
    try {
      if (action === "create") await prisma.customCommand.create({ data: { roomId, name, response: response! } });
      if (action === "edit") {
        const result = await prisma.customCommand.updateMany({ where: { roomId, name }, data: { response: response! } });
        if (!result.count) return reply.code(404).send({ error: "NOT_FOUND" });
      }
      if (action === "delete") {
        const result = await prisma.customCommand.deleteMany({ where: { roomId, name } });
        if (!result.count) return reply.code(404).send({ error: "NOT_FOUND" });
      }
      return { ok: true, name };
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return reply.code(409).send({ error: "ALREADY_EXISTS" });
      throw error;
    }
  });
}
