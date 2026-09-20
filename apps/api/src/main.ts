import Fastify from "fastify";
import cors from "@fastify/cors";

import { queueRoutes } from "./routes/queue.js";
import { requestsRoutes } from "./routes/requests.js";
import { usersRoutes } from "./routes/users.js";
import { roomsRoutes } from "./routes/rooms.js";
import { membersRoutes } from "./routes/members.js";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
});

app.get("/", async () => {
  return {
    name: "RoomWave API",
    version: "0.1.0",
    status: "online",
  };
});

app.get("/health", async () => {
  return {
    status: "ok",
    service: "roomwave-api",
    database: "connected",
    timestamp: new Date().toISOString(),
  };
});

await app.register(usersRoutes, {
  prefix: "/api",
});

await app.register(roomsRoutes, {
  prefix: "/api",
});

await app.register(membersRoutes, {
  prefix: "/api",
});

await app.register(queueRoutes, {
  prefix: "/api",
});

await app.register(requestsRoutes, {
  prefix: "/api",
});

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "0.0.0.0";

try {
  await app.listen({
    port,
    host,
  });

  console.log("");
  console.log("=================================");
  console.log("        🎵 ROOMWAVE API");
  console.log("=================================");
  console.log(`API: http://${host}:${port}`);
  console.log("=================================");
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
