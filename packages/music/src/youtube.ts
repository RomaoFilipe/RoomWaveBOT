import he from "he";
import {
  searchEmbeddableYouTubeTrack,
} from "./youtube-embed.js";
import { searchYTMusic } from "./ytmusic.js";

interface YouTubeSearchResponse {
  items?: Array<{
    id?: {
      videoId?: string;
    };
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: {
        default?: { url?: string };
        medium?: { url?: string };
        high?: { url?: string };
      };
    };
  }>;
}

interface YouTubeVideoResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: {
        default?: { url?: string };
        medium?: { url?: string };
        high?: { url?: string };
      };
    };
    contentDetails?: {
      duration?: string;
    };
  }>;
}

function parseIsoDuration(
  duration?: string,
): number | null {
  if (!duration) {
    return null;
  }

  const match = duration.match(
    /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );

  if (!match) {
    return null;
  }

  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);

  return (
    days * 86400 +
    hours * 3600 +
    minutes * 60 +
    seconds
  );
}

function normalizeText(
  value: string,
): string {
  return he
    .decode(value)
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
    .trim();
}

function queryTokens(
  query: string,
): string[] {
  const ignored =
    new Set([
      "a",
      "o",
      "os",
      "as",
      "de",
      "da",
      "do",
      "das",
      "dos",
      "e",
      "em",
      "no",
      "na",
      "nos",
      "nas",
      "the",
      "and",
      "of",
      "ft",
      "feat",
    ]);

  return normalizeText(query)
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 2 &&
        !ignored.has(token),
    );
}

function wantsLongContent(
  query: string,
): boolean {
  const value =
    normalizeText(query);

  const patterns = [
    /\bfull concert\b/,
    /\bconcert full\b/,
    /\bconcerto completo\b/,
    /\bshow completo\b/,
    /\bfull show\b/,
    /\bfull album\b/,
    /\balbum completo\b/,
    /\bplaylist\b/,
    /\bdj set\b/,
    /\blive set\b/,
    /\bfull set\b/,
    /\bmixtape\b/,
    /\b1 hour\b/,
    /\b2 hour\b/,
    /\b3 hour\b/,
    /\b1 hora\b/,
    /\b2 horas\b/,
    /\b3 horas\b/,
  ];

  return patterns.some(
    (pattern) =>
      pattern.test(value),
  );
}

function cleanDisplayTitle(
  value: string,
): string {
  return he
    .decode(value)
    .replace(
      /\s+/g,
      " ",
    )
    .replace(
      /\s*[\[(](official\s+(music\s+)?video|official\s+audio|audio\s+official|lyrics?|lyric\s+video|visuali[sz]er)[\])]\s*/gi,
      " ",
    )
    .trim();
}

function cleanChannelArtist(
  channel: string,
): string {
  return he
    .decode(channel)
    .replace(
      /\s*-\s*Topic$/i,
      "",
    )
    .replace(
      /VEVO$/i,
      "",
    )
    .trim();
}

function deriveArtistAndTitle(
  rawTitle: string,
  channelTitle: string,
) {
  const cleaned =
    cleanDisplayTitle(rawTitle);

  const dash =
    cleaned.match(
      /^(.+?)\s+[–—-]\s+(.+)$/,
    );

  if (dash) {
    return {
      artist:
        dash[1].trim(),
      title:
        dash[2].trim(),
    };
  }

  return {
    artist:
      cleanChannelArtist(
        channelTitle,
      ) || "Unknown",
    title:
      cleaned,
  };
}

