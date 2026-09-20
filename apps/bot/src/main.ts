import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

import { handleCommand } from "./commands/index.js";

config({
  path: fileURLToPath(
    new URL("../../../.env", import.meta.url),
  ),
});

console.log("");
console.log("=================================");
console.log("       🎵 ROOMWAVE BOT");
console.log("=================================");
console.log("Bot iniciado.");
console.log("");
console.log("Experimenta:");
console.log("!help");
console.log("!add Avicii Levels");
console.log("!queue");
console.log("");
console.log("=================================");
console.log("");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "Diablo > ",
});

rl.prompt();

rl.on("line", async (message) => {
  try {
    const response = await handleCommand(message);

    if (response) {
      console.log("");
      console.log("RoomWave Bot:");
      console.log(response);
      console.log("");
    }
  } catch (error) {
    console.error("");
    console.error("❌ BOT ERROR");

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }

    console.error("");
  }

  rl.prompt();
});

rl.on("close", () => {
  console.log("");
  console.log("RoomWave Bot desligado.");
  process.exit(0);
});
