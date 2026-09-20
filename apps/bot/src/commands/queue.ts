import { getQueue } from "../services/api.js";

export async function queueCommand(): Promise<string> {
  const result = await getQueue();

  if (result.count === 0) {
    return "📋 A fila está vazia.";
  }

  const lines = result.queue.map((item) => {
    const requestedBy =
      item.requestedBy?.username ?? "AutoDJ";

    return (
      `${item.position}. ` +
      `${item.track.artist} - ${item.track.title} ` +
      `(${requestedBy})`
    );
  });

  return [
    `📋 QUEUE — ${result.count} música(s)`,
    "",
    ...lines,
  ].join("\n");
}
