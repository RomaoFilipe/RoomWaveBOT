const baseUrl =
  (
    process.env.ROOMWAVE_BROWSER_PLAYER_URL ??
    "http://127.0.0.1:3200"
  ).replace(/\/+$/, "");

const authorizedIds =
  new Set(
    (
      process.env.ROOMWAVE_AUTHORIZED_YOUTUBE_IDS ??
      ""
    )
      .split(",")
      .map((value) => value.trim())
      .filter((value) =>
        /^[A-Za-z0-9_-]{11}$/.test(value),
      ),
  );

export interface BrowserPlayerStatus {
  ok?: boolean;
  videoId?: string | null;
  state?: string;
  error?: number | string | null;
  currentTime?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
  timeout?: boolean;
}

export function isAuthorizedYoutubeId(
  videoId: string,
): boolean {
  return authorizedIds.has(videoId);
}

async function request(
  path: string,
  options: RequestInit = {},
  timeoutMs = 15000,
): Promise<BrowserPlayerStatus> {

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs,
    );

  try {
    const response =
      await fetch(
        `${baseUrl}${path}`,
        {
          ...options,
          signal: controller.signal,
        },
      );

    const text =
      await response.text();

    let data:
      BrowserPlayerStatus;

    try {
      data =
        JSON.parse(text);
    } catch {
      throw new Error(
        `Browser Player respondeu HTTP ${response.status} sem JSON válido.`,
      );
    }

    return data;

  } finally {
    clearTimeout(timer);
  }
}

export async function browserPlay(
  videoId: string,
): Promise<BrowserPlayerStatus> {

  if (
    !isAuthorizedYoutubeId(videoId)
  ) {
    return {
      ok: false,
      videoId,
      state: "REJECTED",
      error: "youtube_not_authorized_for_retransmission",
    };
  }

  return request(
    "/play",
    {
      method: "POST",

      headers: {
        "content-type":
          "application/json",
      },

      body:
        JSON.stringify({
          videoId,
        }),
    },
    15000,
  );
}

export async function browserStop():
  Promise<BrowserPlayerStatus> {

  return request(
    "/stop",
    {
      method: "POST",
    },
    5000,
  );
}

export async function browserStatus():
  Promise<BrowserPlayerStatus> {

  return request(
    "/status",
    {},
    5000,
  );
}
