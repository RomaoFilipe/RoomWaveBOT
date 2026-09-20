import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import type { Frame, Page } from "playwright";

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
    "IMVU_BOT_USERNAME e IMVU_BOT_PASSWORD não estão configurados.",
  );
}

async function clickJoin(
  page: Page,
): Promise<boolean> {
  console.log("");
  console.log("🚪 A procurar botão PARTICIPAR/JOIN...");

  for (const frame of page.frames()) {
    const selectors = [
      'button:has-text("PARTICIPAR")',
      'button:has-text("Participar")',
      'button:has-text("JOIN")',
      'button:has-text("Join")',

      '[role="button"]:has-text("PARTICIPAR")',
      '[role="button"]:has-text("JOIN")',

      'a:has-text("PARTICIPAR")',
      'a:has-text("JOIN")',
    ];

    for (const selector of selectors) {
      const candidates =
        frame.locator(selector);

      const count =
        await candidates.count();

      for (let i = 0; i < count; i++) {
        const candidate =
          candidates.nth(i);

        try {
          if (!(await candidate.isVisible())) {
            continue;
          }

          console.log(
            `✅ Botão encontrado no frame: ${frame.url()}`,
          );

          console.log(
            `🖱️ Clique: ${selector}`,
          );

          await candidate.click({
            timeout: 10000,
          });

          return true;
        } catch {
          // tenta o próximo
        }
      }
    }
  }

  return false;
}

async function inspectFrame(
  frame: Frame,
  index: number,
) {
  console.log("");
  console.log(
    `================ FRAME ${index} ================`,
  );

  console.log(`URL: ${frame.url()}`);

  const fields = await frame
    .locator(
      'textarea, input, [contenteditable="true"]',
    )
    .evaluateAll((elements) =>
      elements.map((element) => ({
        tag: element.tagName,
        type:
          element.getAttribute("type"),
        id:
          element.getAttribute("id"),
        name:
          element.getAttribute("name"),
        placeholder:
          element.getAttribute("placeholder"),
        ariaLabel:
          element.getAttribute("aria-label"),
        contenteditable:
          element.getAttribute(
            "contenteditable",
          ),
      })),
    )
    .catch(() => []);

  console.log("");
  console.log("💬 POSSÍVEIS CAMPOS DE CHAT:");
  console.log(
    JSON.stringify(fields, null, 2),
  );

  const buttons = await frame
    .locator(
      'button, [role="button"]',
    )
    .evaluateAll((elements) =>
      elements
        .slice(0, 60)
        .map((element) => ({
          tag: element.tagName,
          text:
            element.textContent
              ?.trim()
              .replace(/\s+/g, " ")
              .slice(0, 100),
          id:
            element.getAttribute("id"),
          ariaLabel:
            element.getAttribute(
              "aria-label",
            ),
          title:
            element.getAttribute("title"),
        })),
    )
    .catch(() => []);

  console.log("");
  console.log("🔘 BOTÕES:");
  console.log(
    JSON.stringify(buttons, null, 2),
  );
}

const roomUrl =
  getImvuRoomUrl();

console.log("");
console.log("=================================");
console.log("    🎵 ROOMWAVE LIVE ROOM TEST");
console.log("=================================");
console.log(`Room: ${roomUrl}`);

const context =
  await createImvuBrowser();

try {
  let page =
    context.pages()[0] ??
    (await context.newPage());

  console.log("");
  console.log("🌐 A abrir sala...");

  await page.goto(roomUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForTimeout(5000);

  await loginImvu(
    page,
    username,
    password,
  );

  /*
   * Se o login nos levou para HOME,
   * voltamos à sala.
   */
  if (
    !page.url().includes(
      new URL(roomUrl).pathname,
    )
  ) {
    console.log("");
    console.log(
      "↩️ A regressar à sala...",
    );

    await page.goto(roomUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForTimeout(6000);
  }

  console.log("");
  console.log(
    `URL antes do JOIN: ${page.url()}`,
  );

  const beforeText = await page
    .locator("body")
    .innerText()
    .catch(() => "");

  if (
    /ROOM UNAVAILABLE/i.test(
      beforeText,
    )
  ) {
    throw new Error(
      "A sala está indisponível.",
    );
  }

  const joined =
    await clickJoin(page);

  if (!joined) {
    console.log(
      "ℹ️ Não encontrei PARTICIPAR. A conta pode já estar dentro da sala.",
    );
  } else {
    console.log("");
    console.log(
      "⏳ A aguardar entrada na sala...",
    );

    await page.waitForTimeout(
      15000,
    );
  }

  console.log("");
  console.log(
    `🌐 URL atual: ${page.url()}`,
  );

  console.log(
    `📄 Título: ${await page.title()}`,
  );

  console.log("");
  console.log(
    `🧩 Frames: ${page.frames().length}`,
  );

  let index = 0;

  for (const frame of page.frames()) {
    await inspectFrame(
      frame,
      index++,
    );
  }

  const bodyText = await page
    .locator("body")
    .innerText()
    .catch(() => "");

  console.log("");
  console.log(
    "=================================",
  );
  console.log("CONTEÚDO VISÍVEL");
  console.log(
    "=================================",
  );

  console.log(
    bodyText.slice(0, 6000),
  );

  await page.screenshot({
    path:
      "/tmp/roomwave-live-room.png",
    fullPage: true,
  });

  console.log("");
  console.log(
    "📸 /tmp/roomwave-live-room.png",
  );

  console.log("");
  console.log(
    "✅ Teste da sala terminado.",
  );
} finally {
  await context.close();
}
