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
  radioPush,
  radioSkip,
} = await import(
  "./liquidsoap.js"
);

const {
  resolveRadioSource,
} = await import(
  "./radio-source.js"
);

const {
  startAudioGateway,
} = await import(
  "./audio-gateway.js"
);

await startAudioGateway();


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

function getYoutubeVideoId(
  track: {
    provider: string;
    externalId: string | null;
  },
): string | null {

  if (
    track.provider.toLowerCase()
      !== "youtube" ||
    !track.externalId
  ) {
    return null;
  }

  const id =
    track.externalId.trim();

  if (
    !/^[A-Za-z0-9_-]{11}$/.test(id)
  ) {
    return null;
  }

  return id;
}

function getPlayableUri(track: {
  provider: string;
  sourceUrl: string | null;
}): string | null {
  const provider =
    track.provider.toLowerCase();

  const sourceUrl =
    track.sourceUrl;

  if (!sourceUrl) {
    return null;
  }

  /*
   * YouTube continua a ser pesquisa/metadados.
   * Não enviamos páginas do YouTube para o Liquidsoap.
   */
  if (
    provider === "youtube"
  ) {
    return null;
  }

  if (
    provider === "local" &&
    sourceUrl.startsWith("/")
  ) {
    return sourceUrl;
  }

  if (
    ["direct", "stream", "licensed"].includes(
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

    startedAt:
      history.startedAt,
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
   * PRE-FLIGHT DA FONTE
   * ============================================================
   *
   * Só marcamos a faixa como PLAYING depois de confirmar
   * que existe uma fonte de áudio utilizável.
   */

  const preparedSource =
    await resolveRadioSource({
      provider:
        next.track.provider,

      externalId:
        next.track.externalId,

      title:
        next.track.title,

      artist:
        next.track.artist,

      durationSec:
        next.track.durationSec,

      sourceUrl:
        next.track.sourceUrl,
    });


  if (!preparedSource) {

    console.log(
      `⛔ Fonte indisponível: ${next.track.artist} - ${next.track.title}`,
    );

    /*
     * Continua WAITING até este momento.
     * Portanto nunca existiu falso PLAYING
     * nem PlaybackHistory para esta tentativa.
     */
    const skipped =
      await prisma.queueItem.updateMany({
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
      skipped.count === 1
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

    startedAt:
      claimed.startedAt,
  };

  idleLogged = false;

  /*
   * A fonte já foi validada antes do claim.
   * Aqui apenas a entregamos ao Liquidsoap.
   */
  try {

    await radioPush(
      preparedSource.url,
    );

    console.log(
      `🔊 RADIO ON: ${preparedSource.artist} - ${preparedSource.title}`,
    );

  } catch (error) {

    console.error(
      "❌ Liquidsoap recusou a fonte:",
      error instanceof Error
        ? error.message
        : error,
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
    );

  if (!completed) {
    active = null;
    return;
  }

  console.log(
    `✅ PLAYED: ${current.artist} - ${current.title}`,
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
      active;

    console.log(
      `⏭️ Playback interrompido: ${previous.artist} - ${previous.title}`,
    );

    try {
      await radioSkip();
    } catch (error) {
      console.error(
        "⚠️ Não foi possível executar SKIP no Liquidsoap:",
        error instanceof Error
          ? error.message
          : error,
      );
    }

    await closePlaybackHistory(
      previous.trackId,
    );

    active = null;

    await renumberQueue();

    return;
  }

  const elapsedSec =
    (
      Date.now() -
      active.startedAt
        .getTime()
    ) /
    1000;

  if (
    elapsedSec >=
    active.durationSec
  ) {
    await finishActive();
  }
}

/*
 * ============================================================
 * LOOP AUTODJ
 * ============================================================
 */
async function tick() {
  if (stopping) {
    return;
  }

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
