import { getRoomStaff } from "../services/api.js";

export function rulesCommand(): string {
  return [
    "📜 REGRAS DA SALA",
    "Respeita todos os presentes. Desrespeito, insultos ou assédio podem levar à expulsão ou ao banimento pela moderação.",
  ].join("\n");
}

export function radioCommand(): string {
  const url = process.env.ROOMWAVE_PUBLIC_RADIO_URL ?? "https://13-220-164-169.sslip.io/roomwave.mp3";
  return `📻 RÁDIO ROOMWAVE\n${url}`;
}

export async function staffCommand(): Promise<string> {
  try {
    const members = await getRoomStaff();
    const roles = ["OWNER", "ADMIN", "MODERATOR", "DJ"];
    const labels: Record<string, string> = { OWNER: "Dono", ADMIN: "Admin", MODERATOR: "Moderador", DJ: "DJ" };
    const lines = roles.flatMap(role => {
      const names = members.filter(m => m.role === role).map(m => m.user.username.replace(/[\r\n]/g, " "));
      return names.length ? [`${labels[role]}: ${names.join(", ")}`] : [];
    });
    return lines.length ? ["👥 STAFF DA SALA", ...lines].join("\n") : "👥 Ainda não existe staff registado nesta sala.";
  } catch {
    return "⚠️ Não foi possível consultar a staff. Tenta novamente daqui a pouco.";
  }
}
