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
    "IMVU_BOT_USERNAME e IMVU_BOT_PASSWORD não configurados.",
  );
}

async function enterRoom(page: Page) {
  const roomUrl = getImvuRoomUrl();

  await page.goto(roomUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForTimeout(5000);

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
    await page.goto(roomUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForTimeout(5000);
  }

  const joinSelectors = [
    'button:has-text("PARTICIPAR")',
    'button:has-text("Participar")',
    'button:has-text("JOIN")',
    'button:has-text("Join")',
  ];

  for (const selector of joinSelectors) {
    const buttons = page.locator(selector);

    for (
      let i = 0;
      i < await buttons.count();
      i++
    ) {
      const button = buttons.nth(i);

      try {
        if (await button.isVisible()) {
          console.log(
            "🚪 A entrar na sala...",
          );

          await button.click();

          await page.waitForTimeout(
            12000,
          );

          return;
        }
      } catch {}
    }
  }

  console.log(
    "ℹ️ O bot pode já estar dentro da sala.",
  );
}

const context =
  await createImvuBrowser();

try {
  const page =
    context.pages()[0] ??
    (await context.newPage());

  console.log("");
  console.log(
    "=================================",
  );
  console.log(
    "   🎵 ROOMWAVE CHAT LISTENER",
  );
  console.log(
    "=================================",
  );

  await enterRoom(page);

  const chatInput = page
    .locator(
      'textarea[placeholder*="Diga"], textarea[placeholder*="Say"]',
    )
    .first();

  await chatInput.waitFor({
    state: "visible",
    timeout: 30000,
  });

  console.log("");
  console.log(
    "✅ Chat carregado.",
  );

  /*
   * Guardamos as mensagens já existentes
   * para só mostrar novas mensagens.
   */
  const seen =
    new Set<string>();

  const initial =
    page.locator(
      ".cs2-msg[data-id]",
    );

  for (
    let i = 0;
    i < await initial.count();
    i++
  ) {
    const msg =
      initial.nth(i);

    const key =
      `${await msg.getAttribute("data-id")}:` +
      `${await msg.getAttribute("data-timestamp")}`;

    seen.add(key);
  }

  console.log(
    `📚 Mensagens existentes ignoradas: ${seen.size}`,
  );

  console.log("");
  console.log(
    "👂 A ouvir durante 120 segundos.",
  );

  console.log(
    '➡️ Agora escreve no IMVU com a conta Diablo: !ping',
  );

  console.log("");

  const end =
    Date.now() + 120_000;

  while (
    Date.now() < end
  ) {
    const messages =
      page.locator(
        ".cs2-msg[data-id]",
      );

    const count =
      await messages.count();

    for (
      let i = 0;
      i < count;
      i++
    ) {
      const message =
        messages.nth(i);

      const userId =
        await message.getAttribute(
          "data-id",
        );

      const timestamp =
        await message.getAttribute(
          "data-timestamp",
        );

      const key =
        `${userId}:${timestamp}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      const info =
        await message.evaluate(
          (element) => {
            const text =
              element.querySelector(
                ".cs2-text",
              )?.textContent
                ?.trim() ??
              element.textContent
                ?.trim() ??
              "";

            const classes =
              element.getAttribute(
                "class",
              ) ?? "";

            const parent =
              element.parentElement;

            return {
              text,
              classes,
              userId:
                element.getAttribute(
                  "data-id",
                ),
              timestamp:
                element.getAttribute(
                  "data-timestamp",
                ),

              innerHTML:
                element.innerHTML
                  .replace(
                    /\s+/g,
                    " ",
                  )
                  .slice(
                    0,
                    2000,
                  ),

              parentHTML:
                parent?.outerHTML
                  .replace(
                    /\s+/g,
                    " ",
                  )
                  .slice(
                    0,
                    3000,
                  ) ?? "",
            };
          },
        );

      console.log("");
      console.log(
        "=================================",
      );

      console.log(
        "📩 NOVA MENSAGEM",
      );

      console.log(
        "=================================",
      );

      console.log(
        `User ID: ${info.userId}`,
      );

      console.log(
        `Timestamp: ${info.timestamp}`,
      );

      console.log(
        `Classes: ${info.classes}`,
      );

      console.log(
        `Texto: ${info.text}`,
      );

      console.log("");
      console.log(
        "HTML da mensagem:",
      );

      console.log(
        info.innerHTML,
      );

      console.log("");
      console.log(
        "HTML do container:",
      );

      console.log(
        info.parentHTML,
      );

      console.log("");
    }

    await page.waitForTimeout(
      1000,
    );
  }

  console.log("");
  console.log(
    "⏱️ Listener terminado.",
  );
} finally {
  await context.close();
}
