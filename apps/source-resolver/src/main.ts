import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  access,
  readFile,
} from "node:fs/promises";

import {
  constants,
} from "node:fs";

import {
  resolve,
  sep,
} from "node:path";

import {
  downloadToEphemeralCache,
} from "./ephemeral-cache.js";
import { resolveYouTube } from "./nodelink.js";
import { deleteCachedMedia } from "./ephemeral-cache.js";

const HOST =
  process.env.ROOMWAVE_SOURCE_RESOLVER_HOST ??
  "127.0.0.1";

const PORT =
  Number(
    process.env.ROOMWAVE_SOURCE_RESOLVER_PORT ??
    "3230",
  );

const AUDIO_DIR =
  resolve(
    process.env.ROOMWAVE_AUDIO_DIR ??
    "/home/ubuntu/roomwave/.data/audio",
  );

const CATALOG_FILE =
  process.env.ROOMWAVE_SOURCE_CATALOG ??
  "/home/ubuntu/roomwave/.data/source-catalog.json";

type ResolveRequest = {
  provider?: string;
  externalId?: string;

  isrc?: string | null;

  artist: string;
  title: string;

  durationSec?:
    | number
    | null;
};

type CatalogEntry = {
  id: string;

  enabled?: boolean;
  authorized?: boolean;

  match: {
    provider?: string;
    externalId?: string;
    isrc?: string;

    artist?: string;
    title?: string;

    durationSec?: number;
  };

  source:
    | {
        type: "local";
        path: string;
      }
    | {
        type: "http";
        url: string;
      };
};

function sendJson(
  res: ServerResponse,
  status: number,
  value: unknown,
) {
  res.writeHead(
    status,
    {
      "content-type":
        "application/json; charset=utf-8",

      "cache-control":
        "no-store",
    },
  );

  res.end(
    JSON.stringify(
      value,
      null,
      2,
    ),
  );
}

function normalize(
  value: string,
): string {
  return value
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function normalizeIsrc(
  value:
    | string
    | null
    | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const result =
    value
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/g,
        "",
      );

  return result || null;
}

async function readBody(
  req: IncomingMessage,
): Promise<unknown> {
  let body = "";

  for await (
    const chunk of req
  ) {
    body += chunk.toString();

    if (
      body.length >
      64 * 1024
    ) {
      throw new Error(
        "BODY_TOO_LARGE",
      );
    }
  }

  if (!body.trim()) {
    return {};
  }

  return JSON.parse(body);
}

async function loadCatalog():
  Promise<CatalogEntry[]> {
  try {
    const raw =
      await readFile(
        CATALOG_FILE,
        "utf8",
      );

    const parsed =
      JSON.parse(raw);

    if (
      !Array.isArray(parsed)
    ) {
      return [];
    }

    return parsed as CatalogEntry[];

  } catch (error) {
    console.error(
      "Catalog error:",
      error,
    );

    return [];
  }
}

function scoreEntry(
  request: ResolveRequest,
  entry: CatalogEntry,
): number | null {
  if (
    entry.enabled === false ||
    entry.authorized !== true
  ) {
    return null;
  }

  const match =
    entry.match;

  let score = 0;

  if (match.provider) {
    if (
      normalize(
        request.provider ?? "",
      ) !==
      normalize(
        match.provider,
      )
    ) {
      return null;
    }

    score += 100;
  }

  if (match.externalId) {
    if (
      request.externalId !==
      match.externalId
    ) {
      return null;
    }

    score += 1000;
  }

  if (match.isrc) {
    const wanted =
      normalizeIsrc(
        match.isrc,
      );

    const actual =
      normalizeIsrc(
        request.isrc,
      );

    if (
      !wanted ||
      !actual ||
      wanted !== actual
    ) {
      return null;
    }

    score += 900;
  }

  if (match.artist) {
    if (
      normalize(
        request.artist,
      ) !==
      normalize(
        match.artist,
      )
    ) {
      return null;
    }

    score += 300;
  }

  if (match.title) {
    if (
      normalize(
        request.title,
      ) !==
      normalize(
        match.title,
      )
    ) {
      return null;
    }

    score += 400;
  }

  if (
    typeof match.durationSec ===
      "number"
  ) {
    if (
      typeof request.durationSec !==
        "number"
    ) {
      return null;
    }

    const difference =
      Math.abs(
        request.durationSec -
        match.durationSec,
      );

    if (
      difference > 7
    ) {
      return null;
    }

    score +=
      100 -
      Math.round(
        difference * 10,
      );
  }

  return score;
}

