export function helpCommand(): string {
  return [
    "🎵 ROOMWAVE BOT",
    "",
    "!add <música> - adicionar música",
    "!queue - mostrar fila",
    "!now - música atual/próxima",
    "!volume [0-100] - volume da rádio (DJ+)",
    "!skip - saltar música (DJ+)",
    "!remove <posição> - remover (MOD+)",
    "!clear - limpar fila (ADMIN+)",
    "!help - mostrar comandos",
  ].join("\n");
}
