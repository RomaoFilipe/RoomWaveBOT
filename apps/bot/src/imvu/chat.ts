import type { Page } from "playwright";

export type ImvuChatMessage = {
  key: string;
  userUrl: string;
  userId: string | null;
  username: string | null;
  text: string;
  timestamp: string;
  isMine: boolean;
};

function extractUserId(
  userUrl: string,
): string | null {
  const match =
    userUrl.match(/user-(\d+)/);

  return match?.[1] ?? null;
}

export async function getChatMessages(
  page: Page,
): Promise<ImvuChatMessage[]> {
  const messages = page.locator(
    ".cs2-msg[data-id][data-timestamp]",
  );

  const result: ImvuChatMessage[] = [];

  const count =
    await messages.count();

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const message =
      messages.nth(i);

    const userUrl =
      (await message.getAttribute(
        "data-id",
      )) ?? "";

    const timestamp =
      (await message.getAttribute(
        "data-timestamp",
      )) ?? "";

    if (
      !userUrl ||
      !timestamp
    ) {
      continue;
    }

    const className =
      (await message.getAttribute(
        "class",
      )) ?? "";

    const text = (
      await message
        .locator(".cs2-text")
        .first()
        .innerText()
        .catch(() => "")
    ).trim();

    if (!text) {
      continue;
    }

    const username = (
      await message
        .locator(".cs2-name")
        .first()
        .innerText()
        .catch(() => "")
    ).trim();

    result.push({
      key:
        `${userUrl}:${timestamp}`,
      userUrl,
      userId:
        extractUserId(userUrl),
      username:
        username || null,
      text,
      timestamp,
      isMine:
        className
          .split(/\s+/)
          .includes("my-user"),
    });
  }

  return result;
}

export async function waitForChat(
  page: Page,
) {
  const input = page
    .locator(
      'textarea[placeholder*="Diga"], textarea[placeholder*="Say"]',
    )
    .first();

  await input.waitFor({
    state: "visible",
    timeout: 30000,
  });

  return input;
}

export async function sendChatMessage(
  page: Page,
  text: string,
) {
  const started =
    performance.now();

  console.log(
    `📤 A preparar resposta: ${text}`,
  );

  const input = page
    .locator(
      [
        '.chat-footer textarea',
        '.chat-bar textarea',
        'textarea[placeholder*="Diga"]',
        'textarea[placeholder*="Say"]',
      ].join(", "),
    )
    .first();

  await input.waitFor({
    state: "visible",
    timeout: 3000,
  });

  await input.fill(text, {
    timeout: 2000,
  });

  console.log(
    "⌨️ Texto colocado no chat.",
  );

  /*
   * Primeiro tentamos ENTER.
   */
  try {
    await input.press(
      "Enter",
      {
        timeout: 1500,
      },
    );

    console.log(
      "⌨️ ENTER enviado.",
    );
  } catch (error) {
    console.log(
      "⚠️ ENTER falhou:",
      error instanceof Error
        ? error.message
        : error,
    );
  }

  await page.waitForTimeout(150);

  /*
   * Se o texto continua no textarea,
   * ENTER não enviou. Usamos o botão,
   * mas através de dispatchEvent,
   * sem esperar pela actionability.
   */
  const remaining =
    await input.inputValue()
      .catch(() => "");

  if (remaining.trim()) {
    console.log(
      "⚠️ ENTER não limpou o campo. A usar botão Enviar...",
    );

    const button = page
      .locator(
        'button:has-text("Enviar"), button:has-text("Send")',
      )
      .first();

    if (
      await button
        .isVisible()
        .catch(() => false)
    ) {
      await button.dispatchEvent(
        "click",
      );

      console.log(
        "🖱️ Evento click enviado ao botão.",
      );
    } else {
      throw new Error(
        "Botão Enviar não encontrado.",
      );
    }
  }

  const elapsed =
    performance.now() -
    started;

  console.log(
    `✅ Envio terminado em ${elapsed.toFixed(0)} ms`,
  );
}

