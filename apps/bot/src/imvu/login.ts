import type { Frame, Locator, Page } from "playwright";

type LoginForm = {
  frame: Frame;
  username: Locator;
  password: Locator;
};

async function dismissCookies(page: Page) {
  const selectors = [
    'button:has-text("Reject All")',
    'button:has-text("Allow All")',
    'button:has-text("Confirm My Choices")',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector);

    for (let i = 0; i < await locator.count(); i++) {
      const button = locator.nth(i);

      try {
        if (await button.isVisible()) {
          await button.click({ timeout: 2000 });
          await page.waitForTimeout(1000);
          return;
        }
      } catch {}
    }
  }
}

async function openLoginForm(page: Page) {
  const buttons = page.getByText("Log In", {
    exact: true,
  });

  console.log(
    `🔎 Botões "Log In" encontrados: ${await buttons.count()}`,
  );

  for (let i = (await buttons.count()) - 1; i >= 0; i--) {
    try {
      const button = buttons.nth(i);

      if (await button.isVisible()) {
        console.log(
          `➡️ A abrir formulário de login (botão ${i})...`,
        );

        await button.click();

        await page.waitForTimeout(2500);

        return;
      }
    } catch {}
  }

  throw new Error(
    'Não consegui abrir o formulário "Log In".',
  );
}

async function findLoginForm(
  page: Page,
): Promise<LoginForm | null> {
  for (const frame of page.frames()) {
    const passwords = frame.locator(
      'input[type="password"]',
    );

    for (let p = 0; p < await passwords.count(); p++) {
      const password = passwords.nth(p);

      try {
        if (!(await password.isVisible())) {
          continue;
        }
      } catch {
        continue;
      }

      const selectors = [
        'input[autocomplete="username"]',
        'input[name*="avatar" i]',
        'input[name*="username" i]',
        'input[name*="email" i]',
        'input[placeholder*="avatar" i]',
        'input[placeholder*="email" i]',
        'input[type="email"]',
        'input[type="text"]:not(#vendor-search-handler)',
      ];

      for (const selector of selectors) {
        const usernames =
          frame.locator(selector);

        for (
          let u = 0;
          u < await usernames.count();
          u++
        ) {
          const username =
            usernames.nth(u);

          try {
            if (await username.isVisible()) {
              return {
                frame,
                username,
                password,
              };
            }
          } catch {}
        }
      }
    }
  }

  return null;
}

async function printPossibleLoginErrors(
  page: Page,
) {
  const text = await page
    .locator("body")
    .innerText()
    .catch(() => "");

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const interesting = lines.filter((line) =>
    /incorrect|invalid|password|username|avatar|error|failed|captcha|verify|security/i.test(
      line,
    ),
  );

  if (interesting.length) {
    console.log("");
    console.log("⚠️ Mensagens relevantes:");
    console.log(
      interesting.slice(0, 20).join("\n"),
    );
  }
}

export async function loginImvu(
  page: Page,
  username: string,
  password: string,
) {
  console.log(
    "🔐 A verificar autenticação IMVU...",
  );

  await dismissCookies(page);

  if (!page.url().includes("/login")) {
    console.log(
      "✅ Sessão IMVU já existente.",
    );
    return;
  }

  let form = await findLoginForm(page);

  if (!form) {
    console.log(
      "ℹ️ Formulário ainda não está aberto.",
    );

    await openLoginForm(page);

    form = await findLoginForm(page);
  }

  if (!form) {
    await page.waitForTimeout(3000);
    form = await findLoginForm(page);
  }

  if (!form) {
    throw new Error(
      "Não encontrei os campos de login depois de abrir o formulário.",
    );
  }

  console.log(
    `✅ Formulário encontrado: ${form.frame.url()}`,
  );

  console.log(
    "👤 A preencher Avatar/Email...",
  );

  await form.username.fill(username);

  console.log(
    "🔑 A preencher Password...",
  );

  await form.password.fill(password);

  /*
   * Evitamos os vários botões "Log In".
   * Primeiro tentamos submeter o FORM real.
   */
  const htmlForm =
    form.password.locator(
      "xpath=ancestor::form[1]",
    );

  if (await htmlForm.count()) {
    console.log(
      "➡️ A submeter formulário...",
    );

    await htmlForm.evaluate((element) => {
      const formElement =
        element as HTMLFormElement;

      formElement.requestSubmit();
    });
  } else {
    console.log(
      "⌨️ A submeter com ENTER...",
    );

    await form.password.press("Enter");
  }

  console.log(
    "⏳ A aguardar resposta do IMVU...",
  );

  await page
    .waitForURL(
      (url) =>
        !url.href.includes(
          "/welcome/login/",
        ),
      {
        timeout: 15000,
      },
    )
    .catch(() => {});

  await page.waitForTimeout(3000);

  console.log(
    `🌐 URL após tentativa: ${page.url()}`,
  );

  if (
    !page.url().includes(
      "/welcome/login/",
    )
  ) {
    console.log(
      "✅ Login IMVU confirmado.",
    );
    return;
  }

  await printPossibleLoginErrors(page);

  await page.screenshot({
    path:
      "/tmp/roomwave-imvu-login-failed.png",
    fullPage: true,
  });

  throw new Error(
    "O login não foi confirmado: o browser continua na página de login.",
  );
}
