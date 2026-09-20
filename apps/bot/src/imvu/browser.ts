import { chromium } from "playwright";
import path from "node:path";

export async function createImvuBrowser() {
  const userDataDir = path.resolve(
    process.cwd(),
    "../../.data/imvu-browser",
  );

  const context = await chromium.launchPersistentContext(
    userDataDir,
    {
      headless: true,

      viewport: { width: 1024, height: 720 },

      args: [
        "--disable-dev-shm-usage",
        "--no-sandbox",
      "--renderer-process-limit=2",
      "--disable-notifications",
      ],
    },
  );

  // ROOMWAVE_RESOURCE_OPTIMIZATION
  //
  // O gateway precisa de HTML + JavaScript + WebSocket,
  // mas não precisa de imagens, vídeos, áudio nem fontes.
  // Isto reduz significativamente RAM, CPU e tráfego.
  await context.route("**/*", async (route) => {
    const resourceType =
      route.request().resourceType();

    if (
      resourceType === "image" ||
      resourceType === "media" ||
      resourceType === "font"
    ) {
      await route.abort();
      return;
    }

    await route.continue();
  });


  return context;
}
