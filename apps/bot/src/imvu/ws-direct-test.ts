import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";

import { createImvuBrowser } from "./browser.js";
import { getImvuRoomUrl } from "./room.js";
import { loginImvu } from "./login.js";

import { handleCommand } from "../commands/index.js";

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

type WsChatMessage = {
  text: string;
  userId: string;
  chatId: string;
  queue: string;
};

async function ensureInsideRoom(
  page: Page,
) {
  const roomUrl =
    getImvuRoomUrl();

  console.log(
    `🌐 Sala: ${roomUrl}`,
  );

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
    console.log(
      "↩️ A regressar à sala...",
    );

    await page.goto(roomUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForTimeout(5000);
  }

  const deadline =
    Date.now() + 90000;

  let joined = false;

  while (
    Date.now() < deadline
  ) {
    const input = page.locator(
      [
        'textarea[placeholder*="Diga"]',
        'textarea[placeholder*="Say"]',
        ".chat-footer textarea",
      ].join(", "),
    ).first();

    if (
      await input
        .isVisible()
        .catch(() => false)
    ) {
      console.log(
        "✅ Sala carregada.",
      );

      return;
    }

    if (!joined) {
      const join =
        page.locator(
          [
            'button:has-text("PARTICIPAR")',
            'button:has-text("JOIN")',
          ].join(", "),
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

        joined = true;
      }
    }

    await page.waitForTimeout(300);
  }

  throw new Error(
    "Não foi possível entrar na sala.",
  );
}

const context =
  await createImvuBrowser();

const pages =
  context.pages();

const page =
  pages[0] ??
  await context.newPage();

/*
 * Callback Node <- browser.
 * Tem de existir ANTES da navegação.
 */
await page.exposeFunction(
  "__roomwaveNodeChat",
  async (
    message: WsChatMessage,
  ) => {
    const started =
      performance.now();

    const text =
      message.text
        .normalize("NFKC")
        .replace(
          /[\u200B-\u200D\uFEFF]/g,
          "",
        )
        .trim();

    /*
     * Ignorar eventos internos do IMVU.
     */
    if (
      !text ||
      text.startsWith("*")
    ) {
      return null;
    }

    /*
     * Ignorar mensagens enviadas
     * pelo próprio RoomWaveBot.
     */
    if (
      message.userId ===
      "391924516"
    ) {
      return null;
    }

    /*
     * Conversa normal não é enviada
     * para o motor de comandos.
     */
    if (!text.startsWith("!")) {
      return null;
    }

    console.log("");
    console.log(
      `⚡ COMMAND ${message.userId}: ${text}`,
    );

    try {
      /*
       * !ping fica como diagnóstico
       * ultrarrápido do gateway.
       */
      if (
        text.toLowerCase() ===
        "!ping"
      ) {
        console.log(
          `⚙️ Gateway ${(performance.now() - started).toFixed(1)} ms`,
        );

        return "🏓 Pong!";
      }

      /*
       * TODOS os restantes comandos
       * usam o motor RoomWave existente.
       */
      const response =
        await handleCommand(text);

      console.log(
        `⚙️ Command engine ${(performance.now() - started).toFixed(1)} ms`,
      );

      if (!response) {
        return null;
      }

      return response;
    } catch (error) {
      console.error(
        "❌ COMMAND ERROR:",
        error instanceof Error
          ? error.message
          : error,
      );

      return "❌ Ocorreu um erro ao executar o comando.";
    }
  },
);

/*
 * Confirmação Browser -> Node de que uma resposta
 * foi realmente colocada no WebSocket.
 */
await page.exposeFunction(
  "__roomwaveReplyAck",
  async (data: unknown) => {
    console.log(
      "🚀 DIRECT WS:",
      data,
    );
  },
);

/*
 * JavaScript executado ANTES do código IMVU.
 *
 * Não tocamos na autenticação.
 * Apenas guardamos a referência ao socket
 * que o próprio site cria.
 */
