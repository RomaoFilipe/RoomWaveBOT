import {funCommand, funCommands} from "./fun.js";
import {presenceCommand} from "./room-presence.js";
import { manageCommand, customReply } from "./custom.js";
import { rulesCommand, radioCommand, staffCommand } from "./room-info.js";
import { volumeCommand } from "./volume.js";
import {
  addCommand,
} from "./add.js";

import {
  queueCommand,
} from "./queue.js";

import {
  helpCommand,
} from "./help.js";

import {
  nowCommand,
} from "./now.js";

import {
  skipCommand,
} from "./skip.js";

import {
  removeCommand,
} from "./remove.js";

import {
  clearCommand,
} from "./clear.js";

export interface CommandContext {
  imvuUserId?: string;
  username?: string;
  role?: string;
}

export async function handleCommand(
  message: string,
  context: CommandContext = {},
): Promise<string | null> {
  const input =
    message.trim();

  if (
    !input.startsWith("!")
  ) {
    return null;
  }

  const firstSpace =
    input.indexOf(" ");

  const command =
    firstSpace === -1
      ? input.slice(1)
      : input.slice(
          1,
          firstSpace,
        );

  const args =
    firstSpace === -1
      ? ""
      : input.slice(
          firstSpace + 1,
        );

  if (funCommands.has(command.toLowerCase())) {
    if (!context.imvuUserId) return "❌ Não consegui identificar quem enviou o comando.";
    try {
      return await funCommand(process.env.ROOMWAVE_ROOM_ID ?? '', command.toLowerCase(), args, {id:context.imvuUserId,name:context.username ?? context.imvuUserId,role:context.role});
    } catch (error) {
      const code=error instanceof Error?error.message:'';
      if(code==='GAME_TARGET_ABSENT')return '❌ Essa pessoa não consta nesta sala agora.';
      if(code==='GAME_BOT_TARGET')return '🤖 Escolhe uma pessoa da sala, em vez do bot.';
      if(/^(INVALID_IMVU_USER|IMVU_NOT_FOUND)$/.test(code))return '❌ Utilizador não encontrado. Usa o username exato ou CID.';
      throw error;
    }
  }

  switch (
    command.toLowerCase()
  ) {
    case "onde":
    case "historico":
      return presenceCommand(command.toLowerCase() as "onde"|"historico",args,context.imvuUserId);

    case "criarcomando":
    case "editarcomando":
    case "apagarcomando":
    case "listarcomandos":
      return manageCommand(command.toLowerCase(), args, context.imvuUserId);

    case "add":
      return addCommand(
        args,
        context.imvuUserId,
      );

    case "queue":
      return queueCommand();

    case "now":
      return nowCommand();

    case "volume":
      return volumeCommand(args, context.imvuUserId);

    case "skip":
      return skipCommand(
        context.imvuUserId,
      );

    case "remove":
      return removeCommand(
        args,
        context.imvuUserId,
      );

    case "clear":
      return clearCommand(
        context.imvuUserId,
      );

    case "regras":
      return rulesCommand();

    case "radio":
      return radioCommand();

    case "staff":
      return staffCommand();

    case "comandos":
    case "help":
      return helpCommand(args);

    default:
      return customReply(command);
  }
}