function scoreCandidate(
  query: string,
  title: string,
  channelTitle: string,
  durationSec: number,
): number {
  const normalizedQuery =
    normalizeText(query);

  const normalizedTitle =
    normalizeText(title);

  const normalizedChannel =
    normalizeText(
      channelTitle,
    );

  const tokens =
    queryTokens(query);

  let score = 0;

  /*
   * Correspondência dos termos pedidos.
   */
  for (
    const token of tokens
  ) {
    if (
      normalizedTitle.includes(
        token,
      )
    ) {
      score += 8;
    } else if (
      normalizedChannel.includes(
        token,
      )
    ) {
      score += 3;
    }
  }

  /*
   * Bónus para correspondência bastante
   * próxima do título pesquisado.
   */
  if (
    normalizedTitle.includes(
      normalizedQuery,
    )
  ) {
    score += 25;
  }

  /*
   * Preferência por conteúdo oficial.
   */
  if (
    /\bofficial\b|\bvevo\b|\btopic\b/.test(
      normalizeText(
        `${title} ${channelTitle}`,
      ),
    )
  ) {
    score += 7;
  }

  /*
   * Para música normal, duração típica
   * próxima de 4 minutos recebe vantagem.
   */
  if (!wantsLongContent(query)) {
    const ideal = 240;

    score -= Math.min(
      20,
      Math.abs(
        durationSec - ideal,
      ) / 30,
    );

    /*
     * Penalizar títulos que parecem conteúdo
     * longo, mesmo quando ainda cabem no limite.
     */
    if (
      /\bfull concert\b|\bfull album\b|\bplaylist\b|\bdj set\b|\blive set\b|\bcompilation\b/.test(
        normalizeText(title),
      )
    ) {
      score -= 30;
    }
  }

  /*
   * Resultados típicos indesejados num bot
   * de música.
   */
  if (
    /\breaction\b|\breview\b|\btutorial\b|\binterview\b|\bentrevista\b/.test(
      normalizeText(title),
    )
  ) {
    score -= 40;
  }

  return score;
}

