import { prisma } from "./client.js";

async function main() {
  const users = await prisma.user.count();
  const rooms = await prisma.room.count();
  const tracks = await prisma.track.count();
  const queue = await prisma.queueItem.count();

  console.log("");
  console.log("=================================");
  console.log("       🎵 ROOMWAVE DATABASE");
  console.log("=================================");
  console.log(`Users:  ${users}`);
  console.log(`Rooms:  ${rooms}`);
  console.log(`Tracks: ${tracks}`);
  console.log(`Queue:  ${queue}`);
  console.log("");
  console.log("✅ PostgreSQL connection OK");
}

main()
  .catch((error) => {
    console.error("❌ Database error");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
