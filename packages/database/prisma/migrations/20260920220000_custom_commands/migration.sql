CREATE TABLE "CustomCommand" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "response" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomCommand_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomCommand_roomId_name_key" ON "CustomCommand"("roomId", "name");
