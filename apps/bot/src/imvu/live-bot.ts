import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";

import { createImvuBrowser } from "./browser.js";
import { getImvuRoomUrl } from "./room.js";
import { loginImvu } from "./login.js";

import {
  getChatMessages,
  sendChatMessage,
  waitForChat,
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
    "Credenciais IMVU não configuradas.",
  );
}

async function enterRoom(
  page: Page,
) {
  const roomUrl =
    getImvuRoomUrl();

  console.log(
    `🌐 Sala: ${roomUrl}`,
  );

  await page.goto(roomUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForTimeout(
    5000,
  );

  await loginImvu(
    page,
    username!,
    password!,
  );

  if (
    !page.url().includes(
      new URL(roomUrl).pathname,
    )
  ) {
    console.log(
      "↩️ A voltar à sala...",
    );

    await page.goto(roomUrl, {
      waitUntil:
        "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForTimeout(
      5000,
    );
  }

  console.log(
    "🔎 A aguardar sala/chat...",
  );

  const deadline =
    Date.now() + 90_000;

  let joinClicked = false;

  while (
    Date.now() < deadline
  ) {
    /*
     * Se o campo de chat já existe,
     * estamos realmente dentro.
     */
    const chatInput = page.locator(
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
        "✅ Campo de chat disponível.",
      );

      return;
    }

    /*
     * Enquanto esperamos, procuramos
     * continuamente o botão de entrada.
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

        for (
          let i = 0;
          i < await candidates.count();
          i++
        ) {
          const candidate =
            candidates.nth(i);

          try {
            if (
              await candidate.isVisible()
            ) {
              console.log(
                "🚪 Botão PARTICIPAR encontrado.",
              );

              console.log(
                "🖱️ A entrar na sala...",
              );

              await candidate.click({
                timeout: 10000,
              });

              joinClicked = true;

              await page.waitForTimeout(
                3000,
              );

              break;
            }
          } catch {}
        }

        if (joinClicked) {
          break;
        }
      }
    }

    /*
     * Detetar erro explícito da sala.
     */
    const bodyText = await page
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
        "O IMVU indicou que a sala está indisponível.",
      );
    }

    await page.waitForTimeout(
      1000,
    );
  }

  /*
   * Se chegou aqui, fazemos diagnóstico
   * em vez de ficar apenas com Timeout.
   */
  const bodyText = await page
    .locator("body")
    .innerText()
    .catch(() => "");

  await page.screenshot({
    path:
      "/tmp/roomwave-live-failed.png",
    fullPage: true,
  });

  console.log("");
  console.log(
    "⚠️ Estado atual da página:",
  );

  console.log(
    bodyText.slice(0, 3000),
  );

  console.log(
    "📸 /tmp/roomwave-live-failed.png",
  );

  throw new Error(
    "Não foi possível confirmar a entrada na sala em 90 segundos.",
  );
}

const context =
  await createImvuBrowser();

let closing = false;

async function shutdown() {
  if (closing) {
    return;
  }

  closing = true;

  console.log("");
  console.log(
    "🛑 A desligar RoomWaveBot...",
  );

  await context.close();

  process.exit(0);
}

process.on(
  "SIGINT",
  shutdown,
);

process.on(
  "SIGTERM",
  shutdown,
);

try {
  const page =
    context.pages()[0] ??
    (await context.newPage());

  console.log("");
  console.log(
    "=================================",
  );
  console.log(
    "       🎵 ROOMWAVEBOT",
  );
  console.log(
    "=================================",
  );

  await enterRoom(page);

  console.log("");
  console.log(
    "✅ RoomWaveBot está na sala.",
  );

  /*
   * Mensagens já existentes não
   * devem ser executadas novamente.
   */
  const seen =
    new Set<string>();

  /*
   * Guardamos nomes por IMVU ID.
   * Algumas mensagens consecutivas
   * não repetem o nome no HTML.
   */
  const usernames =
    new Map<string, string>();

  const existing =
    await getChatMessages(page);

  for (
    const message
    of existing
  ) {
    seen.add(
      message.key,
    );

    if (
      message.userId &&
      message.username
    ) {
      usernames.set(
        message.userId,
        message.username,
      );
    }
  }

  console.log(
    `📚 ${seen.size} mensagens antigas ignoradas.`,
  );

  console.log("");
  console.log(
    "👂 A ouvir comandos...",
  );

  console.log(
    "Comandos ativos: !ping | !help",
  );

  console.log("");

  while (!closing) {
    try {
      const messages =
        await getChatMessages(
          page,
        );

      for (
        const message
        of messages
      ) {
        if (
          seen.has(
            message.key,
          )
        ) {
          continue;
        }

        seen.add(
          message.key,
        );

        if (
          message.userId &&
          message.username
        ) {
          usernames.set(
            message.userId,
            message.username,
          );
        }

        /*
         * Nunca interpretar mensagens
         * enviadas pelo próprio bot.
         */
        if (message.isMine) {
          continue;
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
          `📩 ${sender} [${message.userId ?? "?"}]: ${message.text}`,
        );

        const command =
          message.text
            .trim()
            .toLowerCase();

        if (
          command === "!ping"
        ) {
          console.log(
            "⚙️ Executar !ping",
          );

          await sendChatMessage(
            page,
            `🏓 Pong, ${sender}!`,
          );

          continue;
        }

        if (
          command === "!help"
        ) {
          console.log(
            "⚙️ Executar !help",
          );

          await sendChatMessage(
            page,
            "🎵 RoomWaveBot | Comandos: !ping • !help",
          );

          continue;
        }

        if (
          command.startsWith(
            "!",
          )
        ) {
          console.log(
            `❓ Comando ainda não implementado: ${message.text}`,
          );
        }
      }
    } catch (error) {
      console.error(
        "⚠️ Erro no listener:",
        error instanceof Error
          ? error.message
          : error,
      );
    }

    await page.waitForTimeout(
      750,
    );
  }
} catch (error) {
  console.error(
    "❌ RoomWaveBot:",
    error,
  );

  await context.close();

  process.exit(1);
}