export async function searchYouTubeTrack(
  query: string,
) {

  /*
   * Para o Browser Player:
   * escolher primeiro vídeos que o
   * YouTube permite incorporar e
   * reproduzir fora de youtube.com.
   */
  try {
    const playable =
      await searchEmbeddableYouTubeTrack(
        query,
      );

    if (playable) {
      return playable;
    }
  } catch (error) {
    console.warn(
      "[YouTube Embed] fallback:",
      error instanceof Error
        ? error.message
        : error,
    );
  }


  /*
   * =========================================================
   * ROOMWAVE YTMUSIC
   * =========================================================
   *
   * Primeira tentativa:
   * ytmusicapi.
   *
   * Se falhar ou não devolver uma faixa adequada,
   * continuamos normalmente para a YouTube Data API.
   */

  try {
    const ytmusic =
      await searchYTMusic(
        query,
      );

    if (ytmusic) {
      const longContent =
        wantsLongContent(
          query,
        );

      const minDuration =
        45;

      const maxDuration =
        longContent
          ? 4 * 60 * 60
          : 15 * 60;

      const validDuration =
        ytmusic.durationSec >=
          minDuration &&
        ytmusic.durationSec <=
          maxDuration;

      if (validDuration) {
        console.log(
          `[YTMusic] selected="${ytmusic.artist} - ${ytmusic.title}" duration=${ytmusic.durationSec}s score=${ytmusic.score}`,
        );

        return {
          provider:
            "youtube" as const,

          externalId:
            ytmusic.videoId,

          title:
            ytmusic.title,

          artist:
            ytmusic.artist ||
            "Unknown",

          durationSec:
            ytmusic.durationSec,

          artworkUrl:
            null,

          sourceUrl:
            `https://www.youtube.com/watch?v=${ytmusic.videoId}`,
        };
      }

      console.warn(
        `[YTMusic] Resultado rejeitado por duração: ${ytmusic.durationSec}s`,
      );
    }
  } catch (error) {
    console.warn(
      "[YTMusic] Falhou. A utilizar YouTube Data API:",
      error instanceof Error
        ? error.message
        : error,
    );
  }

  console.log(
    "[YTMusic] fallback -> YouTube Data API",
  );

  const apiKey =
    process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "YOUTUBE_API_KEY não está configurada.",
    );
  }

  const searchUrl =
    new URL(
      "https://www.googleapis.com/youtube/v3/search",
    );

  searchUrl.searchParams.set(
    "part",
    "snippet",
  );

  searchUrl.searchParams.set(
    "type",
    "video",
  );

  /*
   * Procuramos vários candidatos em vez
   * de aceitar cegamente o primeiro.
   */
  searchUrl.searchParams.set(
    "maxResults",
    "10",
  );

  searchUrl.searchParams.set(
    "videoEmbeddable",
    "true",
  );

  searchUrl.searchParams.set(
    "q",
    query,
  );

  searchUrl.searchParams.set(
    "key",
    apiKey,
  );

  const searchResponse =
    await fetch(searchUrl);

  if (!searchResponse.ok) {
    throw new Error(
      `YouTube search failed: ${searchResponse.status} ${searchResponse.statusText}`,
    );
  }

  const searchData =
    (await searchResponse.json()) as YouTubeSearchResponse;

  const ids =
    (searchData.items ?? [])
      .map(
        (item) =>
          item.id?.videoId,
      )
      .filter(
        (
          id,
        ): id is string =>
          Boolean(id),
      );

  if (ids.length === 0) {
    return null;
  }

  /*
   * Uma única chamada para obter duração e
   * metadata de todos os candidatos.
   */
  const videoUrl =
    new URL(
      "https://www.googleapis.com/youtube/v3/videos",
    );

  videoUrl.searchParams.set(
    "part",
    "snippet,contentDetails",
  );

  videoUrl.searchParams.set(
    "id",
    ids.join(","),
  );

  videoUrl.searchParams.set(
    "key",
    apiKey,
  );

  const videoResponse =
    await fetch(videoUrl);

  if (!videoResponse.ok) {
    throw new Error(
      `YouTube video lookup failed: ${videoResponse.status} ${videoResponse.statusText}`,
    );
  }

  const videoData =
    (await videoResponse.json()) as YouTubeVideoResponse;

  const longContent =
    wantsLongContent(query);

  const MIN_DURATION = 45;

  /*
   * Música normal: máximo 15 minutos.
   * Conteúdo explicitamente longo: até 4 horas.
   */
  const MAX_DURATION =
    longContent
      ? 4 * 60 * 60
      : 15 * 60;

  const candidates =
    (videoData.items ?? [])
      .map((item) => {
        const videoId =
          item.id;

        const rawTitle =
          item.snippet
            ?.title ?? "";

        const channelTitle =
          item.snippet
            ?.channelTitle ?? "";

        const durationSec =
          parseIsoDuration(
            item.contentDetails
              ?.duration,
          );

        if (
          !videoId ||
          !rawTitle ||
          durationSec === null
        ) {
          return null;
        }

        if (
          durationSec <
            MIN_DURATION ||
          durationSec >
            MAX_DURATION
        ) {
          return null;
        }

        const metadata =
          deriveArtistAndTitle(
            rawTitle,
            channelTitle,
          );

        const artworkUrl =
          item.snippet
            ?.thumbnails
            ?.high
            ?.url ??
          item.snippet
            ?.thumbnails
            ?.medium
            ?.url ??
          item.snippet
            ?.thumbnails
            ?.default
            ?.url ??
          null;

        return {
          provider:
            "youtube" as const,

          externalId:
            videoId,

          title:
            metadata.title,

          artist:
            metadata.artist,

          durationSec,

          artworkUrl,

          sourceUrl:
            `https://www.youtube.com/watch?v=${videoId}`,

          _score:
            scoreCandidate(
              query,
              rawTitle,
              channelTitle,
              durationSec,
            ),

          _rawTitle:
            rawTitle,

          _channelTitle:
            channelTitle,
        };
      })
      .filter(
        (
          item,
        ): item is NonNullable<
          typeof item
        > =>
          item !== null,
      )
      .sort(
        (a, b) =>
          b._score -
          a._score,
      );

  if (
    candidates.length === 0
  ) {
    throw new Error(
      longContent
        ? "Não encontrei um resultado adequado para essa pesquisa."
        : "Não encontrei uma música adequada entre 45 segundos e 15 minutos.",
    );
  }

  const selected =
    candidates[0];

  console.log(
    `[YouTube] selected="${selected._rawTitle}" duration=${selected.durationSec}s score=${selected._score.toFixed(1)}`,
  );

  return {
    provider:
      selected.provider,

    externalId:
      selected.externalId,

    title:
      selected.title,

    artist:
      selected.artist,

    durationSec:
      selected.durationSec,

    artworkUrl:
      selected.artworkUrl,

    sourceUrl:
      selected.sourceUrl,
  };
}
