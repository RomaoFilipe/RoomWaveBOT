import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";

import { createImvuBrowser } from "./browser.js";
import { getImvuRoomUrl } from "./room.js";
import { loginImvu } from "./login.js";

import {
  sendChatMessage,
} from "./chat.js";

import {
  installRealtimeChat,
} from "./realtime-chat.js";

config({
  path: fileURLToPath(
    new URL("../../../../.env", import.meta.url),
  ),
});

const username =
  process.env.IMVU_BOT_USERNAME;

const password =
  process.env.IMVU_BOT_PASSWORD;

if (!username || !password) {
  throw new Error(
    "Credenciais IMVU em falta.",
  );
}

async function ensureInsideRoom(
  page: Page,
) {
  const roomUrl =
    getImvuRoomUrl();

  console.log(
    `🌐 Sala: ${roomUrl}`,
  );

  await page.goto(
    roomUrl,
    {
      waitUntil:
        "domcontentloaded",
      timeout: 60000,
    },
  );

  await page.waitForTimeout(
    4000,
  );

  await loginImvu(
    page,
    username!,
    password!,
  );

  /*
   * Se o login nos mandar para HOME,
   * regressamos à sala.
   */
  if (
    !page.url().includes(
      new URL(roomUrl).pathname,
    )
  ) {
    console.log(
      "↩️ A regressar à sala...",
    );

    await page.goto(
      roomUrl,
      {
        waitUntil:
          "domcontentloaded",
        timeout: 60000,
      },
    );

    await page.waitForTimeout(
      5000,
    );
  }

  console.log(
    "🔎 A aguardar entrada/chat...",
  );

  const deadline =
    Date.now() + 90_000;

  let joinClicked = false;

  while (
    Date.now() < deadline
  ) {
    /*
     * Primeiro verificamos se o chat
     * já está disponível.
     */
    const chatInput =
      page.locator(
        [
          'textarea[placeholder*="Diga"]',
          'textarea[placeholder*="Say"]',
          '.chat-footer textarea',
          '.chat-bar textarea',
        ].join(", "),
      ).first();

    if (
      await chatInput
        .isVisible()
        .catch(() => false)
    ) {
      console.log(
        "✅ Chat disponível.",
      );

      return;
    }

    /*
     * Se ainda não entrámos,
     * procurar continuamente PARTICIPAR.
     */
    if (!joinClicked) {
      const joinSelectors = [
        'button:has-text("PARTICIPAR")',
        'button:has-text("Participar")',
        'button:has-text("JOIN")',
        'button:has-text("Join")',
        '[role="button"]:has-text("PARTICIPAR")',
        '[role="button"]:has-text("JOIN")',
      ];

      for (
        const selector
        of joinSelectors
      ) {
        const candidates =
          page.locator(selector);

        const count =
          await candidates.count();

        for (
          let i = 0;
          i < count;
          i++
        ) {
          const button =
            candidates.nth(i);

          try {
            if (
              await button.isVisible()
            ) {
              console.log(
                "🚪 PARTICIPAR encontrado.",
              );

              console.log(
                "🖱️ A entrar na sala...",
              );

              await button.click({
                timeout: 10000,
              });

              joinClicked = true;

              await page.waitForTimeout(
                2000,
              );

              break;
            }
          } catch {
            // continua
          }
        }

        if (joinClicked) {
          break;
        }
      }
    }

    const bodyText =
      await page
        .locator("body")
        .innerText()
        .catch(() => "");

    if (
      /ROOM UNAVAILABLE/i.test(
        bodyText,
      ) ||
      /Unable to join the room/i.test(
        bodyText,
      )
    ) {
      throw new Error(
        "IMVU indicou que a sala está indisponível.",
      );
    }

    await page.waitForTimeout(
      500,
    );
  }

  await page.screenshot({
    path:
      "/tmp/roomwave-realtime-failed.png",
    fullPage: true,
  });

  throw new Error(
    "Não consegui confirmar a entrada na sala em 90 segundos.",
  );
}

const context =
  await createImvuBrowser();

const page =
  context.pages()[0] ??
  await context.newPage();

console.log("");
console.log(
  "=================================",
);
console.log(
  "   ⚡ ROOMWAVE REALTIME TEST",
);
console.log(
  "=================================",
);
console.log("");

await ensureInsideRoom(
  page,
);

const usernames =
  new Map<string, string>();

await installRealtimeChat(
  page,
  async (message) => {
    /*
     * Ignorar mensagens do próprio bot.
     */
    if (message.isMine) {
      return;
    }

    if (
      message.userId &&
      message.username
    ) {
      usernames.set(
        message.userId,
        message.username,
      );
    }

    const sender =
      (
        message.userId
          ? usernames.get(
              message.userId,
            )
          : null
      ) ??
      message.username ??
      "Utilizador";

    console.log(
      `⚡ ${sender} [${message.userId ?? "?"}]: ${message.text}`,
    );

    const command =
      message.text
        .trim()
        .toLowerCase();

    if (
      command === "!ping"
    ) {
      const start =
        performance.now();

      await sendChatMessage(
        page,
        `🏓 Pong, ${sender}!`,
      );

      const elapsed =
        performance.now() -
        start;

      console.log(
        `↩️ Resposta enviada em ${elapsed.toFixed(0)} ms`,
      );
    }
  },
);

console.log("");
console.log(
  "⚡ Listener realtime IMVU ATIVO.",
);
console.log(
  "👂 Escreve !ping com ☠Diablo☠.",
);
console.log("");

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log("");
  console.log("🛑 A desligar RoomWaveBot...");

  await context.close();

  console.log("✅ RoomWaveBot desligado.");

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await new Promise(
  () => {},
);
