function getApiUrl(): string {
  return (
    process.env.ROOMWAVE_API_URL ??
    "http://127.0.0.1:3001"
  );
}

function requireRoom() {
  const roomId =
    process.env.ROOMWAVE_ROOM_ID;

  if (!roomId) {
    throw new Error(
      "ROOMWAVE_ROOM_ID não está configurado.",
    );
  }

  return {
    roomId,
  };
}

async function readJson(
  response: Response,
) {
  return response
    .json()
    .catch(() => ({
      error:
        "INVALID_API_RESPONSE",
    }));
}

function apiError(
  body: unknown,
) {
  return new Error(
    `RoomWave API error: ${JSON.stringify(body)}`,
  );
}

export async function ensureImvuMember(
  imvuUserId: string,
) {
  const config =
    requireRoom();

  const response =
    await fetch(
      `${getApiUrl()}/api/rooms/${config.roomId}/imvu-members/ensure`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            imvuUserId,
          }),
      },
    );

  const body =
    await readJson(response);

  if (!response.ok) {
    throw apiError(body);
  }

  return body as {
    user: {
      id: string;
      username: string;
      imvuUserId: string | null;
    };

    role:
      | "OWNER"
      | "ADMIN"
      | "MODERATOR"
      | "DJ"
      | "VIP"
      | "USER";
  };
}

export async function addTrack(
  query: string,
  imvuUserId?: string,
) {
  const config =
    requireRoom();

  const legacyUserId =
    process.env.ROOMWAVE_BOT_USER_ID;

  if (
    !imvuUserId &&
    !legacyUserId
  ) {
    throw new Error(
      "Nenhuma identidade RoomWave disponível.",
    );
  }

  const identity =
    imvuUserId
      ? {
          imvuUserId,
        }
      : {
          userId:
            legacyUserId!,
        };

  const response =
    await fetch(
      `${getApiUrl()}/api/rooms/${config.roomId}/requests`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            ...identity,
            query,
          }),
      },
    );

  const body =
    await readJson(response);

  if (!response.ok) {
    throw apiError(body);
  }

  return body as {
    message: string;

    position: number;

    track: {
      title: string;
      artist: string;
      durationSec:
        number | null;
      artworkUrl:
        string | null;
    };

    requestedBy: {
      username: string;
    };
  };
}

export async function getQueue() {
  const config =
    requireRoom();

  const response =
    await fetch(
      `${getApiUrl()}/api/rooms/${config.roomId}/queue`,
    );

  const body =
    await readJson(response);

  if (!response.ok) {
    throw apiError(body);
  }

  return body as {
    count: number;

    queue: Array<{
      position: number;

      track: {
        title: string;
        artist: string;
        durationSec:
          number | null;
      };

      requestedBy: {
        username: string;
      } | null;
    }>;
  };
}

export async function getNow() {
  const config =
    requireRoom();

  const response =
    await fetch(
      `${getApiUrl()}/api/rooms/${config.roomId}/now`,
    );

  const body =
    await readJson(response);

  if (!response.ok) {
    throw apiError(body);
  }

  type QueueTrack = {
    position: number;

    track: {
      title: string;
      artist: string;
      durationSec:
        number | null;
    };

    requestedBy: {
      username: string;
    } | null;
  };

  return body as {
    playing:
      QueueTrack | null;

    next:
      QueueTrack | null;
  };
}

export async function skipTrack(
  imvuUserId: string,
) {
  const config =
    requireRoom();

  const response =
    await fetch(
      `${getApiUrl()}/api/rooms/${config.roomId}/skip`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            imvuUserId,
          }),
      },
    );

  const body =
    await readJson(response);

  if (!response.ok) {
    throw apiError(body);
  }

  return body as {
    wasPlaying: boolean;

    track: {
      title: string;
      artist: string;
    };

    actor: {
      username: string;
    };
  };
}

export async function removeTrack(
  position: number,
  imvuUserId: string,
) {
  const config =
    requireRoom();

  const response =
    await fetch(
      `${getApiUrl()}/api/rooms/${config.roomId}/remove`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            imvuUserId,
            position,
          }),
      },
    );

  const body =
    await readJson(response);

  if (!response.ok) {
    throw apiError(body);
  }

  return body as {
    position: number;

    track: {
      title: string;
      artist: string;
    };

    actor: {
      username: string;
    };
  };
}

export async function clearQueue(
  imvuUserId: string,
) {
  const config =
    requireRoom();

  const response =
    await fetch(
      `${getApiUrl()}/api/rooms/${config.roomId}/clear`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            imvuUserId,
          }),
      },
    );

  const body =
    await readJson(response);

  if (!response.ok) {
    throw apiError(body);
  }

  return body as {
    removed: number;

    actor: {
      username: string;
    };
  };
}

export async function radioVolume(imvuUserId: string, volume?: number) {
  const { roomId } = requireRoom();
  const response = await fetch(`${getApiUrl()}/api/rooms/${roomId}/volume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imvuUserId, volume }),
    signal: AbortSignal.timeout(7000),
  });
  const body = await readJson(response);
  if (!response.ok) throw apiError(body);
  return body as { volume: number };
}
