// Requires the local database and the private bot key; creates and deletes a test room.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { prisma } from "@roomwave/database";
import { customCommandsRoutes } from "../src/routes/custom-commands.js";

const app = Fastify();
await app.register(customCommandsRoutes);
const suffix = randomUUID();
const room = await prisma.room.create({ data: { name: `command-test-${suffix}` } });
const users: string[] = [];
try {
  for (const role of ["OWNER", "ADMIN", "DJ", "USER"] as const) {
    const user = await prisma.user.create({ data: { username: role, imvuUserId: `${suffix}-${role}` } });
    users.push(user.id);
    await prisma.roomMember.create({ data: { roomId: room.id, userId: user.id, role } });
  }
  const key = (await readFile("/home/ubuntu/roomwave/.data/custom-commands.key", "utf8")).trim();
  const call = (role: string, action: string, name?: string, response?: string, authenticated = true) => app.inject({
    method: "POST", url: `/rooms/${room.id}/commands`,
    headers: authenticated ? { "x-roomwave-bot-key": key } : {},
    payload: { imvuUserId: `${suffix}-${role}`, action, name, response },
  });
  assert.equal((await call("OWNER", "create", "festa", "22h", false)).statusCode, 401);
  for (const role of ["ADMIN", "DJ", "USER"]) {
    for (const action of ["create", "edit", "delete", "list"]) assert.equal((await call(role, action, "festa", "22h")).statusCode, 403);
  }
  assert.equal((await call("OWNER", "create", "add", "unsafe override")).statusCode, 400);
  assert.equal((await call("OWNER", "create", "festa", "22h")).statusCode, 200);
  assert.equal((await call("OWNER", "create", "festa", "23h")).statusCode, 409);
  assert.equal((await app.inject(`/rooms/${room.id}/commands/festa`)).json().response, "22h");
  assert.equal((await app.inject(`/rooms/${suffix}/commands/festa`)).statusCode, 404);
  assert.equal((await call("OWNER", "edit", "festa", "23h")).statusCode, 200);
  assert.equal((await app.inject(`/rooms/${room.id}/commands/festa`)).json().response, "23h");
  assert.deepEqual((await call("OWNER", "list")).json().names, ["festa"]);
  assert.equal((await call("OWNER", "edit", "festa", "x".repeat(501))).statusCode, 400);
  assert.equal((await call("OWNER", "delete", "festa")).statusCode, 200);
  assert.equal((await app.inject(`/rooms/${room.id}/commands/festa`)).statusCode, 404);
  assert.equal((await call("OWNER", "edit", "missing", "hello")).statusCode, 404);
  console.log("Custom command lifecycle, room isolation, reserved names and owner-only permissions: OK");
} finally {
  await prisma.room.delete({ where: { id: room.id } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await app.close();
  await prisma.$disconnect();
}
