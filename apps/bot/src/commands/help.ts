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
    "!regras - regras da sala",
    "!radio - link da rádio",
    "!staff - equipa da sala",
    "!comandos / !help - mostrar comandos",
    "Dono: !onde <username/CID> - presença nesta sala",
    "Dono: !historico <username/CID> - entradas/saídas desta sala",
    "Dono: !criarcomando / !editarcomando <nome> <texto>",
    "Dono: !apagarcomando <nome> / !listarcomandos",
  ].join("\n");
}
