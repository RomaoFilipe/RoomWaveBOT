import http from "node:http";
import fs from "node:fs";
import {
  spawn,
  spawnSync,
  execFileSync
} from "node:child_process";

const HOST = "127.0.0.1";
const PORT = 3200;

const CDP_HOST = "127.0.0.1";
const CDP_PORT = 9224;

const DISPLAY = ":99";

const PLAYER_URL =
  `http://${HOST}:${PORT}/player.html`;

const PLAYER_HTML =
  new URL("./player.html", import.meta.url);

const PULSE_SERVER =
  process.env.PULSE_SERVER ||
  "unix:/run/user/1000/pulse/native";

let xvfbProcess = null;
let chromeProcess = null;

/* ------------------------------------------------------- */
/* UTILS                                                   */
/* ------------------------------------------------------- */

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function json(res, status, data) {

  const body =
    JSON.stringify(data, null, 2);

  res.writeHead(status, {
    "content-type":
      "application/json; charset=utf-8",
    "content-length":
      Buffer.byteLength(body)
  });

  res.end(body);
}

function parseVideoId(input) {

  if (
    typeof input === "string" &&
    /^[A-Za-z0-9_-]{11}$/.test(input.trim())
  ) {
    return input.trim();
  }

  let url;

  try {
    url = new URL(String(input));
  } catch {
    return null;
  }

  if (
    url.hostname === "youtu.be" ||
    url.hostname.endsWith(".youtu.be")
  ) {

    const id =
      url.pathname
        .split("/")
        .filter(Boolean)[0];

    return /^[A-Za-z0-9_-]{11}$/.test(id || "")
      ? id
      : null;
  }

  const host =
    url.hostname.replace(/^www\./, "");

  if (
    host === "youtube.com" ||
    host === "music.youtube.com"
  ) {

    const watchId =
      url.searchParams.get("v");

    if (
      /^[A-Za-z0-9_-]{11}$/.test(
        watchId || ""
      )
    ) {
      return watchId;
    }

    const parts =
      url.pathname
        .split("/")
        .filter(Boolean);

    if (
      ["embed", "shorts", "live"]
        .includes(parts[0]) &&
      /^[A-Za-z0-9_-]{11}$/.test(
        parts[1] || ""
      )
    ) {
      return parts[1];
    }
  }

  return null;
}

function findChrome() {

  if (
    process.env.CHROME_BIN &&
    fs.existsSync(process.env.CHROME_BIN)
  ) {
    return process.env.CHROME_BIN;
  }

  try {

    return execFileSync(
      "/bin/bash",
      [
        "-lc",
        `find "$HOME/.cache/ms-playwright" ` +
        `-type f ` +
        `-path '*/chrome-linux64/chrome' ` +
        `-executable 2>/dev/null | head -n1`
      ],
      {
        encoding: "utf8"
      }
    ).trim();

  } catch {
    return "";
  }
}

/* ------------------------------------------------------- */
/* XVFB                                                    */
/* ------------------------------------------------------- */

function xvfbRunning() {

  const result =
    spawnSync(
      "pgrep",
      [
        "-f",
        "Xvfb :99"
      ]
    );

  return result.status === 0;
}

function ensureXvfb() {

  if (xvfbRunning()) {
    console.log("🖥️ Xvfb :99 já ativo");
    return;
  }

  console.log("🖥️ A iniciar Xvfb :99");

  xvfbProcess =
    spawn(
      "/usr/bin/Xvfb",
      [
        DISPLAY,
        "-screen",
        "0",
        "1280x720x24",
        "-nolisten",
        "tcp"
      ],
      {
        stdio: "ignore"
      }
    );
}

/* ------------------------------------------------------- */
/* CHROMIUM                                                */
/* ------------------------------------------------------- */

