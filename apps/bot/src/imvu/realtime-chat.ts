import type { Page } from "playwright";

export type RealtimeImvuMessage = {
  key: string;
  userUrl: string;
  userId: string | null;
  username: string | null;
  text: string;
  timestamp: string;
  isMine: boolean;
};

export async function installRealtimeChat(
  page: Page,
  onMessage: (
    message: RealtimeImvuMessage,
  ) => Promise<void>,
) {
  const callbackName =
    "__roomwaveRealtimeMessage";

  /*
   * Esta função fica disponível dentro
   * da página IMVU e encaminha a mensagem
   * imediatamente para Node.js.
   */
  await page.exposeFunction(
    callbackName,
    async (
      message: RealtimeImvuMessage,
    ) => {
      await onMessage(message);
    },
  );

  /*
   * IMPORTANTE:
   *
   * Usamos uma STRING JavaScript pura.
   * Assim o tsx/esbuild não injeta helpers
   * como __name dentro do browser.
   */
  const browserScript = `
(() => {
  const callbackName =
    ${JSON.stringify(callbackName)};

  const w = window;

  if (w.__roomwaveObserver) {
    try {
      w.__roomwaveObserver.disconnect();
    } catch {}
  }

  const seen = new Set();

  /*
   * Ignorar tudo o que já estava no
   * chat antes do listener arrancar.
   */
  document
    .querySelectorAll(
      ".cs2-msg[data-id][data-timestamp]"
    )
    .forEach((element) => {
      const userUrl =
        element.getAttribute("data-id");

      const timestamp =
        element.getAttribute(
          "data-timestamp"
        );

      if (userUrl && timestamp) {
        seen.add(
          userUrl + ":" + timestamp
        );
      }
    });

  const processMessage = (element) => {
    if (
      !element.matches(
        ".cs2-msg[data-id][data-timestamp]"
      )
    ) {
      return;
    }

    const userUrl =
      element.getAttribute(
        "data-id"
      ) || "";

    const timestamp =
      element.getAttribute(
        "data-timestamp"
      ) || "";

    if (!userUrl || !timestamp) {
      return;
    }

    const key =
      userUrl + ":" + timestamp;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    const textElement =
      element.querySelector(
        ".cs2-text"
      );

    const text =
      textElement &&
      textElement.textContent
        ? textElement.textContent.trim()
        : "";

    if (!text) {
      return;
    }

    const nameElement =
      element.querySelector(
        ".cs2-name"
      );

    const username =
      nameElement &&
      nameElement.textContent
        ? nameElement.textContent.trim()
        : null;

    const match =
      userUrl.match(
        /user-(\\d+)/
      );

    const payload = {
      key: key,

      userUrl: userUrl,

      userId:
        match
          ? match[1]
          : null,

      username:
        username,

      text:
        text,

      timestamp:
        timestamp,

      isMine:
        element.classList.contains(
          "my-user"
        )
    };

    const callback =
      w[callbackName];

    if (
      typeof callback ===
      "function"
    ) {
      callback(payload);
    }
  };

  const inspectNode = (node) => {
    if (
      !node ||
      node.nodeType !== 1
    ) {
      return;
    }

    const element = node;

    /*
     * O próprio node pode já ser
     * uma mensagem.
     */
    processMessage(element);

    /*
     * Ou pode ser um container que
     * contém uma ou várias mensagens.
     */
    element
      .querySelectorAll(
        ".cs2-msg[data-id][data-timestamp]"
      )
      .forEach(
        processMessage
      );
  };

  const observer =
    new MutationObserver(
      (mutations) => {
        for (
          const mutation
          of mutations
        ) {
          for (
            const node
            of mutation.addedNodes
          ) {
            inspectNode(node);
          }
        }
      }
    );

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );

  w.__roomwaveObserver =
    observer;

  console.log(
    "[RoomWave] realtime observer ativo"
  );
})();
`;

  await page.evaluate(
    browserScript,
  );

  console.log(
    "⚡ Listener realtime IMVU ativo.",
  );
}
