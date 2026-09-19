import {
  execFile,
} from "node:child_process";

import {
  promisify,
} from "node:util";

const execFileAsync =
  promisify(execFile);

export interface YTMusicResult {
  provider: "youtube";
  type: "songs" | "videos";
  videoId: string;
  externalId: string;
  title: string;
  artist: string;
  duration: string;
  durationSec: number;
  url: string;
  score: number;
}

interface ResolverResponse {
  ok: boolean;
  query?: string;
  best?: YTMusicResult;
  results?: YTMusicResult[];
  error?: string;
}

export async function searchYTMusic(
  query: string,
): Promise<YTMusicResult | null> {

  const value =
    query.trim();

  if (!value) {
    return null;
  }

  const python =
    process.env.YTMUSIC_PYTHON ??
    "/home/ubuntu/roomwave/tools/ytmusic-test/.venv/bin/python";

  const resolver =
    process.env.YTMUSIC_RESOLVER ??
    "/home/ubuntu/roomwave/tools/ytmusic-test/resolver.py";

  try {
    const {
      stdout,
    } = await execFileAsync(
      python,
      [
        resolver,
        value,
      ],
      {
        timeout: 20_000,
        maxBuffer:
          1024 * 1024,
        env:
          process.env,
      },
    );

    const response =
      JSON.parse(
        stdout.trim(),
      ) as ResolverResponse;

    if (
      !response.ok ||
      !response.best
    ) {
      console.warn(
        `⚠️ YTMusic: ${
          response.error ??
          "sem resultados"
        }`,
      );

      return null;
    }

    const track =
      response.best;

    console.log(
      `🎵 YTMusic: ${track.artist} - ${track.title}`,
    );

    console.log(
      `🎬 videoId: ${track.videoId}`,
    );

    console.log(
      `🎯 score: ${track.score}`,
    );

    return track;

  } catch (error) {

    console.error(
      "⚠️ ytmusicapi falhou:",
      error instanceof Error
        ? error.message
        : error,
    );

    return null;
  }
}