function startChrome() {

  const chrome =
    findChrome();

  if (!chrome) {
    throw new Error(
      "Chromium Playwright não encontrado"
    );
  }

  console.log(
    `🌐 Chromium: ${chrome}`
  );

  chromeProcess =
    spawn(
      chrome,
      [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",

        "--no-first-run",
        "--no-default-browser-check",

        "--autoplay-policy=no-user-gesture-required",

        `--remote-debugging-address=${CDP_HOST}`,
        `--remote-debugging-port=${CDP_PORT}`,

        `--user-data-dir=${
          process.env.ROOMWAVE_CHROME_PROFILE ||
          "/home/ubuntu/roomwave/.data/youtube-player"
        }`,

        "--window-size=1280,720",

        PLAYER_URL
      ],

      {
        env: {
          ...process.env,

          DISPLAY,

          PULSE_SERVER,

          PULSE_SINK:
            "roomwave"
        },

        stdio: "ignore"
      }
    );

  chromeProcess.on(
    "exit",
    (code, signal) => {

      console.log(
        `⚠️ Chromium terminou code=${code} signal=${signal}`
      );

      chromeProcess = null;
    }
  );
}

/* ------------------------------------------------------- */
/* CDP                                                     */
/* ------------------------------------------------------- */

async function targets() {

  const response =
    await fetch(
      `http://${CDP_HOST}:${CDP_PORT}/json/list`
    );

  if (!response.ok)
    throw new Error(
      `CDP HTTP ${response.status}`
    );

  return response.json();
}

async function playerTarget() {

  const all =
    await targets();

  return all.find(
    t =>
      t.type === "page" &&
      t.url.includes(
        `${HOST}:${PORT}/player.html`
      )
  );
}

async function evaluate(expression) {

  const target =
    await playerTarget();

  if (!target)
    throw new Error(
      "Página do RoomWave Player não encontrada"
    );

  return new Promise(
    (resolve, reject) => {

      const ws =
        new WebSocket(
          target.webSocketDebuggerUrl
        );

      const timer =
        setTimeout(
          () => {
            try {
              ws.close();
            } catch {}

            reject(
              new Error(
                "Timeout CDP"
              )
            );
          },
          5000
        );

      ws.addEventListener(
        "open",
        () => {

          ws.send(
            JSON.stringify({
              id: 1,

              method:
                "Runtime.evaluate",

              params: {
                expression,
                returnByValue: true,
                awaitPromise: true
              }
            })
          );
        }
      );

      ws.addEventListener(
        "message",
        event => {

          let msg;

          try {
            msg =
              JSON.parse(
                event.data
              );
          } catch {
            return;
          }

          if (msg.id !== 1)
            return;

          clearTimeout(timer);

          try {
            ws.close();
          } catch {}

          if (
            msg.error ||
            msg.result?.exceptionDetails
          ) {

            reject(
              new Error(
                "Erro Runtime.evaluate"
              )
            );

            return;
          }

          resolve(
            msg.result?.result?.value
          );
        }
      );

      ws.addEventListener(
        "error",
        () => {

          clearTimeout(timer);

          reject(
            new Error(
              "Erro WebSocket CDP"
            )
          );
        }
      );
    }
  );
}

async function status() {

  return evaluate(`
    window.rwGetStatus
      ? window.rwGetStatus()
      : {
          state: "PAGE_NOT_READY"
        }
  `);
}

async function waitForPlayer() {

  for (
    let attempt = 0;
    attempt < 40;
    attempt++
  ) {

    try {

      const s =
        await status();

      if (
        s?.playerReady === true
      ) {

        console.log(
          "✅ YouTube IFrame API pronta"
        );

        return;
      }

    } catch {}

    await sleep(500);
  }

  throw new Error(
    "Player não ficou pronto"
  );
}

async function play(videoId) {

  const accepted =
    await evaluate(`
      window.rwPlay(
        ${JSON.stringify(videoId)}
      )
  `);

  if (!accepted)
    throw new Error(
      "Player ainda não está pronto"
    );

  /*
   * Esperar pela validação real do
   * IFrame: PLAYING ou erro.
   */
  for (
    let attempt = 0;
    attempt < 24;
    attempt++
  ) {

    await sleep(500);

    const s =
      await status();

    /*
     * O código de erro é a fonte de verdade.
     * O IFrame pode emitir UNSTARTED depois de onError().
     */
    if (
      s?.error !== null &&
      s?.error !== undefined
    ) {
      return {
        ok: false,
        ...s,
        state: "ERROR"
      };
    }

    if (
      s?.state === "PLAYING"
    ) {
      return {
        ok: true,
        ...s
      };
    }

    if (
      s?.state === "ERROR" ||
      s?.state === "AUTOPLAY_BLOCKED"
    ) {

      return {
        ok: false,
        ...s
      };
    }
  }

  return {
    ok: false,
    timeout: true,
    ...(await status())
  };
}

