import type {
  MusicTrack,
} from "./types.js";

interface AudiusArtwork {
  "150x150"?: string;
  "480x480"?: string;
  "1000x1000"?: string;
}

interface AudiusUser {
  name?: string;
  handle?: string;
}

interface AudiusTrack {
  id?: string;
  title?: string;
  duration?: number;
  artwork?: AudiusArtwork | null;
  user?: AudiusUser | null;
}

interface AudiusSearchResponse {
  data?: AudiusTrack[];
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

function tokens(
  value: string,
): string[] {

  const ignored =
    new Set([
      "a",
      "an",
      "the",
      "and",
      "of",
      "on",
      "in",
      "to",
      "de",
      "da",
      "do",
      "e",
      "ft",
      "feat",
    ]);

  const all =
    normalize(value)
      .split(/\s+/)
      .filter(Boolean);

  const filtered =
    all.filter(
      token =>
        token.length >= 2 &&
        !ignored.has(token),
    );

  return filtered.length
    ? filtered
    : all;
}

function coverage(
  wanted: string[],
  candidate: string,
): number {

  if (!wanted.length) {
    return 1;
  }

  const normalizedCandidate =
    normalize(candidate);

  let matched = 0;

  for (
    const token of wanted
  ) {

    if (
      normalizedCandidate.includes(
        token,
      )
    ) {
      matched++;
    }
  }

  return (
    matched /
    wanted.length
  );
}

function parseArtistTitle(
  query: string,
): {
  artist: string;
  title: string;
} | null {

  const match =
    query.match(
      /^\s*(.+?)\s+[–—-]\s+(.+?)\s*$/,
    );

  if (!match) {
    return null;
  }

  return {
    artist:
      match[1].trim(),

    title:
      match[2].trim(),
  };
}

function candidateIsRelevant(
  query: string,
  track: AudiusTrack,
): boolean {

  const title =
    track.title ?? "";

  const artist =
    track.user?.name ??
    track.user?.handle ??
    "";

  const explicit =
    parseArtistTitle(
      query,
    );

  /*
   * Quando o utilizador escreve:
   *
   * Ghost - Mary On A Cross
   *
   * exigimos correspondência forte
   * separadamente no artista e título.
   */
  if (explicit) {

    const artistCoverage =
      coverage(
        tokens(
          explicit.artist,
        ),
        artist,
      );

    const titleCoverage =
      coverage(
        tokens(
          explicit.title,
        ),
        title,
      );

    return (
      artistCoverage >= 0.8 &&
      titleCoverage >= 0.8
    );
  }

  /*
   * Pesquisa normal:
   *
   * mary on a cross
   *
   * Todos os termos importantes têm de
   * estar presentes no artista + título.
   */
  const wanted =
    tokens(
      query,
    );

  const combined =
    `${artist} ${title}`;

  const matchCoverage =
    coverage(
      wanted,
      combined,
    );

  if (
    wanted.length <= 3
  ) {

    return (
      matchCoverage === 1
    );
  }

  return (
    matchCoverage >= 0.75
  );
}

function scoreTrack(
  query: string,
  track: AudiusTrack,
): number {

  const q =
    normalize(query);

  const title =
    normalize(
      track.title ?? "",
    );

  const artist =
    normalize(
      track.user?.name ??
      track.user?.handle ??
      "",
    );

  const combined =
    `${artist} ${title}`.trim();

  let score = 0;

  const explicit =
    parseArtistTitle(
      query,
    );

  if (explicit) {

    const wantedArtist =
      normalize(
        explicit.artist,
      );

    const wantedTitle =
      normalize(
        explicit.title,
      );

    if (
      artist ===
      wantedArtist
    ) {
      score += 150;
    }

    if (
      title ===
      wantedTitle
    ) {
      score += 200;
    }

    if (
      artist.includes(
        wantedArtist,
      )
    ) {
      score += 80;
    }

    if (
      title.includes(
        wantedTitle,
      )
    ) {
      score += 100;
    }

  } else {

    if (
      title === q
    ) {
      score += 200;
    }

    if (
      title.includes(q)
    ) {
      score += 100;
    }

    if (
      combined.includes(q)
    ) {
      score += 60;
    }
  }

  for (
    const token of
      tokens(query)
  ) {

    if (
      title.includes(token)
    ) {
      score += 20;
    }

    if (
      artist.includes(token)
    ) {
      score += 12;
    }
  }

  const unwanted = [
    "cover",
    "remix",
    "sped up",
    "slowed",
    "reverb",
    "nightcore",
    "karaoke",
    "instrumental",
  ];

  for (
    const term of unwanted
  ) {

    if (
      combined.includes(term) &&
      !q.includes(term)
    ) {
      score -= 80;
    }
  }

  if (
    typeof track.duration ===
      "number" &&
    track.duration >= 60 &&
    track.duration <= 600
  ) {
    score += 5;
  }

  return score;
}

export async function searchAudiusTrack(
  query: string,
): Promise<MusicTrack | null> {

  const value =
    query.trim();

  if (!value) {
    return null;
  }

  const params =
    new URLSearchParams({
      query:
        value,

      limit:
        "20",
    });

  const response =
    await fetch(
      `https://api.audius.co/v1/tracks/search?${params.toString()}`,
      {
        headers: {
          accept:
            "application/json",
        },

        signal:
          AbortSignal.timeout(
            15000,
          ),
      },
    );

  if (!response.ok) {

    throw new Error(
      `Audius search HTTP ${response.status}`,
    );
  }

  const payload =
    (await response.json()) as AudiusSearchResponse;

  const candidates =
    (payload.data ?? [])
      .filter(
        track =>
          typeof track.id ===
            "string" &&
          track.id.length > 0 &&
          typeof track.title ===
            "string" &&
          track.title.length > 0,
      )
      .filter(
        track =>
          candidateIsRelevant(
            value,
            track,
          ),
      )
      .map(
        track => ({
          track,

          score:
            scoreTrack(
              value,
              track,
            ),
        }),
      )
      .sort(
        (a, b) =>
          b.score -
          a.score,
      );

  const selected =
    candidates[0];

  if (!selected) {

    console.log(
      `❌ Audius: nenhuma correspondência suficientemente próxima para "${value}"`,
    );

    return null;
  }

  const track =
    selected.track;

  const id =
    track.id!;

  const artist =
    track.user?.name ??
    track.user?.handle ??
    "Audius";

  const artwork =
    track.artwork?.["1000x1000"] ??
    track.artwork?.["480x480"] ??
    track.artwork?.["150x150"] ??
    null;

  const result:
    MusicTrack = {

      provider:
        "audius",

      externalId:
        id,

      title:
        track.title!,

      artist,

      durationSec:
        typeof track.duration ===
          "number"
          ? Math.round(
              track.duration,
            )
          : null,

      artworkUrl:
        artwork,

      sourceUrl:
        `https://api.audius.co/v1/tracks/${encodeURIComponent(id)}/stream`,
    };

  console.log(
    `🎵 Audius MATCH: ${result.artist} - ${result.title}`,
  );

  console.log(
    `🆔 Audius ID: ${result.externalId}`,
  );

  console.log(
    `🎯 Score: ${selected.score}`,
  );

  return result;
}
