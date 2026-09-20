import { applyActiveRoom } from "../../../tools/room-runtime.mjs";
import {
  resolvePlayableUri,
} from "./source-resolver.js";

import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({
  path: fileURLToPath(
    new URL(
      "../../../.env",
      import.meta.url,
    ),
  ),
});

applyActiveRoom();

/*
 * Import dinâmico:
 * garante que .env já foi carregado
 * antes de inicializar Prisma.
 */
const {
  prisma,
} = await import(
  "@roomwave/database"
);

const {
  audioEnginePlay,
  audioEngineStop,
  audioEngineStatus,
} = await import(
  "./audio-engine.js"
);

const {
  cleanupEphemeralSource,
} = await import(
  "./ephemeral-cleanup.js"
);


const roomId = (() => {
  const value =
    process.env.ROOMWAVE_ROOM_ID;

  if (!value) {
    throw new Error(
      "ROOMWAVE_ROOM_ID não está configurado.",
    );
  }

  return value;
})();

const pollMs =
  Math.max(
    500,
    Number(
      process.env
        .ROOMWAVE_PLAYER_POLL_MS ??
        1000,
    ),
  );

const unknownDurationSec =
  Math.max(
    30,
    Number(
      process.env
        .ROOMWAVE_UNKNOWN_DURATION_SEC ??
        240,
    ),
  );

type ActiveTrack = {
  queueItemId: string;
  trackId: string;

  title: string;
  artist: string;

  durationSec: number;

  requestedById:
    string | null;

  source?:
    string | null;

  startedAt: Date;
};

let active:
  ActiveTrack | null =
  null;

let stopping =
  false;

let idleLogged =
  false;

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function getPlayableUri(track: {
  provider: string;
  sourceUrl: string | null;
  externalId: string | null;
}): string | null {
  const provider =
    track.provider.toLowerCase();

  const sourceUrl =
    track.sourceUrl;

  // The Audio Engine resolves the video immediately before playback.
  if (
    provider === "youtube"
  ) {
    return track.externalId && /^[A-Za-z0-9_-]{11}$/.test(track.externalId)
      ? `https://www.youtube.com/watch?v=${track.externalId}`
      : null;
  }

  if (!sourceUrl) return null;

  if (
    provider === "local" &&
    sourceUrl.startsWith("/")
  ) {
    return sourceUrl;
  }

  if (
    ["direct", "stream", "licensed", "audius"].includes(
      provider,
    ) &&
    /^https?:\/\//i.test(
      sourceUrl,
    )
  ) {
    return sourceUrl;
  }

  return null;
}


async function resolveTrackSource(
  track: {
    provider: string;
    sourceUrl: string | null;
    externalId: string | null;
    artist: string;
    title: string;
    durationSec: number | null;
  },
): Promise<string | null> {

  const provider =
    track.provider.toLowerCase();

  /*
   * YouTube / YouTube Music:
   * nunca enviar o watch URL diretamente
   * ao Audio Engine.
   *
   * Primeiro perguntar ao Source Resolver.
   */
  if (
    provider === "youtube"
  ) {
    console.log(
      `🔎 Source Resolver: ${track.artist} - ${track.title}`,
    );

    const resolved =
      await resolvePlayableUri({
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
      });

    if (resolved) {
      console.log(
        `✅ Fonte resolvida: ${track.artist} - ${track.title}`,
      );

      return resolved;
    }

    console.log(
      `⚠️ Source Resolver: UNAVAILABLE — ${track.artist} - ${track.title}`,
    );

    return null;
  }

  /*
   * Local / HTTP / Audius / fontes diretas
   * continuam a utilizar a lógica existente.
   */
  return getPlayableUri(
    track,
  );
}


async function renumberQueue() {
  const waiting =
    await prisma.queueItem.findMany({
      where: {
        roomId,
        status: "WAITING",
      },

      orderBy: {
        position: "asc",
      },
    });

  if (
    waiting.length === 0
  ) {
    return;
  }

  await prisma.$transaction(
    waiting.map(
      (
        item,
        index,
      ) =>
        prisma.queueItem.update({
          where: {
            id: item.id,
          },

          data: {
            position:
              index + 1,
          },
        }),
    ),
  );
}

