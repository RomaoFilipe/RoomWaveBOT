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

  switch (
    command.toLowerCase()
  ) {
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
      return helpCommand();

    default:
      return (
        `❓ Comando desconhecido: !${command}`
      );
  }
}
