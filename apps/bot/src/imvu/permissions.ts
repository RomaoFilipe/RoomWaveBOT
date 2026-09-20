export type RoomWaveRole =
  | "OWNER"
  | "ADMIN"
  | "MODERATOR"
  | "DJ"
  | "VIP"
  | "USER";

export function canRunCommand(
  role: RoomWaveRole,
  command: string,
): boolean {
  const name =
    command
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase() ??
    "";

  const publicCommands =
    new Set([
      "!ping",
      "!help",
      "!add",
      "!queue",
      "!now",
    ]);

  if (
    publicCommands.has(name)
  ) {
    return true;
  }

  if (name === "!skip" || name === "!volume") {
    return [
      "OWNER",
      "ADMIN",
      "MODERATOR",
      "DJ",
    ].includes(role);
  }

  if (name === "!remove") {
    return [
      "OWNER",
      "ADMIN",
      "MODERATOR",
    ].includes(role);
  }

  if (name === "!clear") {
    return [
      "OWNER",
      "ADMIN",
    ].includes(role);
  }

  /*
   * Desligar completamente o bot
   * é exclusivo do OWNER.
   */
  if (name === "!disconnect") {
    return role === "OWNER";
  }

  return true;
}
