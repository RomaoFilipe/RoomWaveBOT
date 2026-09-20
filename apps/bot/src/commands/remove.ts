import {
  removeTrack,
} from "../services/api.js";

export async function removeCommand(
  args: string,
  imvuUserId?: string,
): Promise<string> {
  if (!imvuUserId) {
    return (
      "❌ !remove só está disponível através do gateway IMVU."
    );
  }

  const position =
    Number(args.trim());

  if (
    !Number.isInteger(position) ||
    position <= 0
  ) {
    return (
      "❌ Utilização: !remove <posição>"
    );
  }

  const result =
    await removeTrack(
      position,
      imvuUserId,
    );

  return [
    "🗑️ MÚSICA REMOVIDA",
    `${result.track.artist} - ${result.track.title}`,
    `📋 Posição: #${result.position}`,
    `👤 Por: ${result.actor.username}`,
  ].join("\n");
}