/*
 * ============================================================
 * REJEITAR MUSIC REQUEST
 * ============================================================
 *
 * QueueItem não possui musicRequestId.
 * Por isso usamos:
 *
 * roomId + trackId + requestedById + QUEUED
 *
 * e escolhemos o pedido mais antigo.
 */
async function rejectQueuedRequest(
  trackId: string,
  requestedById: string | null,
): Promise<boolean> {

  /*
   * Sem requestedById não conseguimos
   * identificar com segurança o pedido.
   */
  if (!requestedById) {

    console.log(
      "⚠️ MusicRequest não atualizado: QueueItem sem requestedById.",
    );

    return false;
  }


  const request =
    await prisma.musicRequest
      .findFirst({
        where: {
          roomId,

          trackId,

          requestedById,

          status:
            "QUEUED",
        },

        orderBy: {
          createdAt:
            "asc",
        },
      });


  if (!request) {

    console.log(
      "ℹ️ Nenhum MusicRequest QUEUED correspondente encontrado.",
    );

    return false;
  }


  await prisma.musicRequest
    .update({
      where: {
        id:
          request.id,
      },

      data: {
        status:
          "REJECTED",
      },
    });


  console.log(
    "📋 MusicRequest → REJECTED",
  );


  return true;
}


async function closePlaybackHistory(
  trackId: string,
) {
  const history =
    await prisma.playbackHistory
      .findFirst({
        where: {
          roomId,
          trackId,
          endedAt: null,
        },

        orderBy: {
          startedAt: "desc",
        },
      });

  if (!history) {
    return;
  }

  await prisma.playbackHistory
    .update({
      where: {
        id: history.id,
      },

      data: {
        endedAt:
          new Date(),
      },
    });
}

/*
 * ============================================================
 * RECUPERAR PLAYING
 * ============================================================
 *
 * Se o servidor/player reiniciar enquanto
 * existe uma música PLAYING, não iniciamos
 * outra por cima.
 */
async function recoverPlaying():
  Promise<boolean> {
  const item =
    await prisma.queueItem.findFirst({
      where: {
        roomId,
        status: "PLAYING",
      },

      orderBy: {
        position: "asc",
      },

      include: {
        track: true,
        requestedBy: true,
      },
    });

  if (!item) {
    return false;
  }

  let history =
    await prisma.playbackHistory
      .findFirst({
        where: {
          roomId,
          trackId:
            item.trackId,
          endedAt: null,
        },

        orderBy: {
          startedAt:
            "desc",
        },
      });

  if (!history) {
    history =
      await prisma
        .playbackHistory
        .create({
          data: {
            roomId,
            trackId:
              item.trackId,
          },
        });
  }

  const playback = await audioEngineStatus();
  const expectedTitle = `${item.track.artist} - ${item.track.title}`;
  const engineHasTrack = playback.current?.title === expectedTitle;
  // Reuse the engine's existing file: resolving again creates a different path
  // and prevents monitoring from associating engine errors with this queue item.
  let source = engineHasTrack ? playback.current!.source : null;
  let startedAt = playback.startedAt ? new Date(playback.startedAt) : history.startedAt;
  if (!engineHasTrack) {
    if (playback.current && ["LOADING", "PLAYING", "PAUSED"].includes(playback.state ?? "")) {
      throw new Error("RECOVERY_ENGINE_TRACK_MISMATCH");
    }
    source = await resolveTrackSource(item.track);
    if (!source) throw new Error("RECOVERY_SOURCE_UNAVAILABLE");
    try {
      const resumed = await audioEnginePlay(source, expectedTitle);
      startedAt = resumed.startedAt ? new Date(resumed.startedAt) : new Date();
    } catch (error) {
      await audioEngineStop().catch(() => {});
      await cleanupEphemeralSource(source);
      throw error;
    }
  }

  active = {
    queueItemId:
      item.id,

    trackId:
      item.trackId,

    title:
      item.track.title,

    artist:
      item.track.artist,

    durationSec:
      item.track
        .durationSec ??
      unknownDurationSec,

    requestedById:
      item.requestedById,

    source,
    startedAt,
  };

  idleLogged = false;

  console.log(
    "♻️ PLAYING recuperado:",
  );

  console.log(
    `🎵 ${active.artist} - ${active.title}`,
  );

  return true;
}

