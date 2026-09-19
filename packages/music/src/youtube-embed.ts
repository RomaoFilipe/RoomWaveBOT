function parseIsoDuration(
  value?: string,
): number | null {
  if (!value) {
    return null;
  }

  const m = value.match(
    /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );

  if (!m) {
    return null;
  }

  return (
    Number(m[1] ?? 0) * 86400 +
    Number(m[2] ?? 0) * 3600 +
    Number(m[3] ?? 0) * 60 +
    Number(m[4] ?? 0)
  );
}

function normalize(
  value: string,
) {
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
    .trim();
}

function score(
  query: string,
  title: string,
  channel: string,
) {
  const q =
    normalize(query);

  const candidate =
    normalize(
      `${channel} ${title}`,
    );

  const tokens =
    q.split(/\s+/)
      .filter(
        token =>
          token.length >= 2,
      );

  let points = 0;

  for (const token of tokens) {
    if (
      candidate.includes(token)
    ) {
      points += 10;
    }
  }

  const unwanted = [
    "cover",
    "reaction",
    "reversed",
    "slowed",
    "reverb",
    "karaoke",
    "tutorial",
    "guitar cover",
  ];

  for (const word of unwanted) {
    if (
      candidate.includes(word) &&
      !q.includes(word)
    ) {
      points -= 25;
    }
  }

  return points;
}

export async function
searchEmbeddableYouTubeTrack(
  query: string,
) {
  const key =
    process.env.YOUTUBE_API_KEY;

  if (!key) {
    throw new Error(
      "YOUTUBE_API_KEY em falta",
    );
  }

  const search =
    new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: "25",
      q: query,

      videoEmbeddable:
        "true",

      videoSyndicated:
        "true",

      key,
    });

  const response =
    await fetch(
      "https://www.googleapis.com/youtube/v3/search?" +
      search.toString(),
    );

  if (!response.ok) {
    throw new Error(
      `YouTube search HTTP ${response.status}`,
    );
  }

  const data: any =
    await response.json();

  const ids =
    (data.items ?? [])
      .map(
        (item: any) =>
          item.id?.videoId,
      )
      .filter(Boolean);

  if (!ids.length) {
    return null;
  }

  const details =
    new URLSearchParams({
      part:
        "snippet,contentDetails,status",

      id:
        ids.join(","),

      key,
    });

  const videoResponse =
    await fetch(
      "https://www.googleapis.com/youtube/v3/videos?" +
      details.toString(),
    );

  if (!videoResponse.ok) {
    throw new Error(
      `YouTube videos HTTP ${videoResponse.status}`,
    );
  }

  const videos: any =
    await videoResponse.json();

  const candidates =
    (videos.items ?? [])
      .map(
        (item: any) => {
          const durationSec =
            parseIsoDuration(
              item.contentDetails
                ?.duration,
            );

          if (
            !durationSec ||
            durationSec < 45 ||
            durationSec > 900
          ) {
            return null;
          }

          if (
            item.status
              ?.embeddable !== true
          ) {
            return null;
          }

          const title =
            item.snippet
              ?.title ??
            "Unknown";

          const channel =
            item.snippet
              ?.channelTitle ??
            "Unknown";

          return {
            provider:
              "youtube" as const,

            externalId:
              item.id,

            title,

            artist:
              channel,

            durationSec,

            artworkUrl:
              item.snippet
                ?.thumbnails
                ?.high
                ?.url ??
              item.snippet
                ?.thumbnails
                ?.medium
                ?.url ??
              null,

            sourceUrl:
              `https://www.youtube.com/watch?v=${item.id}`,

            _score:
              score(
                query,
                title,
                channel,
              ),
          };
        },
      )
      .filter(Boolean)
      .sort(
        (a: any, b: any) =>
          b._score -
          a._score,
      );

  const selected =
    candidates[0];

  if (!selected) {
    return null;
  }

  console.log(
    `[YouTube Embed] selected="${selected.title}" id=${selected.externalId} score=${selected._score}`,
  );

  const {
    _score,
    ...track
  } = selected;

  return track;
}
