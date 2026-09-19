import {
  createServer,
  type Server,
  type ServerResponse,
} from "node:http";

import {
  spawn,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";


const HOST =
  "127.0.0.1";

const PORT =
  Number(
    process.env.ROOMWAVE_AUDIO_GATEWAY_PORT ??
    3100,
  );

const YTDLP_BIN =
  process.env.YTDLP_BIN ??
  "yt-dlp";

const FFMPEG_BIN =
  process.env.FFMPEG_BIN ??
  "ffmpeg";


let server:
  Server | null =
  null;


function validVideoId(
  value: string,
) {
  return /^[A-Za-z0-9_-]{11}$/.test(
    value,
  );
}


export function youtubeGatewayUrl(
  videoId: string,
) {

  if (!validVideoId(videoId)) {
    throw new Error(
      "YouTube videoId inválido",
    );
  }

  return (
    `http://${HOST}:${PORT}` +
    `/youtube/${videoId}.mp3`
  );
}


function killProcess(
  process:
    ChildProcess |
    null,
) {

  if (
    process &&
    !process.killed
  ) {

    try {
      process.kill(
        "SIGTERM",
      );
    } catch {}
  }
}


function sendGatewayError(
  res:
    ServerResponse,

  status:
    number,

  code:
    string,
) {

  if (
    res.headersSent ||
    res.writableEnded
  ) {
    return;
  }

  res.writeHead(
    status,
    {
      "Content-Type":
        "application/json",

      "Cache-Control":
        "no-store",
    },
  );

  res.end(
    JSON.stringify({
      ok: false,
      error: code,
    }),
  );
}


export async function
startAudioGateway() {

  if (server) {
    return;
  }


  server =
    createServer(
      (
        req,
        res,
      ) => {

        const url =
          new URL(
            req.url ?? "/",
            `http://${HOST}:${PORT}`,
          );


        /*
         * =========================
         * HEALTH
         * =========================
         */

        if (
          url.pathname === "/health"
        ) {

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json",

              "Cache-Control":
                "no-store",
            },
          );

          res.end(
            JSON.stringify({
              ok: true,
              service:
                "roomwave-audio-gateway",
            }),
          );

          return;
        }


        /*
         * =========================
         * YOUTUBE
         * =========================
         */

        const match =
          url.pathname.match(
            /^\/youtube\/([A-Za-z0-9_-]{11})\.mp3$/,
          );


        if (!match) {

          res.writeHead(
            404,
            {
              "Content-Type":
                "application/json",
            },
          );

          res.end(
            JSON.stringify({
              ok: false,
              error:
                "not_found",
            }),
          );

          return;
        }


        if (
          req.method !== "GET"
        ) {

          res.writeHead(
            405,
          );

          res.end();

          return;
        }


        const videoId =
          match[1];

        const youtubeUrl =
          `https://www.youtube.com/watch?v=${videoId}`;


        console.log(
          `🎧 Gateway request: YouTube ${videoId}`,
        );


        let ffmpeg:
          ChildProcessWithoutNullStreams |
          null =
          null;

        let streamStarted =
          false;

        let finished =
          false;

        let ytdlpError =
          "";


        /*
         * =========================
         * YT-DLP
         * =========================
         */

        const ytdlp =
          spawn(
            YTDLP_BIN,
            [
              "--js-runtimes",
              "node:/usr/bin/node",

              "--no-playlist",

              "--no-progress",

              "--no-warnings",

              "-f",
              "bestaudio/best",

              "-o",
              "-",

              youtubeUrl,
            ],
            {
              stdio: [
                "ignore",
                "pipe",
                "pipe",
              ],
            },
          );


        ytdlp.stderr.on(
          "data",
          chunk => {

            ytdlpError +=
              chunk.toString();

            if (
              ytdlpError.length >
              6000
            ) {

              ytdlpError =
                ytdlpError.slice(
                  -6000,
                );
            }
          },
        );


        /*
         * Importante:
         *
         * FFmpeg só arranca depois de
         * yt-dlp produzir dados reais.
         */

        ytdlp.stdout.once(
          "data",
          firstChunk => {

            if (finished) {
              return;
            }


            console.log(
              `📦 yt-dlp começou a fornecer dados: ${videoId}`,
            );


            ffmpeg =
              spawn(
                FFMPEG_BIN,
                [
                  "-hide_banner",

                  "-loglevel",
                  "error",

                  "-i",
                  "pipe:0",

                  "-vn",

                  "-ac",
                  "2",

                  "-ar",
                  "44100",

                  "-codec:a",
                  "libmp3lame",

                  "-b:a",
                  "128k",

                  "-f",
                  "mp3",

                  "pipe:1",
                ],
                {
                  stdio: [
                    "pipe",
                    "pipe",
                    "pipe",
                  ],
                },
              );


            ffmpeg.on(
              "error",
              error => {

                console.error(
                  `❌ Não foi possível iniciar ffmpeg: ${error.message}`,
                );

                sendGatewayError(
                  res,
                  500,
                  "ffmpeg_start_failed",
                );
              },
            );


            ffmpeg.stderr.on(
              "data",
              chunk => {

                const message =
                  chunk
                    .toString()
                    .trim();

                if (message) {

                  console.error(
                    `⚠️ ffmpeg: ${message.slice(0, 500)}`,
                  );
                }
              },
            );


            /*
             * Primeiro pedaço já foi
             * retirado pelo once("data").
             */
            ffmpeg.stdin.write(
              firstChunk,
            );


            /*
             * Restante stream.
             */
            ytdlp.stdout.pipe(
              ffmpeg.stdin,
            );


            ffmpeg.stdout.once(
              "data",
              firstMp3Chunk => {

                if (
                  finished
                ) {
                  return;
                }


                streamStarted =
                  true;


                res.writeHead(
                  200,
                  {
                    "Content-Type":
                      "audio/mpeg",

                    "Cache-Control":
                      "no-store",

                    "Connection":
                      "close",
                  },
                );


                res.write(
                  firstMp3Chunk,
                );


                ffmpeg!.stdout.pipe(
                  res,
                );


                console.log(
                  `🔊 Gateway streaming: ${videoId}`,
                );
              },
            );


            ffmpeg.on(
              "exit",
              code => {

                if (
                  finished
                ) {
                  return;
                }


                if (
                  code !== 0 &&
                  !streamStarted
                ) {

                  console.error(
                    `❌ ffmpeg terminou antes de produzir áudio. code=${code}`,
                  );


                  sendGatewayError(
                    res,
                    502,
                    "audio_transcode_failed",
                  );
                }


                if (
                  streamStarted &&
                  !res.writableEnded
                ) {

                  res.end();
                }
              },
            );
          },
        );


        /*
         * Executável inexistente /
         * problema ao iniciar yt-dlp.
         */

        ytdlp.on(
          "error",
          error => {

            finished =
              true;


            console.error(
              `❌ Não foi possível iniciar yt-dlp: ${error.message}`,
            );


            sendGatewayError(
              res,
              500,
              "resolver_start_failed",
            );
          },
        );


        /*
         * yt-dlp terminou.
         */

        ytdlp.on(
          "exit",
          code => {

            if (
              code === 0
            ) {
              return;
            }


            const blocked =
              /sign in to confirm|not a bot/i
                .test(
                  ytdlpError,
                );


            if (blocked) {

              console.error(
                `⛔ YouTube recusou o pedido da EC2: ${videoId}`,
              );

            } else {

              const message =
                ytdlpError
                  .replaceAll(
                    youtubeUrl,
                    "[youtube-url]",
                  )
                  .trim()
                  .slice(
                    0,
                    500,
                  );


              console.error(
                `❌ yt-dlp code=${code}: ${message}`,
              );
            }


            /*
             * Só enviar 502 quando
             * ainda não começámos áudio.
             */

            if (
              !streamStarted
            ) {

              sendGatewayError(
                res,
                502,
                blocked
                  ? "youtube_access_denied"
                  : "youtube_source_failed",
              );
            }
          },
        );


        const cleanup =
          () => {

            finished =
              true;

            killProcess(
              ytdlp,
            );

            killProcess(
              ffmpeg,
            );
          };


        req.on(
          "aborted",
          cleanup,
        );


        res.on(
          "close",
          cleanup,
        );
      },
    );


  await new Promise<void>(
    (
      resolve,
      reject,
    ) => {

      server!.once(
        "error",
        reject,
      );


      server!.listen(
        PORT,
        HOST,
        () => {

          console.log(
            `🎧 Audio Gateway ativo em http://${HOST}:${PORT}`,
          );

          resolve();
        },
      );
    },
  );
}
