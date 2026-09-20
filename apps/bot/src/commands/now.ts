import {
  getNow,
} from "../services/api.js";

export async function nowCommand(): Promise<string> {
  const result =
    await getNow();

  if (result.playing) {
    const by =
      result.playing.requestedBy
        ?.username ??
      "AutoDJ";

    return [
      "🎵 A TOCAR AGORA",
      `${result.playing.track.artist} - ${result.playing.track.title}`,
      `👤 Pedido por: ${by}`,
    ].join("\n");
  }

  if (result.next) {
    const by =
      result.next.requestedBy
        ?.username ??
      "AutoDJ";

    return [
      "⏭️ PRÓXIMA NA FILA",
      `${result.next.track.artist} - ${result.next.track.title}`,
      `👤 Pedido por: ${by}`,
      "",
      "ℹ️ O player ainda não marcou nenhuma faixa como PLAYING.",
    ].join("\n");
  }

  return "🎵 Não há músicas na fila.";
}
