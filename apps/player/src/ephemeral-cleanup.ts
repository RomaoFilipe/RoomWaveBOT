import {
  rm,
} from "node:fs/promises";

import {
  resolve,
  sep,
} from "node:path";

const CACHE_DIR =
  resolve(
    process.env.ROOMWAVE_CACHE_DIR ??
    "/home/ubuntu/roomwave/.data/audio/cache",
  );

export async function cleanupEphemeralSource(
  source:
    | string
    | null
    | undefined,
): Promise<boolean> {

  if (!source) {
    return false;
  }

  /*
   * Só apagamos ficheiros locais dentro
   * da pasta oficial de cache RoomWave.
   */
  if (
    source.startsWith("http://") ||
    source.startsWith("https://")
  ) {
    return false;
  }

  const candidate =
    resolve(source);

  const insideCache =
    candidate.startsWith(
      CACHE_DIR + sep,
    );

  if (!insideCache) {
    return false;
  }

  try {
    await rm(
      candidate,
      {
        force: true,
      },
    );

    console.log(
      `🗑️ Ephemeral cache removido: ${candidate}`,
    );

    return true;

  } catch (error) {
    console.error(
      "⚠️ Falha ao remover cache temporário:",
      error instanceof Error
        ? error.message
        : error,
    );

    return false;
  }
}
