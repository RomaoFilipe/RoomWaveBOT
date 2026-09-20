import { config } from "dotenv";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import {
  randomBytes
} from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  unlink
} from "node:fs/promises";
import {
  dirname
} from "node:path";
import {
  fileURLToPath
} from "node:url";

config({
  path: fileURLToPath(
    new URL("../../../.env", import.meta.url)
  )
});

const HOST =
  process.env.SPOTIFY_CONTROL_HOST ??
  "127.0.0.1";

const PORT =
  Number(
    process.env.SPOTIFY_CONTROL_PORT ??
    3220
  );

const CLIENT_ID =
  process.env.SPOTIFY_CLIENT_ID;

const CLIENT_SECRET =
  process.env.SPOTIFY_CLIENT_SECRET;

const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI;

const SCOPES =
  process.env.SPOTIFY_SCOPES ??
  [
    "user-read-private",
    "user-read-email",
    "user-read-playback-state",
    "user-read-currently-playing",
    "user-modify-playback-state"
  ].join(" ");

if (
  !CLIENT_ID ||
  !CLIENT_SECRET ||
  !REDIRECT_URI
) {
  throw new Error(
    "SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET e SPOTIFY_REDIRECT_URI são obrigatórios."
  );
}

const TOKEN_FILE =
  "/home/ubuntu/roomwave/.data/spotify/token.json";

const STATE_FILE =
  "/home/ubuntu/roomwave/.data/spotify/oauth-state";

interface StoredToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string;
  expires_at: number;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown
) {
  res.writeHead(
    status,
    {
      "content-type":
        "application/json; charset=utf-8",
      "cache-control":
        "no-store"
    }
  );

  res.end(
    JSON.stringify(
      body,
      null,
      2
    )
  );
}

function sendText(
  res: ServerResponse,
  status: number,
  text: string
) {
  res.writeHead(
    status,
    {
      "content-type":
        "text/plain; charset=utf-8",
      "cache-control":
        "no-store"
    }
  );

  res.end(text);
}

async function readBody(
  req: IncomingMessage
): Promise<any> {

  const chunks: Buffer[] = [];

  for await (
    const chunk of req
  ) {
    chunks.push(
      Buffer.from(chunk)
    );
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(
    Buffer.concat(chunks)
      .toString("utf8")
  );
}

async function loadToken():
  Promise<StoredToken | null> {

  try {
    return JSON.parse(
      await readFile(
        TOKEN_FILE,
        "utf8"
      )
    );
  } catch {
    return null;
  }
}

async function saveToken(
  token: StoredToken
) {

  await mkdir(
    dirname(TOKEN_FILE),
    {
      recursive: true,
      mode: 0o700
    }
  );

  await writeFile(
    TOKEN_FILE,
    JSON.stringify(
      token,
      null,
      2
    ),
    {
      mode: 0o600
    }
  );
}

function basicAuth() {
  return Buffer.from(
    `${CLIENT_ID}:${CLIENT_SECRET}`
  ).toString("base64");
}

async function exchangeCode(
  code: string
) {

  const response =
    await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",

        headers: {
          authorization:
            `Basic ${basicAuth()}`,

          "content-type":
            "application/x-www-form-urlencoded"
        },

        body:
          new URLSearchParams({
            grant_type:
              "authorization_code",

            code,

            redirect_uri:
              REDIRECT_URI!
          })
      }
    );

  const data: any =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `Spotify token HTTP ${response.status}: ${JSON.stringify(data)}`
    );
  }

  const token: StoredToken = {
    access_token:
      data.access_token,

    refresh_token:
      data.refresh_token,

    token_type:
      data.token_type ??
      "Bearer",

    scope:
      data.scope ??
      "",

    expires_at:
      Date.now() +
      Number(
        data.expires_in ?? 3600
      ) * 1000
  };

  await saveToken(token);

  return token;
}

