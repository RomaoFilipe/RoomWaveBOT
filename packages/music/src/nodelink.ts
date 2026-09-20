import {
  readFileSync,
} from "node:fs";

import type {
  MusicTrack,
} from "./types.js";

interface NodeLinkTrackInfo {
  identifier?: string;
  title?: string;
  author?: string;
  length?: number;
  uri?: string;
  artworkUrl?: string | null;
  sourceName?: string;
  isrc?: string | null;
}

interface NodeLinkEncodedTrack {
  encoded?: string;
  track?: string;
  info?: NodeLinkTrackInfo;
}

interface NodeLinkResponse {
  loadType?: string;
  data?:
    | NodeLinkEncodedTrack[]
    | {
        tracks?: NodeLinkEncodedTrack[];
        info?: Record<string, unknown>;
      }
    | NodeLinkEncodedTrack
    | null;
}

const NODELINK_URL =
  (
    process.env.NODELINK_URL ??
    "http://127.0.0.1:2334"
  ).replace(/\/+$/, "");

const NODELINK_PASSWORD_FILE =
  process.env.NODELINK_PASSWORD_FILE ??
  "/home/ubuntu/roomwave/.data/nodelink/password";

function getPassword(): string {
  const env =
    process.env.NODELINK_PASSWORD?.trim();

  if (env) {
    return env;
  }

  return readFileSync(
    NODELINK_PASSWORD_FILE,
    "utf8",
  ).trim();
}

function normalizeText(
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
      /&/g,
      " and ",
    )
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

function tokens(
  value: string,
): string[] {
  const ignored =
    new Set([
      "the",
      "and",
      "of",
      "a",
      "an",
      "de",
      "da",
      "do",
      "dos",
      "das",
      "e",
      "feat",
      "ft",
    ]);

  return normalizeText(value)
    .split(" ")
    .filter(
      (token) =>
        token.length > 1 &&
        !ignored.has(token),
    );
}

function queryRequestsVariant(
  query: string,
  variant: string,
): boolean {
  return normalizeText(query)
    .includes(
      normalizeText(variant),
    );
}

function variantPenalty(
  query: string,
  title: string,
): number {
  const normalizedTitle =
    normalizeText(title);

  const variants = [
    "slowed",
    "reverb",
    "slowed reverb",
    "live",
    "remix",
    "nightcore",
    "sped up",
    "speed up",
    "cover",
    "karaoke",
    "instrumental",
    "acoustic",
    "8d",
    "edit",
  ];

  let penalty = 0;

  for (const variant of variants) {
    if (
      normalizedTitle.includes(
        normalizeText(variant),
      ) &&
      !queryRequestsVariant(
        query,
        variant,
      )
    ) {
      penalty += 45;
    }
  }

  return penalty;
}

