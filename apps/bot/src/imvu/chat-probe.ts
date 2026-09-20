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

async function joinRoom(page: Page) {
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
    const locator = page.locator(selector);

    for (
      let i = 0;
      i < await locator.count();
      i++
    ) {
      const button = locator.nth(i);

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
    "ℹ️ Botão PARTICIPAR não encontrado. Pode já estar dentro da sala.",
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
    "   🎵 ROOMWAVE CHAT PROBE",
  );
  console.log(
    "=================================",
  );

  await joinRoom(page);

  console.log("");
  console.log(
    `🌐 ${page.url()}`,
  );

  /*
   * Encontrar o campo de chat.
   */
  const chatInput = page
    .locator(
      'textarea[placeholder="Diga alguma coisa..."], textarea[placeholder*="Diga"], textarea[placeholder*="Say"]',
    )
    .first();

  await chatInput.waitFor({
    state: "visible",
    timeout: 30000,
  });

  console.log(
    "✅ Campo de chat encontrado.",
  );

  /*
   * Criamos uma mensagem única para ser
   * fácil encontrá-la no DOM.
   */
  const marker =
    `RoomWaveBot TEST ${Date.now()}`;

  console.log("");
  console.log(
    `💬 Mensagem de teste: ${marker}`,
  );

  await chatInput.fill(marker);

  /*
   * Primeiro tentamos o botão Enviar.
   */
  const sendButton = page
    .locator(
      'button:has-text("Enviar"), button:has-text("Send")',
    )
    .first();

  if (
    await sendButton
      .isVisible()
      .catch(() => false)
  ) {
    console.log(
      "📤 A clicar em Enviar...",
    );

    await sendButton.click();
  } else {
    console.log(
      "📤 Botão Enviar não encontrado. A usar ENTER...",
    );

    await chatInput.press("Enter");
  }

  await page.waitForTimeout(5000);

  /*
   * Verificar se a mensagem apareceu.
   */
  const matches =
    page.getByText(marker, {
      exact: true,
    });

  const count =
    await matches.count();

  console.log("");
  console.log(
    `🔎 Elementos com a mensagem encontrados: ${count}`,
  );

  let visibleFound = false;

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const candidate =
      matches.nth(i);

    if (
      !(await candidate
        .isVisible()
        .catch(() => false))
    ) {
      continue;
    }

    visibleFound = true;

    console.log("");
    console.log(
      `✅ Mensagem visível #${i}`,
    );

    /*
     * Mostrar a árvore dos elementos pais.
     * Isto ajuda a descobrir qual é o
     * container real de cada mensagem.
     */
    const ancestry =
      await candidate.evaluate(
        (element) => {
          const result = [];

          let current:
            | Element
            | null = element;

          for (
            let depth = 0;
            depth < 7 &&
            current;
            depth++
          ) {
            const attributes:
              Record<string, string> = {};

            for (
              const attr of Array.from(
                current.attributes,
              )
            ) {
              if (
                attr.name === "class" ||
                attr.name === "id" ||
                attr.name.startsWith(
                  "data-",
                ) ||
                attr.name === "role"
              ) {
                attributes[attr.name] =
                  attr.value;
              }
            }

            result.push({
              depth,
              tag:
                current.tagName,
              attributes,
              text:
                current.textContent
                  ?.trim()
                  .replace(
                    /\s+/g,
                    " ",
                  )
                  .slice(
                    0,
                    300,
                  ),
            });

            current =
              current.parentElement;
          }

          return result;
        },
      );

    console.log(
      JSON.stringify(
        ancestry,
        null,
        2,
      ),
    );
  }

  if (!visibleFound) {
    console.log(
      "⚠️ A mensagem ainda não apareceu visivelmente no DOM.",
    );
  }

  /*
   * Dump de elementos potencialmente
   * relacionados com mensagens/chat.
   */
  const possibleMessages =
    await page
      .locator(
        '[class*="message" i], [class*="chat" i], [data-testid*="message" i]',
      )
      .evaluateAll(
        (elements) =>
          elements
            .filter((element) => {
              const text =
                element.textContent
                  ?.trim();

              return (
                text &&
                text.length > 0
              );
            })
            .slice(0, 80)
            .map(
              (element) => ({
                tag:
                  element.tagName,
                class:
                  element.getAttribute(
                    "class",
                  ),
                id:
                  element.getAttribute(
                    "id",
                  ),
                testid:
                  element.getAttribute(
                    "data-testid",
                  ),
                text:
                  element.textContent
                    ?.trim()
                    .replace(
                      /\s+/g,
                      " ",
                    )
                    .slice(
                      0,
                      300,
                    ),
              }),
            ),
      )
      .catch(() => []);

  console.log("");
  console.log(
    "=================================",
  );
  console.log(
    "POSSÍVEIS ELEMENTOS DE MENSAGEM",
  );
  console.log(
    "=================================",
  );

  console.log(
    JSON.stringify(
      possibleMessages,
      null,
      2,
    ),
  );

  await page.screenshot({
    path:
      "/tmp/roomwave-chat-probe.png",
    fullPage: true,
  });

  console.log("");
  console.log(
    "📸 Screenshot: /tmp/roomwave-chat-probe.png",
  );

  console.log("");
  console.log(
    "✅ Chat probe terminado.",
  );
} finally {
  await context.close();
}