async function refreshToken(
  current: StoredToken
): Promise<StoredToken> {

  const response =
    await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",

        headers: {
          authorization:
            `Basic ${basicAuth()}`,

          "content-type":
            "application/x-www-form-urlencoded"
        },

        body:
          new URLSearchParams({
            grant_type:
              "refresh_token",

            refresh_token:
              current.refresh_token
          })
      }
    );

  const data: any =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `Spotify refresh HTTP ${response.status}: ${JSON.stringify(data)}`
    );
  }

  const updated: StoredToken = {
    access_token:
      data.access_token,

    refresh_token:
      data.refresh_token ??
      current.refresh_token,

    token_type:
      data.token_type ??
      current.token_type,

    scope:
      data.scope ??
      current.scope,

    expires_at:
      Date.now() +
      Number(
        data.expires_in ?? 3600
      ) * 1000
  };

  await saveToken(updated);

  return updated;
}

async function accessToken():
  Promise<string> {

  let token =
    await loadToken();

  if (!token) {
    throw new Error(
      "Spotify ainda não está autenticado. Abre /spotify/login."
    );
  }

  /*
   * Renovar um minuto antes de expirar.
   */
  if (
    Date.now() >=
    token.expires_at - 60_000
  ) {
    token =
      await refreshToken(token);
  }

  return token.access_token;
}

