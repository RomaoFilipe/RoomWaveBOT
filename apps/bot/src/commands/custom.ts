import { customCommandRequest, manageCustomCommand } from "../services/api.js";

export async function manageCommand(command: string, args: string, imvuUserId?: string): Promise<string> {
  if (!imvuUserId) return "⛔ Apenas o dono da sala pode gerir comandos no IMVU.";
  const actions: Record<string, string> = { criarcomando: "create", editarcomando: "edit", apagarcomando: "delete", listarcomandos: "list" };
  const action = actions[command];
  const match = /^!?([a-zA-Z][a-zA-Z0-9_-]{0,31})(?:\s+([\s\S]+))?$/.exec(args.trim());
  if (action !== "list" && (!match || (action !== "delete" && !match[2]?.trim()) || (action === "delete" && match[2]))) {
    return `Usa !${command} nome${action === "delete" ? "" : " texto da resposta"}`;
  }
  if ((match?.[2]?.trim().length ?? 0) > 500) return "A resposta pode ter até 500 caracteres.";
  try {
    const result = await manageCustomCommand({ action, imvuUserId, name: match?.[1].toLowerCase(), response: match?.[2]?.trim() });
    if (result.status === 403) return "⛔ Apenas o dono da sala pode gerir comandos.";
    if (result.status === 409) return "Esse comando já existe. Usa !editarcomando.";
    if (result.status === 404) return "Esse comando personalizado não existe.";
    if (result.status === 400) return "Nome reservado ou inválido. Os comandos do sistema estão protegidos.";
    if (result.status !== 200) return "⚠️ Não foi possível gerir o comando. Tenta novamente.";
    if (action === "list") return result.body.names.length ? `📋 Comandos personalizados: ${result.body.names.map((n: string) => "!" + n).join(" • ")}` : "Ainda não existem comandos personalizados.";
    return `✅ !${match![1].toLowerCase()} ${action === "create" ? "criado" : action === "edit" ? "atualizado" : "apagado"}.`;
  } catch { return "⚠️ Serviço indisponível. Tenta novamente daqui a pouco."; }
}

export async function customReply(command: string): Promise<string> {
  try { return await customCommandRequest(command.toLowerCase()) ?? `❓ Comando desconhecido: !${command}`; }
  catch { return "⚠️ Não foi possível consultar esse comando agora."; }
}
