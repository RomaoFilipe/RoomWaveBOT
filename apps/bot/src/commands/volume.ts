import { radioVolume } from "../services/api.js";
export async function volumeCommand(args: string, imvuUserId?: string): Promise<string> {
  if (!imvuUserId) return "❌ Usa !volume no chat IMVU.";
  const value = args.trim();
  if (value && (!/^\d{1,3}$/.test(value) || Number(value) > 100)) {
    return "Usa !volume 0–100. Exemplo: !volume 30";
  }
  const result = await radioVolume(imvuUserId, value ? Number(value) : undefined);
  return `🔊 Volume da rádio: ${result.volume}% (para todos os ouvintes)`;
}