function cleanTitle(
  title: string,
): string {
  return title
    .replace(
      /\s*[\[(](official\s+(music\s+)?video|official\s+audio|audio|lyrics?|lyric\s+video|visualizer)[\])]\s*/gi,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function scoreTrack(
  query: string,
  track: NodeLinkEncodedTrack,
): number {
  const info =
    track.info ?? {};

  const title =
    info.title ?? "";

  const artist =
    info.author ?? "";

  const combined =
    normalizeText(
      `${artist} ${cleanTitle(title)}`,
    );

  const queryNormalized =
    normalizeText(query);

  const queryTokens =
    tokens(query);

  let score = 0;

  if (!title) {
    return -10000;
  }

  /*
   * Todos os termos pedidos contam.
   */
  for (
    const token of queryTokens
  ) {
    if (
      combined.includes(token)
    ) {
      score += 12;
    } else {
      score -= 25;
    }
  }

  /*
   * Correspondência global.
   */
  if (
    combined.includes(
      queryNormalized,
    )
  ) {
    score += 55;
  }

  /*
   * YouTube Music tem prioridade para música.
   */
  if (
    info.sourceName ===
      "ytmusic"
  ) {
    score += 35;
  }

  /*
   * Preferir duração típica de música.
   */
  const durationSec =
    typeof info.length === "number"
      ? info.length / 1000
      : 0;

  if (
    durationSec >= 90 &&
    durationSec <= 600
  ) {
    score += 10;
  }

  /*
   * Penalizar versões alternativas quando
   * não foram pedidas explicitamente.
   */
  score -=
    variantPenalty(
      query,
      title,
    );

  return score;
}

function extractTracks(
  response: NodeLinkResponse,
): NodeLinkEncodedTrack[] {
  const data =
    response.data;

  if (
    Array.isArray(data)
  ) {
    return data;
  }

  if (
    data &&
    typeof data === "object" &&
    "tracks" in data &&
    Array.isArray(data.tracks)
  ) {
    return data.tracks;
  }

  if (
    data &&
    typeof data === "object" &&
    "info" in data
  ) {
    return [
      data as NodeLinkEncodedTrack,
    ];
  }

  return [];
}

async function loadTracks(
  identifier: string,
): Promise<NodeLinkEncodedTrack[]> {
  const url =
    new URL(
      `${NODELINK_URL}/v4/loadtracks`,
    );

  url.searchParams.set(
    "identifier",
    identifier,
  );

  const response =
    await fetch(
      url,
      {
        headers: {
          Authorization:
            getPassword(),
        },

        signal:
          AbortSignal.timeout(
            12_000,
          ),
      },
    );

  if (!response.ok) {
    throw new Error(
      `NODELINK_HTTP_${response.status}`,
    );
  }

  const payload =
    (await response.json()) as NodeLinkResponse;

  if (
    payload.loadType ===
      "error"
  ) {
    throw new Error(
      "NODELINK_LOAD_ERROR",
    );
  }

  return extractTracks(
    payload,
  );
}

function extractYouTubeVideoId(
  query: string,
): string | null {
  try {
    const url =
      new URL(query);

    const host =
      url.hostname.toLowerCase();

    if (
      host === "youtu.be" ||
      host === "www.youtu.be"
    ) {
      const id =
        url.pathname
          .split("/")
          .filter(Boolean)[0];

      return id &&
        /^[A-Za-z0-9_-]{11}$/.test(id)
        ? id
        : null;
    }

    if (
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "music.youtube.com"
    ) {
      const id =
        url.searchParams.get("v");

      return id &&
        /^[A-Za-z0-9_-]{11}$/.test(id)
        ? id
        : null;
    }

    return null;

  } catch {
    return null;
  }
}

function toMusicTrack(
  track: NodeLinkEncodedTrack,
): MusicTrack | null {
  const info =
    track.info;

  if (
    !info?.identifier ||
    !info.title
  ) {
    return null;
  }

  const artist =
    info.author?.trim() ||
    "Unknown";

  const sourceUrl =
    info.uri ??
    `https://www.youtube.com/watch?v=${info.identifier}`;

  return {
    provider:
      "youtube",

    externalId:
      info.identifier,

    title:
      cleanTitle(
        info.title,
      ),

    artist,

    durationSec:
      typeof info.length ===
        "number"
        ? Math.round(
            info.length /
            1000,
          )
        : null,

    artworkUrl:
      info.artworkUrl ??
      `https://i.ytimg.com/vi/${info.identifier}/hqdefault.jpg`,

    sourceUrl,
  };
}

async function bestSearchResult(
  query: string,
  prefix:
    | "ytmsearch"
    | "ytsearch",
): Promise<MusicTrack | null> {

  const results =
    await loadTracks(
      `${prefix}:${query}`,
    );

  if (
    results.length === 0
  ) {
    return null;
  }

  const ranked =
    results
      .map(
        (track) => ({
          track,
          score:
            scoreTrack(
              query,
              track,
            ),
        }),
      )
      .sort(
        (a, b) =>
          b.score -
          a.score,
      );

  const best =
    ranked[0];

  if (
    !best ||
    best.score < 10
  ) {
    return null;
  }

  return toMusicTrack(
    best.track,
  );
}

export async function searchNodeLinkTrack(
  query: string,
): Promise<MusicTrack | null> {

  const trimmed =
    query.trim();

  if (!trimmed) {
    return null;
  }

  /*
   * Link direto de YouTube/YouTube Music.
   *
   * Para catálogo/metadata usamos pesquisa pelo
   * videoId em vez de pedir resolução direta
   * do URL ao NodeLink.
   */
  const videoId =
    extractYouTubeVideoId(
      trimmed,
    );

  if (videoId) {
    const tracks =
      await loadTracks(
        `ytsearch:${videoId}`,
      );

    const exact =
      tracks.find(
        (track) =>
          track.info?.identifier ===
          videoId,
      );

    if (exact) {
      return toMusicTrack(
        exact,
      );
    }

    return null;
  }

  /*
   * Primeiro YouTube Music.
   */
  const music =
    await bestSearchResult(
      trimmed,
      "ytmsearch",
    );

  if (music) {
    return music;
  }

  /*
   * Fallback para YouTube normal.
   */
  return bestSearchResult(
    trimmed,
    "ytsearch",
  );
}
