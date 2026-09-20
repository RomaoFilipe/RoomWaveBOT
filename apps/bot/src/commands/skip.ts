import {
  skipTrack,
} from "../services/api.js";

export async function skipCommand(
  imvuUserId?: string,
): Promise<string> {
  if (!imvuUserId) {
    return (
      "❌ !skip só está disponível através do gateway IMVU."
    );
  }

  const result =
    await skipTrack(
      imvuUserId,
    );

  return [
    "⏭️ MÚSICA SALTADA",
    `${result.track.artist} - ${result.track.title}`,
    `👤 Por: ${result.actor.username}`,
  ].join("\n");
}