async function spotify(
  path: string,
  init: RequestInit = {}
) {

  const token =
    await accessToken();

  const response =
    await fetch(
      `https://api.spotify.com/v1${path}`,
      {
        ...init,

        headers: {
          authorization:
            `Bearer ${token}`,

          ...(init.body
            ? {
                "content-type":
                  "application/json"
              }
            : {}),

          ...(init.headers ?? {})
        }
      }
    );

  if (
    response.status === 204
  ) {
    return {
      status: 204,
      data: null
    };
  }

  const text =
    await response.text();

  let data: any = null;

  if (text) {
    try {
      data =
        JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      `Spotify API HTTP ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return {
    status:
      response.status,

    data
  };
}

function buildSearchQuery(
  input: string
) {

  const match =
    input.match(
      /^\s*(.+?)\s+[–—-]\s+(.+?)\s*$/
    );

  if (!match) {
    return input.trim();
  }

  const artist =
    match[1].trim();

  const track =
    match[2].trim();

  return (
    `track:${track} artist:${artist}`
  );
}

async function searchTrack(
  query: string
) {

  const spotifyQuery =
    buildSearchQuery(query);

  const params =
    new URLSearchParams({
      q: spotifyQuery,
      type: "track",
      limit: "10"
    });

  const {
    data
  } =
    await spotify(
      `/search?${params.toString()}`
    );

  const tracks =
    data?.tracks?.items ??
    [];

  return tracks.map(
    (track: any) => ({
      id:
        track.id,

      uri:
        track.uri,

      title:
        track.name,

      artist:
        (track.artists ?? [])
          .map(
            (artist: any) =>
              artist.name
          )
          .join(", "),

      album:
        track.album?.name ??
        null,

      durationMs:
        track.duration_ms,

      explicit:
        track.explicit,

      artwork:
        track.album
          ?.images?.[0]
          ?.url ??
        null
    })
  );
}

const server =
  createServer(
    async (
      req,
      res
    ) => {

      try {

        const url =
          new URL(
            req.url ?? "/",
            `http://${HOST}:${PORT}`
          );

        if (
          req.method === "GET" &&
          url.pathname === "/health"
        ) {

          const token =
            await loadToken();

          return sendJson(
            res,
            200,
            {
              ok: true,
              service:
                "roomwave-spotify-control",

              authenticated:
                Boolean(token),

              expiresAt:
                token
                  ? new Date(
                      token.expires_at
                    ).toISOString()
                  : null
            }
          );
        }

        if (
          req.method === "GET" &&
          url.pathname === "/login"
        ) {

          const state =
            randomBytes(24)
              .toString("hex");

          await writeFile(
            STATE_FILE,
            state,
            {
              mode: 0o600
            }
          );

          const params =
            new URLSearchParams({
              client_id:
                CLIENT_ID,

              response_type:
                "code",

              redirect_uri:
                REDIRECT_URI,

              state,

              scope:
                SCOPES
            });

          res.writeHead(
            302,
            {
              location:
                `https://accounts.spotify.com/authorize?${params.toString()}`
            }
          );

          return res.end();
        }

        if (
          req.method === "GET" &&
          url.pathname === "/callback"
        ) {

          const error =
            url.searchParams
              .get("error");

          if (error) {
            return sendText(
              res,
              400,
              `Spotify recusou autorização: ${error}`
            );
          }

          const code =
            url.searchParams
              .get("code");

          const state =
            url.searchParams
              .get("state");

          if (
            !code ||
            !state
          ) {
            return sendText(
              res,
              400,
              "Callback Spotify incompleto."
            );
          }

          const expected =
            (
              await readFile(
                STATE_FILE,
                "utf8"
              )
            ).trim();

          if (
            state !== expected
          ) {
            return sendText(
              res,
              403,
              "OAuth state inválido."
            );
          }

          await exchangeCode(code);

          await unlink(
            STATE_FILE
          ).catch(() => {});

          return sendText(
            res,
            200,
            "✅ Spotify ligado ao RoomWave. Podes fechar esta página."
          );
        }

        if (
          req.method === "GET" &&
          url.pathname === "/search"
        ) {

          const q =
            url.searchParams
              .get("q")
              ?.trim();

          if (!q) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  "q é obrigatório"
              }
            );
          }

          return sendJson(
            res,
            200,
            {
              ok: true,
              query: q,
              tracks:
                await searchTrack(q)
            }
          );
        }

        if (
          req.method === "GET" &&
          url.pathname === "/devices"
        ) {

          const {
            data
          } =
            await spotify(
              "/me/player/devices"
            );

          return sendJson(
            res,
            200,
            {
              ok: true,
              devices:
                data.devices ?? []
            }
          );
        }

        if (
          req.method === "GET" &&
          url.pathname === "/now"
        ) {

          const {
            data
          } =
            await spotify(
              "/me/player"
            );

          return sendJson(
            res,
            200,
            {
              ok: true,
              playback:
                data
            }
          );
        }

        if (
          req.method === "POST" &&
          url.pathname === "/play"
        ) {

          const body =
            await readBody(req);

          if (
            typeof body.uri !==
              "string" ||
            !body.uri.startsWith(
              "spotify:track:"
            )
          ) {

            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  "uri Spotify inválido"
              }
            );
          }

          const params =
            body.deviceId
              ? `?device_id=${encodeURIComponent(body.deviceId)}`
              : "";

          await spotify(
            `/me/player/play${params}`,
            {
              method: "PUT",

              body:
                JSON.stringify({
                  uris: [
                    body.uri
                  ]
                })
            }
          );

          return sendJson(
            res,
            200,
            {
              ok: true,
              uri:
                body.uri
            }
          );
        }

        if (
          req.method === "POST" &&
          url.pathname === "/pause"
        ) {

          await spotify(
            "/me/player/pause",
            {
              method: "PUT"
            }
          );

          return sendJson(
            res,
            200,
            {
              ok: true,
              state:
                "PAUSED"
            }
          );
        }

        if (
          req.method === "POST" &&
          url.pathname === "/resume"
        ) {

          await spotify(
            "/me/player/play",
            {
              method: "PUT"
            }
          );

          return sendJson(
            res,
            200,
            {
              ok: true,
              state:
                "PLAYING"
            }
          );
        }

        if (
          req.method === "POST" &&
          url.pathname === "/next"
        ) {

          await spotify(
            "/me/player/next",
            {
              method: "POST"
            }
          );

          return sendJson(
            res,
            200,
            {
              ok: true
            }
          );
        }

        return sendJson(
          res,
          404,
          {
            ok: false,
            error:
              "not_found"
          }
        );

      } catch (error) {

        console.error(
          "❌ Spotify Control:",
          error
        );

        return sendJson(
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

server.listen(
  PORT,
  HOST,
  () => {

    console.log(
      ""
    );

    console.log(
      "================================="
    );

    console.log(
      "   🎵 ROOMWAVE SPOTIFY CONTROL"
    );

    console.log(
      "================================="
    );

    console.log(
      `Local: http://${HOST}:${PORT}`
    );

    console.log(
      "GET  /health"
    );

    console.log(
      "GET  /login"
    );

    console.log(
      "GET  /callback"
    );

    console.log(
      "GET  /search?q="
    );

    console.log(
      "GET  /devices"
    );

    console.log(
      "GET  /now"
    );

    console.log(
      "POST /play"
    );

    console.log(
      "POST /pause"
    );

    console.log(
      "POST /resume"
    );

    console.log(
      "POST /next"
    );

    console.log(
      "================================="
    );
  }
);
