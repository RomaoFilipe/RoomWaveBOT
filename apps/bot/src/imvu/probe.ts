import { config } from "dotenv";
import { fileURLToPath } from "node:url";

import { createImvuBrowser } from "./browser.js";
import { getImvuRoomUrl } from "./room.js";

config({
  path: fileURLToPath(
    new URL("../../../../.env", import.meta.url),
  ),
});

console.log("");
console.log("=================================");
console.log("     🎵 ROOMWAVE IMVU PROBE");
console.log("=================================");

const roomUrl = getImvuRoomUrl();

console.log(`Room: ${roomUrl}`);
console.log("A iniciar Chromium...");

const context = await createImvuBrowser();

try {
  const page =
    context.pages()[0] ??
    (await context.newPage());

  console.log("A abrir sala IMVU...");

  await page.goto(roomUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  await page.waitForTimeout(5000);

  console.log("");
  console.log(`URL final: ${page.url()}`);
  console.log(`Título: ${await page.title()}`);

  const bodyText = await page
    .locator("body")
    .innerText()
    .catch(() => "");

  console.log("");
  console.log("Primeiros conteúdos encontrados:");
  console.log("---------------------------------");
  console.log(bodyText.slice(0, 1500));

  await page.screenshot({
    path: "/tmp/roomwave-imvu.png",
    fullPage: true,
  });

  console.log("");
  console.log("Screenshot:");
  console.log("/tmp/roomwave-imvu.png");
  console.log("");
  console.log("✅ IMVU browser probe concluído");
} finally {
  await context.close();
}
