import {
  clearQueue,
} from "../services/api.js";

export async function clearCommand(
  imvuUserId?: string,
): Promise<string> {
  if (!imvuUserId) {
    return (
      "❌ !clear só está disponível através do gateway IMVU."
    );
  }

  const result =
    await clearQueue(
      imvuUserId,
    );

  return [
    "🧹 FILA LIMPA",
    `🗑️ ${result.removed} música(s) removida(s)`,
    `👤 Por: ${result.actor.username}`,
  ].join("\n");
}