/*
 * ============================================================
 * COMEÇAR PRÓXIMA
 * ============================================================
 */
/*
 * ============================================================
 * LOCK DO STARTNEXT
 * ============================================================
 *
 * O pre-flight pode demorar alguns segundos.
 * Durante esse período o loop principal não pode tentar
 * preparar novamente o mesmo item WAITING.
 */
let startNextBusy =
  false;


async function startNext():
  Promise<boolean> {

  if (startNextBusy) {
    return false;
  }


  startNextBusy =
    true;


  try {

    return await startNextInternal();

  } finally {

    startNextBusy =
      false;
  }
}


async function startNextInternal():
  Promise<boolean> {
  /*
   * Primeiro verificar se já existe
   * PLAYING na DB.
   */
  if (
    await recoverPlaying()
  ) {
    return true;
  }

  const next =
    await prisma.queueItem.findFirst({
      where: {
        roomId,
        status: "WAITING",
      },

      orderBy: {
        position: "asc",
      },

      include: {
        track: true,
        requestedBy: true,
      },
    });

  if (!next) {
    if (!idleLogged) {
      console.log(
        "💤 Fila vazia — AutoDJ em espera.",
      );

      idleLogged = true;
    }

    return false;
  }

  const now =
    new Date();

  /*
   * ============================================================
   * PRE-FLIGHT AUDIO ENGINE
   * ============================================================
   */

  const playableUri =
    await resolveTrackSource(
      next.track,
    );

  if (!playableUri) {

    console.log(
      `⛔ Fonte não reproduzível pelo Audio Engine: ${next.track.artist} - ${next.track.title}`,
    );

    const skipped =
      await prisma.queueItem
        .updateMany({
          where: {
            id:
              next.id,

            status:
              "WAITING",
          },

          data: {
            status:
              "SKIPPED",

            playedAt:
              new Date(),
          },
        });

    if (
      skipped.count ===
      1
    ) {

      await rejectQueuedRequest(
        next.trackId,
        next.requestedById,
      );

      console.log(
        "⏭️ QueueItem → SKIPPED",
      );

      await renumberQueue();
    }

    return true;
  }


  const claimed =
    await prisma.$transaction(
      async (tx) => {
        /*
         * Claim atómico.
         *
         * Se no futuro tivermos dois
         * players acidentalmente, apenas
         * um consegue mudar WAITING
         * para PLAYING.
         */
        const update =
          await tx.queueItem
            .updateMany({
              where: {
                id: next.id,
                status:
                  "WAITING",
              },

              data: {
                status:
                  "PLAYING",
              },
            });

        if (
          update.count !== 1
        ) {
          return null;
        }

        const history =
          await tx
            .playbackHistory
            .create({
              data: {
                roomId,
                trackId:
                  next.trackId,

                startedAt:
                  now,
              },
            });

        return history;
      },
    );

  if (!claimed) {
    return false;
  }

  active = {
    queueItemId:
      next.id,

    trackId:
      next.trackId,

    title:
      next.track.title,

    artist:
      next.track.artist,

    durationSec:
      next.track
        .durationSec ??
      unknownDurationSec,

    requestedById:
      next.requestedById,

    source:
      playableUri,

    startedAt:
      claimed.startedAt,
  };

  idleLogged = false;

  /*
   * O AutoDJ entrega a fonte diretamente
   * ao RoomWave Audio Engine.
   *
   * Audio Engine -> FFmpeg -> Harbor ->
   * Liquidsoap -> Icecast.
   */
  try {

    const playback =
      await audioEnginePlay(
        playableUri,
        `${next.track.artist} - ${next.track.title}`,
      );

    if (
      playback.ok !== true ||
      playback.state !==
        "PLAYING"
    ) {

      throw new Error(
        `Audio Engine recusou a faixa: state=${playback.state ?? "?"} error=${playback.lastError ?? "?"}`,
      );
    }

    console.log(
      `🔊 AUDIO ENGINE ON: ${next.track.artist} - ${next.track.title}`,
    );

    if (playback.startedAt) {
      active.startedAt = new Date(playback.startedAt);
      await prisma.playbackHistory.update({
        where: { id: claimed.id },
        data: { startedAt: active.startedAt },
      });
    }

  } catch (error) {

    console.error(
      "❌ Audio Engine recusou a faixa:",
      error instanceof Error
        ? error.message
        : error,
    );

    try {

      await audioEngineStop();

    } catch {}

    await cleanupEphemeralSource(
      playableUri,
    );

    await prisma.queueItem.update({
      where: {
        id:
          next.id,
      },

      data: {
        status:
          "SKIPPED",

        playedAt:
          new Date(),
      },
    });

    await closePlaybackHistory(
      next.trackId,
    );

    await rejectQueuedRequest(
      next.trackId,
      next.requestedById,
    );

    active =
      null;

    await renumberQueue();

    return true;
  }


  console.log("");
  console.log(
    "▶️ NOW PLAYING",
  );

  console.log(
    `🎵 ${active.artist} - ${active.title}`,
  );

  console.log(
    `⏱️ ${active.durationSec}s`,
  );

  console.log(
    `👤 ${
      next.requestedBy
        ?.username ??
      "AutoDJ"
    }`,
  );

  return true;
}

