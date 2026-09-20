import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";

import { createImvuBrowser } from "./browser.js";
import { getImvuRoomUrl } from "./room.js";
import { loginImvu } from "./login.js";

config({
  path: fileURLToPath(
    new URL("../../../../.env", import.meta.url),
  ),
});

const username = process.env.IMVU_BOT_USERNAME;
const password = process.env.IMVU_BOT_PASSWORD;

if (!username || !password) {
  throw new Error(
    "IMVU_BOT_USERNAME e IMVU_BOT_PASSWORD têm de estar configurados.",
  );
}

const roomUrl = getImvuRoomUrl();

async function safeGoto(
  page: Page,
  url: string,
) {
  console.log(`🌐 Navegar para: ${url}`);

  try {
    await page.goto(url, {
      waitUntil: "commit",
      timeout: 60_000,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (message.includes("ERR_ABORTED")) {
      console.log(
        "⚠️ Navegação abortada pelo IMVU; vou aguardar o redirecionamento.",
      );
    } else {
      throw error;
    }
  }

  await page.waitForTimeout(8000);

  await page
    .waitForLoadState("domcontentloaded", {
      timeout: 15_000,
    })
    .catch(() => {});
}

console.log("");
console.log("=================================");
console.log("       🎵 ROOMWAVE IMVU");
console.log("=================================");
console.log(`Room: ${roomUrl}`);
console.log("");

const context = await createImvuBrowser();

try {
  let page =
    context.pages()[0] ??
    (await context.newPage());

  console.log("🌐 A abrir IMVU...");

  await safeGoto(page, roomUrl);

  console.log(`URL inicial: ${page.url()}`);

  await loginImvu(
    page,
    username,
    password,
  );

  console.log("");
  console.log("🚪 A entrar na sala...");

  await safeGoto(page, roomUrl);

  /*
   * O IMVU pode abrir a sala numa nova página/tab.
   * Vamos procurar a página mais relevante.
   */
  await page.waitForTimeout(5000);

  const pages = context.pages();

  console.log("");
  console.log(`Páginas abertas: ${pages.length}`);

  for (let i = 0; i < pages.length; i++) {
    console.log(
      `[${i}] ${pages[i]!.url()}`,
    );
  }

  const roomPage =
    pages.find((candidate) =>
      candidate
        .url()
        .includes("/next/chat/room-"),
    ) ??
    pages.find((candidate) =>
      candidate
        .url()
        .includes("imvu.com"),
    ) ??
    page;

  page = roomPage;

  console.log("");
  console.log(`URL final: ${page.url()}`);
  console.log(`Título: ${await page.title()}`);

  const text = await page
    .locator("body")
    .innerText()
    .catch(() => "");

  console.log("");
  console.log("Conteúdo visível:");
  console.log("----------------------------");
  console.log(text.slice(0, 3000));

  await page.screenshot({
    path: "/tmp/roomwave-imvu-room.png",
    fullPage: true,
  });

  console.log("");
  console.log(
    "Screenshot: /tmp/roomwave-imvu-room.png",
  );

  console.log("");
  console.log(
    "✅ Teste LOGIN → ROOM concluído",
  );
} finally {
  await context.close();
}
