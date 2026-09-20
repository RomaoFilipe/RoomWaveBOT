const baseUrl =
  (
    process.env.ROOMWAVE_SOURCE_RESOLVER_URL ??
    "http://127.0.0.1:3230"
  ).replace(/\/+$/, "");

export interface SourceResolverTrack {
  provider: string;

  externalId:
    string |
    null;

  artist: string;
  title: string;

  durationSec:
    number |
    null;
}

interface ResolveResponse {
  ok?: boolean;

  status?:
    | "RESOLVED"
    | "UNAVAILABLE"
    | "SOURCE_UNAVAILABLE";

  source?: {
    type?:
      | "local"
      | "http";

    uri?: string;
  };
}

export async function resolvePlayableUri(
  track: SourceResolverTrack,
): Promise<string | null> {

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      90000,
    );

  try {
    const response =
      await fetch(
        `${baseUrl}/resolve`,
        {
          method:
            "POST",

          headers: {
            "content-type":
              "application/json",
          },

          body:
            JSON.stringify({
              provider:
                track.provider,

              externalId:
                track.externalId,

              artist:
                track.artist,

              title:
                track.title,

              durationSec:
                track.durationSec,
            }),

          signal:
            controller.signal,
        },
      );

    const text =
      await response.text();

    let data:
      ResolveResponse;

    try {
      data =
        text
          ? JSON.parse(text)
          : {};
    } catch {
      throw new Error(
        `Source Resolver devolveu JSON inválido: HTTP ${response.status}`,
      );
    }

    /*
     * UNAVAILABLE é uma resposta normal.
     * Significa simplesmente:
     * conhecemos a música mas ainda não
     * temos uma fonte autorizada.
     */
    if (
      response.status === 404 &&
      data.status ===
        "UNAVAILABLE"
    ) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `Source Resolver HTTP ${response.status}: ${text}`,
      );
    }

    if (
      data.status !==
        "RESOLVED" ||
      typeof data.source?.uri !==
        "string"
    ) {
      return null;
    }

    return data.source.uri;

  } finally {
    clearTimeout(timer);
  }
}
