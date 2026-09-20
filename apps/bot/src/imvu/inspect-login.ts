import { config } from "dotenv";
import { fileURLToPath } from "node:url";

import { createImvuBrowser } from "./browser.js";
import { getImvuRoomUrl } from "./room.js";

config({
  path: fileURLToPath(
    new URL("../../../../.env", import.meta.url),
  ),
});

const context = await createImvuBrowser();

try {
  const page =
    context.pages()[0] ??
    (await context.newPage());

  const roomUrl = getImvuRoomUrl();

  console.log("");
  console.log("=================================");
  console.log("     IMVU LOGIN INSPECTOR");
  console.log("=================================");
  console.log("");

  await page.goto(roomUrl, {
    waitUntil: "commit",
    timeout: 60_000,
  }).catch((error) => {
    console.log(
      "Navigation warning:",
      error instanceof Error
        ? error.message
        : String(error),
    );
  });

  console.log("A aguardar página...");
  await page.waitForTimeout(12_000);

  console.log("");
  console.log(`PAGE URL: ${page.url()}`);
  console.log(`TITLE: ${await page.title()}`);

  console.log("");
  console.log(
    `FRAMES ENCONTRADOS: ${page.frames().length}`,
  );

  let frameNumber = 0;

  for (const frame of page.frames()) {
    console.log("");
    console.log("==============================");
    console.log(`FRAME ${frameNumber}`);
    console.log("==============================");
    console.log(`URL: ${frame.url()}`);

    const inputs = await frame
      .locator("input")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          type:
            element.getAttribute("type"),
          name:
            element.getAttribute("name"),
          id:
            element.getAttribute("id"),
          placeholder:
            element.getAttribute("placeholder"),
          autocomplete:
            element.getAttribute("autocomplete"),
          ariaLabel:
            element.getAttribute("aria-label"),
        })),
      )
      .catch(() => []);

    console.log("");
    console.log("INPUTS:");
    console.log(
      JSON.stringify(inputs, null, 2),
    );

    const buttons = await frame
      .locator("button")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          text:
            element.textContent?.trim(),
          type:
            element.getAttribute("type"),
          id:
            element.getAttribute("id"),
          name:
            element.getAttribute("name"),
          ariaLabel:
            element.getAttribute("aria-label"),
        })),
      )
      .catch(() => []);

    console.log("");
    console.log("BUTTONS:");
    console.log(
      JSON.stringify(buttons, null, 2),
    );

    const links = await frame
      .locator("a")
      .evaluateAll((elements) =>
        elements
          .slice(0, 30)
          .map((element) => ({
            text:
              element.textContent?.trim(),
            href:
              element.getAttribute("href"),
          })),
      )
      .catch(() => []);

    console.log("");
    console.log("LINKS:");
    console.log(
      JSON.stringify(links, null, 2),
    );

    frameNumber++;
  }

  const body = await page
    .locator("body")
    .innerText()
    .catch(() => "");

  console.log("");
  console.log("=================================");
  console.log("BODY TEXT");
  console.log("=================================");
  console.log(body.slice(0, 5000));

  console.log("");
  console.log("Cookies:");
  const cookies = await context.cookies();

  console.log(
    cookies.map((cookie) => ({
      name: cookie.name,
      domain: cookie.domain,
    })),
  );

  await page.screenshot({
    path: "/tmp/imvu-login-inspect.png",
    fullPage: true,
  });

  console.log("");
  console.log(
    "Screenshot: /tmp/imvu-login-inspect.png",
  );

  console.log("");
  console.log("✅ Inspeção terminada");
} finally {
  await context.close();
}
