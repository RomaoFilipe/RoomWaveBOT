export function getImvuRoomUrl(): string {
  const configuredUrl = process.env.IMVU_ROOM_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  const roomId = process.env.IMVU_ROOM_ID;

  if (!roomId) {
    throw new Error("IMVU_ROOM_ID não está configurado.");
  }

  if (!/^\d+-\d+$/.test(roomId)) {
    throw new Error(
      `IMVU_ROOM_ID inválido: ${roomId}. Esperado: CID-ROOMID`,
    );
  }

  return `https://go.imvu.com/chat/room-${roomId}`;
}