/*
 * ============================================================
 * TERMINAR NATURALMENTE
 * ============================================================
 */
async function finishActive() {
  if (!active) {
    return;
  }

  const current =
    active;

  const now =
    new Date();

  const completed =
    await prisma.$transaction(
      async (tx) => {
        const result =
          await tx.queueItem
            .updateMany({
              where: {
                id:
                  current
                    .queueItemId,

                status:
                  "PLAYING",
              },

              data: {
                status:
                  "PLAYED",

                playedAt:
                  now,
              },
            });

        /*
         * Pode ter sido !skip exatamente
         * no mesmo instante.
         */
        if (
          result.count !== 1
        ) {
          return false;
        }

        const history =
          await tx
            .playbackHistory
            .findFirst({
              where: {
                roomId,

                trackId:
                  current
                    .trackId,

                endedAt:
                  null,
              },

              orderBy: {
                startedAt:
                  "desc",
              },
            });

        if (history) {
          await tx
            .playbackHistory
            .update({
              where: {
                id:
                  history.id,
              },

              data: {
                endedAt:
                  now,
              },
            });
        }

        /*
         * Marcar o pedido correspondente
         * como PLAYED quando possível.
         */
        const request =
          await tx.musicRequest
            .findFirst({
              where: {
                roomId,

                trackId:
                  current
                    .trackId,

                requestedById:
                  current
                    .requestedById ??
                  undefined,

                status:
                  "QUEUED",
              },

              orderBy: {
                createdAt:
                  "asc",
              },
            });

        if (request) {
          await tx
            .musicRequest
            .update({
              where: {
                id:
                  request.id,
              },

              data: {
                status:
                  "PLAYED",
              },
            });
        }

        return true;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );

  if (!completed) {
    active = null;
    return;
  }

  console.log(
    `✅ PLAYED: ${current.artist} - ${current.title}`,
  );

  await cleanupEphemeralSource(
    current.source,
  );

  active = null;

  await renumberQueue();
}

/*
 * ============================================================
 * MONITORIZAR PLAYING
 * ============================================================
 */
async function monitorActive() {
  if (!active) {
    return;
  }

  /*
   * Snapshot local.
   *
   * `active` é uma variável global e pode teoricamente
   * mudar durante os vários await desta função.
   * `current` mantém a referência à faixa que estamos
   * efetivamente a monitorizar nesta iteração.
   */
  const current = active;


  const item =
    await prisma.queueItem
      .findUnique({
        where: {
          id:
            active
              .queueItemId,
        },

        select: {
          status: true,
        },
      });

  /*
   * !skip altera PLAYING → SKIPPED
   * através da API.
   */
  if (
    !item ||
    item.status !==
      "PLAYING"
  ) {
    const previous =
      current;

    console.log(
      `⏭️ Playback interrompido: ${previous.artist} - ${previous.title}`,
    );

    try {
      await audioEngineStop();
    } catch (error) {
      console.error(
        "⚠️ Não foi possível parar o Audio Engine:",
        error instanceof Error
          ? error.message
          : error,
      );
    }

    await cleanupEphemeralSource(
      previous.source,
    );

    await closePlaybackHistory(
      previous.trackId,
    );

    active = null;

    await renumberQueue();

    return;
  }

  /*
   * ============================================================
   * ESTADO REAL DO AUDIO ENGINE
   * ============================================================
   *
   * O estado do processo FFmpeg é agora
   * a principal indicação de reprodução.
   */
  try {

    const playback =
      await audioEngineStatus();

    const sameSource =
      !current.source ||
      playback.current?.source ===
        current.source;

    /*
     * Quando o FFmpeg termina naturalmente,
     * o Audio Engine regressa a IDLE.
     */
    if (
      current.source &&
      playback.state ===
        "IDLE" &&
      playback.current ===
        null
    ) {

      console.log(
        `🏁 Audio Engine terminou: ${current.artist} - ${current.title}`,
      );

      await finishActive();

      return;
    }

    /*
     * Falha real do FFmpeg/resolver.
     */
    if (
      sameSource &&
      playback.state ===
        "ERROR"
    ) {

      const failed =
        active;

      if (!failed) {
        return;
      }

      console.log(
        `⛔ Audio Engine ERROR: ${failed.artist} - ${failed.title}`,
      );

      if (
        playback.lastError
      ) {

        console.log(
          `   ${playback.lastError}`,
        );
      }

      try {

        await audioEngineStop();

      } catch {}

      await cleanupEphemeralSource(
        failed.source,
      );

      const skipped =
        await prisma.queueItem
          .updateMany({
            where: {
              id:
                failed.queueItemId,

              status:
                "PLAYING",
            },

            data: {
              status:
                "SKIPPED",

              playedAt:
                new Date(),
            },
          });

      if (
        skipped.count ===
        1
      ) {

        await closePlaybackHistory(
          failed.trackId,
        );

        await rejectQueuedRequest(
          failed.trackId,
          failed.requestedById,
        );

        active =
          null;

        await renumberQueue();

        console.log(
          "⏭️ Faixa rejeitada pelo Audio Engine.",
        );
      }

      return;
    }

    // The engine is authoritative. Metadata duration must not finish a paused
    // track, or cut off audio because source resolution took several seconds.
    if (sameSource && ["LOADING", "PLAYING", "PAUSED"].includes(playback.state ?? "")) {
      return;
    }

  } catch (error) {

    /*
     * Uma falha momentânea da API local
     * não deve destruir o AutoDJ.
     */
    console.error(
      "⚠️ Audio Engine status indisponível:",
      error instanceof Error
        ? error.message
        : error,
    );
  }


  // Unknown/unreachable engine state is not evidence that playback finished.
  // Retry on the next tick; only confirmed IDLE completes the queue item.

}

/*
 * ============================================================
 * LOOP AUTODJ
 * ============================================================
 */
let tickBusy = false;
async function tick() {
  if (stopping || tickBusy) {
    return;
  }

  tickBusy = true;

  try {
    if (active) {
      await monitorActive();
    }

    if (!active) {
      await startNext();
    }
  } catch (error) {
    console.error(
      "❌ PLAYER ERROR:",
      error instanceof Error
        ? error.message
        : error,
    );
  } finally {
    tickBusy = false;
  }
}

/*
 * ============================================================
 * SHUTDOWN
 * ============================================================
 */
async function shutdown(
  signal: string,
) {
  if (stopping) {
    return;
  }

  stopping = true;

  console.log(
    `🛑 ${signal} recebido.`,
  );

  /*
   * Não alteramos PLAYING.
   * Se o serviço voltar a arrancar,
   * recoverPlaying() recupera a faixa.
   */
  await prisma
    .$disconnect();

  process.exit(0);
}

process.on(
  "SIGTERM",
  () => {
    void shutdown(
      "SIGTERM",
    );
  },
);

process.on(
  "SIGINT",
  () => {
    void shutdown(
      "SIGINT",
    );
  },
);

console.log("");
console.log(
  "=================================",
);
console.log(
  "       🎧 ROOMWAVE PLAYER",
);
console.log(
  "=================================",
);
console.log(
  `Room: ${roomId}`,
);
console.log(
  `Poll: ${pollMs} ms`,
);
console.log(
  "AutoDJ: ONLINE",
);
console.log(
  "=================================",
);
console.log("");

await tick();

setInterval(
  () => {
    void tick();
  },
  pollMs,
);
