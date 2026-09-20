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

const username =
  process.env.IMVU_BOT_USERNAME;

const password =
  process.env.IMVU_BOT_PASSWORD;

if (!username || !password) {
  throw new Error(
    "Credenciais IMVU em falta.",
  );
}

function preview(
  payload: string | Buffer,
) {
  if (Buffer.isBuffer(payload)) {
    return `[BINARY ${payload.length} bytes]`;
  }

  return payload
    .replace(/\s+/g, " ")
    .slice(0, 1500);
}

async function enterRoom(
  page: Page,
) {
  const roomUrl =
    getImvuRoomUrl();

  await page.goto(roomUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForTimeout(4000);

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

  const deadline =
    Date.now() + 90000;

  let clicked = false;

  while (Date.now() < deadline) {
    const chat =
      page.locator(
        'textarea[placeholder*="Diga"], textarea[placeholder*="Say"]',
      ).first();

    if (
      await chat
        .isVisible()
        .catch(() => false)
    ) {
      console.log(
        "✅ Chat disponível.",
      );
      return;
    }

    if (!clicked) {
      const join =
        page.locator(
          'button:has-text("PARTICIPAR"), button:has-text("JOIN")',
        ).first();

      if (
        await join
          .isVisible()
          .catch(() => false)
      ) {
        console.log(
          "🚪 A entrar na sala...",
        );

        await join.click();

        clicked = true;
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    "Não consegui entrar na sala.",
  );
}

const context =
  await createImvuBrowser();

const page =
  context.pages()[0] ??
  await context.newPage();

/*
 * IMPORTANTE:
 * instalar ANTES de abrir a sala,
 * para apanharmos todos os sockets.
 */
page.on(
  "websocket",
  (ws) => {
    console.log("");
    console.log(
      "=================================",
    );
    console.log(
      "🔌 WEBSOCKET ABERTO",
    );
    console.log(
      ws.url(),
    );
    console.log(
      "=================================",
    );

    ws.on(
      "framereceived",
      (event) => {
        console.log("");
        console.log(
          `⬇️ WS RECEIVE [${ws.url()}]`,
        );

        console.log(
          preview(event.payload),
        );
      },
    );

    ws.on(
      "framesent",
      (event) => {
        console.log("");
        console.log(
          `⬆️ WS SEND [${ws.url()}]`,
        );

        console.log(
          preview(event.payload),
        );
      },
    );

    ws.on(
      "close",
      () => {
        console.log(
          `🔌 WS CLOSED: ${ws.url()}`,
        );
      },
    );
  },
);

console.log("");
console.log(
  "=================================",
);
console.log(
  "      🔬 IMVU WS PROBE",
);
console.log(
  "=================================",
);
console.log("");

await enterRoom(page);

console.log("");
console.log(
  "✅ Probe ativo.",
);
console.log("");
console.log(
  "1. Escreve !ping com ☠Diablo☠",
);
console.log(
  "2. Depois envia manualmente uma mensagem com RoomWaveBot",
);
console.log(
  "3. Observa WS RECEIVE e WS SEND",
);
console.log("");

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;

  shuttingDown = true;

  console.log("");
  console.log(
    "🛑 A terminar probe...",
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

await new Promise(
  () => {},
);