async function resolveSource(
  entry: CatalogEntry,
) {
  if (
    entry.source.type ===
      "local"
  ) {
    const candidate =
      resolve(
        AUDIO_DIR,
        entry.source.path,
      );

    const insideAudioDir =
      candidate === AUDIO_DIR ||
      candidate.startsWith(
        AUDIO_DIR + sep,
      );

    if (!insideAudioDir) {
      throw new Error(
        "INVALID_LOCAL_PATH",
      );
    }

    await access(
      candidate,
      constants.R_OK,
    );

    return {
      type: "local",
      uri: candidate,
    };
  }

  const url =
    new URL(
      entry.source.url,
    );

  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    throw new Error(
      "INVALID_HTTP_SOURCE",
    );
  }

  const cached =
    await downloadToEphemeralCache(
      url.toString(),
    );

  console.log(
    `⬇️ Ephemeral cache: ${cached.path}`,
  );

  return {
    type: "local",
    uri: cached.path,
    ephemeral: true,
  };
}

async function handleResolve(
  req: IncomingMessage,
  res: ServerResponse,
) {
  let body: unknown;

  try {
    body =
      await readBody(req);
  } catch {
    return sendJson(
      res,
      400,
      {
        ok: false,
        error:
          "INVALID_JSON",
      },
    );
  }

  if (
    !body ||
    typeof body !== "object"
  ) {
    return sendJson(
      res,
      400,
      {
        ok: false,
        error:
          "INVALID_REQUEST",
      },
    );
  }

  const candidate =
    body as Partial<ResolveRequest>;

  if (
    typeof candidate.artist !==
      "string" ||
    typeof candidate.title !==
      "string"
  ) {
    return sendJson(
      res,
      400,
      {
        ok: false,
        error:
          "ARTIST_AND_TITLE_REQUIRED",
      },
    );
  }

  const request:
    ResolveRequest = {
      provider:
        candidate.provider,

      externalId:
        candidate.externalId,

      isrc:
        candidate.isrc,

      artist:
        candidate.artist,

      title:
        candidate.title,

      durationSec:
        candidate.durationSec,
    };

  if (request.provider === "youtube") {
    if (typeof request.externalId !== "string" || !/^[a-zA-Z0-9_-]{11}$/.test(request.externalId)) {
      return sendJson(res, 400, { ok: false, error: "INVALID_YOUTUBE_ID" });
    }
    try {
      const source = await resolveYouTube(request.externalId);
      if (res.destroyed) {
        await deleteCachedMedia(source.uri);
        return;
      }
      return sendJson(res, 200, { ok: true, status: "RESOLVED", source });
    } catch {
      console.error("YouTube source unavailable:", request.externalId);
      return sendJson(res, 503, { ok: false, status: "SOURCE_UNAVAILABLE" });
    }
  }

  const catalog =
    await loadCatalog();

  const ranked =
    catalog
      .map(
        (entry) => ({
          entry,
          score:
            scoreEntry(
              request,
              entry,
            ),
        }),
      )
      .filter(
        (
          value,
        ): value is {
          entry: CatalogEntry;
          score: number;
        } =>
          value.score !==
          null,
      )
      .sort(
        (a, b) =>
          b.score -
          a.score,
      );

  const best =
    ranked[0];

  if (!best) {
    return sendJson(
      res,
      404,
      {
        ok: false,
        status:
          "UNAVAILABLE",

        track: {
          provider:
            request.provider ??
            null,

          externalId:
            request.externalId ??
            null,

          artist:
            request.artist,

          title:
            request.title,

          durationSec:
            request.durationSec ??
            null,

          isrc:
            request.isrc ??
            null,
        },
      },
    );
  }

  try {
    const source =
      await resolveSource(
        best.entry,
      );

    return sendJson(
      res,
      200,
      {
        ok: true,

        status:
          "RESOLVED",

        match: {
          catalogId:
            best.entry.id,

          score:
            best.score,
        },

        source,
      },
    );

  } catch (error) {
    console.error(
      "Source validation error:",
      error,
    );

    return sendJson(
      res,
      503,
      {
        ok: false,
        status:
          "SOURCE_UNAVAILABLE",
      },
    );
  }
}

const server =
  createServer(
    async (
      req,
      res,
    ) => {
      const method =
        req.method ??
        "GET";

      const url =
        new URL(
          req.url ?? "/",
          `http://${req.headers.host ?? "localhost"}`,
        );

      if (
        method === "GET" &&
        url.pathname ===
          "/health"
      ) {
        return sendJson(
          res,
          200,
          {
            ok: true,
            service:
              "roomwave-source-resolver",
          },
        );
      }

      if (
        method === "POST" &&
        url.pathname ===
          "/resolve"
      ) {
        return handleResolve(
          req,
          res,
        );
      }

      return sendJson(
        res,
        404,
        {
          ok: false,
          error:
            "NOT_FOUND",
        },
      );
    },
  );

server.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `🔎 RoomWave Source Resolver: http://${HOST}:${PORT}`,
    );

    console.log(
      `📚 Catalog: ${CATALOG_FILE}`,
    );

    console.log(
      `🎵 Audio directory: ${AUDIO_DIR}`,
    );
  },
);
