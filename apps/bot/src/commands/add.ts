import {
  addTrack,
  RoomWaveApiError,
} from "../services/api.js";

export async function addCommand(
  args: string,
  imvuUserId?: string,
): Promise<string> {
  if (!args.trim()) {
    return (
      "❌ Utilização: !add nome da música"
    );
  }

  let result;
  try {
    result = await addTrack(args.trim(), imvuUserId);
  } catch (error) {
    if (error instanceof RoomWaveApiError && error.code === "TRACK_NOT_FOUND") {
      return "❌ Não consegui encontrar esta música no YouTube. O vídeo pode estar indisponível. Tenta outro link ou !add artista - título.";
    }
    throw error;
  }

  const duration =
    result.track.durationSec
      ? `${Math.floor(
          result.track.durationSec /
            60,
        )}:${String(
          result.track.durationSec %
            60,
        ).padStart(2, "0")}`
      : "desconhecida";

  return [
    "🎵 ADICIONADO À FILA",
    `${result.track.artist} - ${result.track.title}`,
    `⏱️ ${duration}`,
    `📋 Posição: #${result.position}`,
    `👤 Pedido por: ${result.requestedBy.username}`,
  ].join("\n");
}
