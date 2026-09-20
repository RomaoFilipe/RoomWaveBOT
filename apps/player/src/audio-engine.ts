const baseUrl =
  (
    process.env.ROOMWAVE_AUDIO_ENGINE_URL ??
    "http://127.0.0.1:3210"
  ).replace(/\/+$/, "");

export interface AudioEngineTrack {
  id: string;
  title: string;
  source: string;
  requestedAt: string;
}

export interface AudioEngineStatus {
  ok?: boolean;

  state?:
    | "IDLE"
    | "LOADING"
    | "PLAYING"
    | "PAUSED"
    | "ERROR";

  current?:
    AudioEngineTrack |
    null;

  queueLength?: number;

  listeners?: number;

  startedAt?:
    string |
    null;

  lastError?:
    string |
    null;
}

async function request(
  path: string,
  options: RequestInit = {},
  timeoutMs = 10000,
): Promise<AudioEngineStatus> {

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
          signal:
            controller.signal,
        },
      );

    const text =
      await response.text();

    let data:
      AudioEngineStatus;

    try {

      data =
        text
          ? JSON.parse(text)
          : {};

    } catch {

      throw new Error(
        `Audio Engine respondeu HTTP ${response.status} sem JSON válido.`,
      );
    }

    if (!response.ok) {

      throw new Error(
        `Audio Engine respondeu HTTP ${response.status}: ${text}`,
      );
    }

    return data;

  } finally {

    clearTimeout(timer);
  }
}

export async function audioEngineStatus():
  Promise<AudioEngineStatus> {

  return request(
    "/status",
    {},
    5000,
  );
}

export async function audioEngineStop():
  Promise<AudioEngineStatus> {

  return request(
    "/stop",
    {
      method:
        "POST",
    },
    5000,
  );
}

export async function audioEnginePlay(
  source: string,
  title: string,
): Promise<AudioEngineStatus> {

  await request(
    "/play",
    {
      method:
        "POST",

      headers: {
        "content-type":
          "application/json",
      },

      body:
        JSON.stringify({
          source,
          title,
        }),
    },
    10000,
  );

  /*
   * /play responde inicialmente LOADING.
   * Esperamos pelo estado real PLAYING
   * antes de devolver controlo ao AutoDJ.
   */
  const deadline =
    Date.now() +
    70000;

  while (
    Date.now() <
    deadline
  ) {

    const status =
      await audioEngineStatus();

    if (
      status.state ===
        "ERROR"
    ) {

      throw new Error(
        status.lastError ??
        "Audio Engine entrou em ERROR.",
      );
    }

    if (
      status.state ===
        "PLAYING" &&
      status.current?.source ===
        source
    ) {

      return status;
    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          200,
        ),
    );
  }

  throw new Error(
    "Timeout à espera de PLAYING no Audio Engine.",
  );
}
