import {captureActivity,publicChat} from "./activity.js";
import { startWelcomes } from "./welcome.js";
import { applyActiveRoom, reportBotRoom } from "../../../../tools/room-runtime.mjs";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";

import { createImvuBrowser } from "./browser.js";
import { getImvuRoomUrl } from "./room.js";
import { loginImvu } from "./login.js";

import { handleCommand } from "../commands/index.js";

import {
  canRunCommand,
} from "./permissions.js";

import {
  ensureImvuMember,
} from "../services/api.js";

config({
  path: fileURLToPath(
    new URL("../../../../.env", import.meta.url),
  ),
});

applyActiveRoom();
reportBotRoom("joining");

const username =
  process.env.IMVU_BOT_USERNAME;

const password =
  process.env.IMVU_BOT_PASSWORD;

if (!username || !password) {
  throw new Error(
    "Credenciais IMVU em falta.",
  );
}

let activityReady = false;

type WsChatMessage = {
  isPublic?: boolean;
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

    if (activityReady && message.isPublic === true && /^\d{1,20}$/.test(message.userId)) void captureActivity({type:'message',userId:message.userId,text:text.slice(0,1000)});

    /*
     * Ignorar mensagens enviadas
     * pelo próprio RoomWaveBot.
     */
    if (
      message.userId ===
      process.env.IMVU_BOT_USER_ID
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

    /*
     * !ping não depende da API.
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

    const identity =
      await ensureImvuMember(
        message.userId,
      );

    const role =
      identity.role;

    console.log(
      `👤 ${identity.user.username} | IMVU=${message.userId} | ROLE=${role}`,
    );

    if (
      !canRunCommand(
        role,
        text,
      )
    ) {
      console.log(
        `⛔ Comando recusado: ${text}`,
      );

      return (
        "⛔ Não tens permissão para executar esse comando."
      );
    }

    /*
     * OWNER pode desligar voluntariamente
     * o gateway diretamente pelo IMVU.
     *
     * Esperamos alguns segundos para que
     * a resposta seja enviada pelo WebSocket
     * antes de terminar o processo.
     */
    if (
      text.toLowerCase() ===
      "!disconnect"
    ) {
      console.log(
        `🛑 Shutdown solicitado por ${identity.user.username} (${message.userId})`,
      );

      setTimeout(() => {
        console.log(
          "🛑 RoomWave IMVU Gateway desligado voluntariamente.",
        );

        reportBotRoom("offline");
        process.exit(0);
      }, 5000);

      return [
        "👋 ROOMWAVE BOT",
        "🛑 A desligar...",
        `👤 Pedido por: ${identity.user.username}`,
      ].join("\n");
    }

    try {
      /*
       * TODOS os restantes comandos
       * usam o motor RoomWave existente.
       */
      const response =
        await handleCommand(
          text,
          {
            imvuUserId:
              message.userId,
          },
        );

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
          isPublic: (${publicChat.toString()})(inner.to, String(outer.queue), String(inner.chatId), state.chatQueue, state.chatId),
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
try {
  await ensureInsideRoom(page);
  reportBotRoom("joined");
} catch (error) {
  reportBotRoom("error");
  throw error;
}
let checkingRoom = false;
const roomHeartbeat = setInterval(async () => {
  if (checkingRoom) return;
  checkingRoom = true;
  try {
    const correctRoom = page.url().includes(`room-${process.env.IMVU_ROOM_ID}`);
    // Low-resource mode removes the chat DOM. The realtime socket remains live.
    const connected = !page.isClosed() && correctRoom && await page.evaluate(`
      Boolean(window.__roomwaveWsState?.socket?.readyState === 1 &&
        window.__roomwaveWsState?.chatId && window.__roomwaveWsState?.chatQueue)
    `).catch(() => false);
    reportBotRoom(connected ? "joined" : "error");
  } catch { reportBotRoom("error"); }
  finally { checkingRoom = false; }
}, 10_000);
roomHeartbeat.unref();

console.log("");
console.log(
  "=================================",
);
console.log(
  " ⚡ ROOMWAVE IMVU GATEWAY ONLINE",
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

/*
 * ============================================================
 * ROOMWAVE LOW RESOURCE MODE v2
 * ============================================================
 *
 * A sala e o WebSocket já estão ativos.
 * Nesta fase não precisamos da interface 3D.
 *
 * Usamos uma STRING no page.evaluate para evitar
 * o helper __name introduzido pelo esbuild/tsx.
 */
try {
  const lowResourceScript = String.raw`
(() => {
  const stats = {
    canvases: 0,
    webglLost: 0,
    mediaRemoved: 0,
    iframesRemoved: 0,
    bodyNodesRemoved: 0
  };

  /*
   * Libertar WebGL/GPU.
   */
  const canvases =
    Array.from(
      document.querySelectorAll("canvas")
    );

  for (const canvas of canvases) {
    stats.canvases++;

    try {
      const gl =
        canvas.getContext("webgl2") ||
        canvas.getContext("webgl");

      if (gl) {
        const extension =
          gl.getExtension(
            "WEBGL_lose_context"
          );

        if (extension) {
          extension.loseContext();
          stats.webglLost++;
        }
      }
    } catch {}

    try {
      canvas.width = 1;
      canvas.height = 1;
      canvas.remove();
    } catch {}
  }

  /*
   * Remover media local.
   */
  const media =
    Array.from(
      document.querySelectorAll(
        "video, audio"
      )
    );

  for (const element of media) {
    try {
      element.pause();
      element.removeAttribute("src");
      element.load?.();
      element.remove();
      stats.mediaRemoved++;
    } catch {}
  }

  /*
   * Remover iframes desnecessários.
   */
  const iframes =
    Array.from(
      document.querySelectorAll(
        "iframe"
      )
    );

  for (const iframe of iframes) {
    try {
      iframe.remove();
      stats.iframesRemoved++;
    } catch {}
  }

  /*
   * Libertar o DOM visual.
   *
   * O socket RoomWave encontra-se associado
   * ao window/WebSocket e não ao DOM.
   */
  if (document.body) {
    stats.bodyNodesRemoved =
      document.body.children.length;

    document.body.replaceChildren();

    const sleeper =
      document.createElement("div");

    sleeper.id =
      "roomwave-gateway-alive";

    sleeper.textContent =
      "RoomWave Gateway";

    sleeper.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "width:1px",
      "height:1px",
      "overflow:hidden",
      "opacity:0",
      "pointer-events:none"
    ].join(";");

    document.body.appendChild(
      sleeper
    );
  }

  /*
   * Desligar animações e rendering visual.
   */
  const style =
    document.createElement("style");

  style.textContent = [
    "*{animation:none!important;",
    "transition:none!important;}",
    "canvas,video,audio,iframe,img{",
    "display:none!important;}"
  ].join("");

  document.head?.appendChild(style);

  /*
   * Reduzir futuros requestAnimationFrame
   * para aproximadamente 1 FPS.
   */
  window.requestAnimationFrame =
    function(callback) {
      return window.setTimeout(
        function() {
          callback(
            performance.now()
          );
        },
        1000
      );
    };

  window.cancelAnimationFrame =
    function(id) {
      window.clearTimeout(id);
    };

  /*
   * Se a aplicação tentar recriar
   * canvas/video/iframe, removemos novamente.
   */
  const cleanHeavyNodes =
    function() {
      const elements =
        document.querySelectorAll(
          "canvas,video,audio,iframe"
        );

      for (const element of elements) {
        try {
          if (
            element.tagName ===
            "CANVAS"
          ) {
            const gl =
              element.getContext?.(
                "webgl2"
              ) ||
              element.getContext?.(
                "webgl"
              );

            const extension =
              gl?.getExtension?.(
                "WEBGL_lose_context"
              );

            extension?.loseContext?.();
          }

          element.remove();
        } catch {}
      }
    };

  const observer =
    new MutationObserver(
      function() {
        cleanHeavyNodes();
      }
    );

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true
    }
  );

  window.__roomwaveLowResourceObserver =
    observer;

  return stats;
})()
`;

  const optimisation =
    await page.evaluate(
      lowResourceScript,
    );

  /*
   * Pedir explicitamente ao Chromium
   * para recolher objetos que já ficaram
   * sem referências.
   */
  try {
    const cdp =
      await page
        .context()
        .newCDPSession(page);

    await cdp.send(
      "HeapProfiler.collectGarbage",
    );

    await cdp.detach();

    console.log(
      "🧹 Chromium garbage collection executado.",
    );
  } catch (gcError) {
    console.log(
      "ℹ️ GC Chromium indisponível:",
      gcError instanceof Error
        ? gcError.message
        : gcError,
    );
  }

  console.log(
    "🌙 LOW RESOURCE MODE v2:",
    optimisation,
  );
} catch (error) {
  console.error(
    "⚠️ LOW RESOURCE MODE v2 falhou:",
    error instanceof Error
      ? error.message
      : error,
  );
}

console.log(
  "👂 Gateway ativo — a ouvir comandos IMVU...",
);
console.log("");

activityReady = true;
const stopWelcomes = startWelcomes(context, page);

let stopping = false;

async function stop() {
  if (stopping) return;

  stopping = true;
  clearInterval(roomHeartbeat);
  stopWelcomes();
  activityReady = false;
  reportBotRoom("offline");

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
