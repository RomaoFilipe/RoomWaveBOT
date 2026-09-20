import http from "node:http";

import {
  fileURLToPath
} from "node:url";

import {
  config
} from "dotenv";

config({
  path:
    fileURLToPath(
      new URL(
        "../../../.env",
        import.meta.url
      )
    )
});

import {
  AudioQueue
} from "./queue";

import {
  StreamHub
} from "./stream";

import {
  AudioEngine
} from "./ffmpeg";

import {
  resolveAudioTrack
} from "./resolver";

import {
  ffmpegHealth
} from "./health";

const HOST =
  process.env
    .ROOMWAVE_AUDIO_HOST ||
  "127.0.0.1";

const PORT =
  Number(
    process.env
      .ROOMWAVE_AUDIO_PORT ||
    3210
  );

const queue =
  new AudioQueue();

const stream =
  new StreamHub();

const engine =
  new AudioEngine(
    queue,
    stream
  );

function sendJson(
  res:
    http.ServerResponse,

  status:
    number,

  value:
    unknown
) {

  const body =
    JSON.stringify(
      value,
      null,
      2
    );

  res.writeHead(
    status,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Cache-Control":
        "no-store",

      "Content-Length":
        Buffer.byteLength(body)
    }
  );

  res.end(body);
}

async function readJson(
  req:
    http.IncomingMessage
): Promise<any> {

  let data = "";

  for await (
    const chunk of req
  ) {

    data +=
      chunk.toString();

    if (
      data.length >
      1024 * 1024
    ) {
      throw new Error(
        "Request too large"
      );
    }
  }

  if (!data.trim()) {
    return {};
  }

  return JSON.parse(data);
}

const server =
  http.createServer(
    async (
      req,
      res
    ) => {

      try {

        const url =
          new URL(
            req.url || "/",
            `http://${HOST}:${PORT}`
          );

        if (
          req.method === "GET" &&
          url.pathname ===
            "/health"
        ) {

          sendJson(
            res,
            200,
            {
              ok: true,

              service:
                "roomwave-audio-engine",

              ffmpeg:
                ffmpegHealth(),

              ...engine.status()
            }
          );

          return;
        }

        if (
          req.method === "GET" &&
          url.pathname ===
            "/status"
        ) {

          sendJson(
            res,
            200,
            {
              ok: true,
              ...engine.status()
            }
          );

          return;
        }

        if (
          req.method === "GET" &&
          (
            url.pathname ===
              "/stream" ||
            url.pathname ===
              "/live.mp3"
          )
        ) {

          stream.attach(
            req,
            res
          );

          return;
        }

        if (
          req.method === "GET" &&
          url.pathname ===
            "/queue"
        ) {

          sendJson(
            res,
            200,
            {
              ok: true,
              queue:
                engine.queueItems()
            }
          );

          return;
        }

        if (
          req.method === "POST" &&
          url.pathname ===
            "/play"
        ) {

          const body =
            await readJson(req);

          const track =
            resolveAudioTrack(
              body.source ??
              body.url,

              body.title
            );

          await engine.play(
            track
          );

          sendJson(
            res,
            200,
            {
              ok: true,
              track,
              ...engine.status()
            }
          );

          return;
        }

        if (
          req.method === "POST" &&
          url.pathname ===
            "/queue"
        ) {

          const body =
            await readJson(req);

          const track =
            resolveAudioTrack(
              body.source ??
              body.url,

              body.title
            );

          const position =
            await engine.enqueue(
              track
            );

          sendJson(
            res,
            200,
            {
              ok: true,
              position,
              track
            }
          );

          return;
        }

        if (
          req.method === "POST" &&
          url.pathname ===
            "/pause"
        ) {

          sendJson(
            res,
            200,
            {
              ok:
                engine.pause(),

              ...engine.status()
            }
          );

          return;
        }

        if (
          req.method === "POST" &&
          url.pathname ===
            "/resume"
        ) {

          sendJson(
            res,
            200,
            {
              ok:
                engine.resume(),

              ...engine.status()
            }
          );

          return;
        }

        if (
          req.method === "POST" &&
          url.pathname ===
            "/stop"
        ) {

          engine.stop();

          sendJson(
            res,
            200,
            {
              ok: true,
              ...engine.status()
            }
          );

          return;
        }

        if (
          req.method === "POST" &&
          url.pathname ===
            "/skip"
        ) {

          await engine.skip();

          sendJson(
            res,
            200,
            {
              ok: true,
              ...engine.status()
            }
          );

          return;
        }

        sendJson(
          res,
          404,
          {
            ok: false,
            error:
              "NOT_FOUND"
          }
        );

      } catch (
        error
      ) {

        console.error(
          error
        );

        sendJson(
          res,
          400,
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

server.listen(
  PORT,
  HOST,
  () => {

    console.log(
      ""
    );

    console.log(
      "🎵 RoomWave Audio Engine"
    );

    console.log(
      `🌐 http://${HOST}:${PORT}`
    );

    console.log(
      `🎧 http://${HOST}:${PORT}/stream`
    );

    console.log(
      `❤️  http://${HOST}:${PORT}/health`
    );

    console.log(
      ""
    );
  }
);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    engine.stop();
    server.close();
  });
}
