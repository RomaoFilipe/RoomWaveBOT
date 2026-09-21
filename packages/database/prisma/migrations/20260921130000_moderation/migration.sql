CREATE TYPE "ModerationAction" AS ENUM ('WARN', 'KICK');
CREATE TYPE "ModerationStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'FAILED', 'UNCONFIRMED');
CREATE TABLE "ModerationEvent" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "roomId" TEXT NOT NULL REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "actorCid" TEXT NOT NULL, "actorName" TEXT NOT NULL,
 "targetCid" TEXT NOT NULL, "targetName" TEXT NOT NULL,
 "reason" TEXT NOT NULL, "action" "ModerationAction" NOT NULL,
 "status" "ModerationStatus" NOT NULL DEFAULT 'REQUESTED', "resultCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ModerationEvent_roomId_createdAt_idx" ON "ModerationEvent"("roomId", "createdAt");
CREATE INDEX "ModerationEvent_createdAt_idx" ON "ModerationEvent"("createdAt");