/* ------------------------------------------------------- */
/* HTTP                                                    */
/* ------------------------------------------------------- */

async function readJson(req) {

  let data = "";

  for await (const chunk of req) {

    data += chunk;

    if (data.length > 16384)
      throw new Error(
        "Payload demasiado grande"
      );
  }

  if (!data)
    return {};

  return JSON.parse(data);
}

const server =
  http.createServer(
    async (req, res) => {

      try {

        const url =
          new URL(
            req.url,
            `http://${HOST}:${PORT}`
          );

        if (
          req.method === "GET" &&
          url.pathname === "/player.html"
        ) {

          const html =
            fs.readFileSync(
              PLAYER_HTML,
              "utf8"
            );

          res.writeHead(
            200,
            {
              "content-type":
                "text/html; charset=utf-8",

              "referrer-policy":
                "strict-origin-when-cross-origin",

              "cache-control":
                "no-store"
            }
          );

          res.end(html);

          return;
        }

        if (
          req.method === "GET" &&
          url.pathname === "/health"
        ) {

          json(
            res,
            200,
            {
              ok: true,
              service:
                "roomwave-browser-player"
            }
          );

          return;
        }

        if (
          req.method === "GET" &&
          url.pathname === "/status"
        ) {

          json(
            res,
            200,
            {
              ok: true,
              ...(await status())
            }
          );

          return;
        }

        if (
          req.method === "POST" &&
          url.pathname === "/play"
        ) {

          const body =
            await readJson(req);

          const input =
            body.input ??
            body.url ??
            body.videoId;

          const videoId =
            parseVideoId(input);

          if (!videoId) {

            json(
              res,
              400,
              {
                ok: false,
                error:
                  "invalid_youtube_input"
              }
            );

            return;
          }

          const result =
            await play(videoId);

          json(
            res,
            result.ok ? 200 : 409,
            {
              videoId,
              ...result
            }
          );

          return;
        }

        if (
          req.method === "POST" &&
          url.pathname === "/pause"
        ) {

          await evaluate(
            "window.rwPause()"
          );

          await sleep(300);

          json(
            res,
            200,
            {
              ok: true,
              ...(await status())
            }
          );

          return;
        }

        if (
          req.method === "POST" &&
          url.pathname === "/resume"
        ) {

          await evaluate(
            "window.rwResume()"
          );

          await sleep(300);

          json(
            res,
            200,
            {
              ok: true,
              ...(await status())
            }
          );

          return;
        }

        if (
          req.method === "POST" &&
          url.pathname === "/stop"
        ) {

          await evaluate(
            "window.rwStop()"
          );

          await sleep(300);

          json(
            res,
            200,
            {
              ok: true,
              ...(await status())
            }
          );

          return;
        }

        json(
          res,
          404,
          {
            ok: false,
            error: "not_found"
          }
        );

      } catch (error) {

        console.error(error);

        json(
          res,
          500,
          {
            ok: false,

            error:
              error instanceof Error
                ? error.message
                : String(error)
          }
        );
      }
    }
  );

/* ------------------------------------------------------- */
/* START                                                   */
/* ------------------------------------------------------- */

server.listen(
  PORT,
  HOST,
  async () => {

    console.log(
      `🎛️ RoomWave Browser Player: http://${HOST}:${PORT}`
    );

    try {

      ensureXvfb();

      await sleep(1000);

      startChrome();

      await waitForPlayer();

      console.log(
        "🎵 RoomWave Browser Player pronto"
      );

    } catch (error) {

      console.error(
        "❌ Startup:",
        error
      );
    }
  }
);

/* ------------------------------------------------------- */
/* SHUTDOWN                                                */
/* ------------------------------------------------------- */

function shutdown() {

  console.log(
    "🛑 A terminar Browser Player..."
  );

  try {
    chromeProcess?.kill("SIGTERM");
  } catch {}

  try {
    xvfbProcess?.kill("SIGTERM");
  } catch {}

  server.close(() => {
    process.exit(0);
  });

  setTimeout(
    () => process.exit(0),
    3000
  ).unref();
}

process.on(
  "SIGTERM",
  shutdown
);

process.on(
  "SIGINT",
  shutdown
);
