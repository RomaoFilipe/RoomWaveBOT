import {
  addTrack,
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

  const result =
    await addTrack(
      args.trim(),
      imvuUserId,
    );

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