await context.addInitScript({
  content: `
(() => {
  const nativeSend =
    WebSocket.prototype.send;

  const state = {
    socket: null,
    userId: null,
    chatQueue: null,
    chatId: null,
    directOpId: 1000000000
  };

  window.__roomwaveWsState =
    state;

  function decodeBase64(value) {
    try {
      const binary =
        atob(value);

      const bytes =
        new Uint8Array(
          binary.length
        );

      for (
        let i = 0;
        i < binary.length;
        i++
      ) {
        bytes[i] =
          binary.charCodeAt(i);
      }

      return new TextDecoder()
        .decode(bytes);
    } catch {
      return "";
    }
  }

  function encodeBase64(value) {
    const bytes =
      new TextEncoder()
        .encode(value);

    let binary = "";

    for (
      let i = 0;
      i < bytes.length;
      i++
    ) {
      binary +=
        String.fromCharCode(
          bytes[i]
        );
    }

    return btoa(binary);
  }

  function hookSocket(socket) {
    if (
      socket.__roomwaveHooked
    ) {
      return;
    }

    socket.__roomwaveHooked =
      true;

    socket.addEventListener(
      "message",
      (event) => {
        if (
          typeof event.data !==
          "string"
        ) {
          return;
        }

        let outer;

        try {
          outer =
            JSON.parse(
              event.data
            );
        } catch {
          return;
        }

        if (
          outer.record !==
            "msg_g2c_send_message" ||
          outer.mount !==
            "messages" ||
          !String(
            outer.queue || ""
          ).startsWith(
            "/chat/"
          ) ||
          !outer.message
        ) {
          return;
        }

        let inner;

        try {
          inner =
            JSON.parse(
              decodeBase64(
                outer.message
              )
            );
        } catch {
          return;
        }

        if (
          typeof inner.message !==
          "string"
        ) {
          return;
        }

        const payload = {
          text:
            inner.message,

          userId:
            String(
              inner.userId ?? ""
            ),

          chatId:
            String(
              inner.chatId ?? ""
            ),

          queue:
            String(
              outer.queue
            )
        };

        if (
          typeof window
            .__roomwaveNodeChat ===
          "function"
        ) {
          Promise
            .resolve(
              window.__roomwaveNodeChat(
                payload
              )
            )
            .then((reply) => {
              if (
                typeof reply !==
                  "string" ||
                !reply.trim()
              ) {
                return;
              }

              try {
                const result =
                  window.__roomwaveSendChat(
                    reply
                  );

                if (
                  typeof window
                    .__roomwaveReplyAck ===
                  "function"
                ) {
                  window
                    .__roomwaveReplyAck({
                      ok: true,
                      reply: reply,
                      result: result
                    });
                }
              } catch (error) {
                if (
                  typeof window
                    .__roomwaveReplyAck ===
                  "function"
                ) {
                  window
                    .__roomwaveReplyAck({
                      ok: false,
                      reply: reply,
                      error:
                        String(error)
                    });
                }
              }
            })
            .catch((error) => {
              if (
                typeof window
                  .__roomwaveReplyAck ===
                "function"
              ) {
                window
                  .__roomwaveReplyAck({
                    ok: false,
                    stage:
                      "node-handler",
                    error:
                      String(error)
                  });
              }
            });
        }
      },
    );
  }

  WebSocket.prototype.send =
    function(data) {
      try {
        if (
          String(this.url)
            .includes(
              "wss-imq.imvu.com/streaming/"
            )
        ) {
          state.socket =
            this;

          hookSocket(this);

          if (
            typeof data ===
            "string"
          ) {
            const outer =
              JSON.parse(data);

            if (
              outer.record ===
              "msg_c2g_connect"
            ) {
              state.userId =
                String(
                  outer.user_id
                );
            }

            if (
              outer.record ===
              "msg_c2g_subscribe"
            ) {
              const subscriptions =
                outer
                  .queues_with_results ||
                [];

              for (
                const subscription
                of subscriptions
              ) {
                const name =
                  String(
                    subscription
                      .name || ""
                  );

                if (
                  name.startsWith(
                    "/chat/"
                  )
                ) {
                  state.chatQueue =
                    name;

                  state.chatId =
                    name.split("/")
                      .pop();
                }
              }
            }

            if (
              outer.record ===
                "msg_c2g_send_message" &&
              String(
                outer.queue || ""
              ).startsWith(
                "/chat/"
              )
            ) {
              state.chatQueue =
                outer.queue;

              state.chatId =
                String(
                  outer.queue
                )
                  .split("/")
                  .pop();
            }
          }
        }
      } catch {}

      return nativeSend.call(
        this,
        data
      );
    };

  window.__roomwaveSendChat =
    function(text) {
      const socket =
        state.socket;

      if (!socket) {
        throw new Error(
          "WebSocket IMVU não encontrado."
        );
      }

      if (
        socket.readyState !==
        WebSocket.OPEN
      ) {
        throw new Error(
          "WebSocket IMVU não está OPEN."
        );
      }

      if (
        !state.chatQueue ||
        !state.chatId ||
        !state.userId
      ) {
        throw new Error(
          "Chat/user ainda não identificados."
        );
      }

      state.directOpId++;

      const inner = {
        chatId:
          String(
            state.chatId
          ),

        message:
          String(text),

        to: 0,

        userId:
          String(
            state.userId
          )
      };

      const outer = {
        record:
          "msg_c2g_send_message",

        queue:
          state.chatQueue,

        mount:
          "messages",

        message:
          encodeBase64(
            JSON.stringify(
              inner
            )
          ),

        op_id:
          state.directOpId
      };

      socket.send(
        JSON.stringify(
          outer
        )
      );

      return {
        queue:
          state.chatQueue,

        chatId:
          state.chatId,

        userId:
          state.userId,

        opId:
          state.directOpId
      };
    };
})();
`,
});

/*
 * O addInitScript está instalado.
 * Agora carregamos de novo a página,
 * para o hook existir antes do IMVU
 * criar o socket.
 */
await ensureInsideRoom(
  page,
);

console.log("");
console.log(
  "=================================",
);
console.log(
  " ⚡ ROOMWAVE DIRECT WS ONLINE",
);
console.log(
  "=================================",
);

const state =
  await page.evaluate(
    () => {
      const w =
        window as any;

      const state =
        w.__roomwaveWsState;

      return {
        hasSocket:
          Boolean(
            state?.socket
          ),

        readyState:
          state?.socket
            ?.readyState ??
          null,

        userId:
          state?.userId ??
          null,

        chatQueue:
          state?.chatQueue ??
          null,

        chatId:
          state?.chatId ??
          null,
      };
    },
  );

console.log(
  state,
);

console.log("");
console.log(
  "👂 Escreve agora !ping com ☠Diablo☠",
);
console.log("");

let stopping = false;

async function stop() {
  if (stopping) return;

  stopping = true;

  console.log("");
  console.log(
    "🛑 A desligar...",
  );

  await context.close();

  process.exit(0);
}

process.on(
  "SIGINT",
  stop,
);

process.on(
  "SIGTERM",
  stop,
);

await new Promise(
  () => {},
);
