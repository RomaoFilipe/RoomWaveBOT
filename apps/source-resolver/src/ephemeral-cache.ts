import {
  randomUUID,
} from "node:crypto";

import {
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  extname,
  resolve,
} from "node:path";

const CACHE_DIR =
  resolve(
    process.env.ROOMWAVE_CACHE_DIR ??
    "/home/ubuntu/roomwave/.data/audio/cache",
  );

const MAX_FILE_BYTES =
  Number(
    process.env.ROOMWAVE_CACHE_MAX_FILE_BYTES ??
    50 * 1024 * 1024,
  );

export interface CachedMedia {
  path: string;
  bytes: number;
  sourceUrl: string;
}

function extensionFromUrl(
  sourceUrl: string,
): string {
  try {
    const url =
      new URL(sourceUrl);

    const extension =
      extname(
        url.pathname,
      ).toLowerCase();

    if (
      [
        ".mp3",
        ".aac",
        ".m4a",
        ".ogg",
        ".opus",
        ".flac",
        ".wav",
      ].includes(extension)
    ) {
      return extension;
    }

  } catch {
    // Validado novamente no downloader.
  }

  return ".bin";
}

export async function downloadToEphemeralCache(
  sourceUrl: string,
): Promise<CachedMedia> {

  const url =
    new URL(sourceUrl);

  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    throw new Error(
      "CACHE_INVALID_PROTOCOL",
    );
  }

  await mkdir(
    CACHE_DIR,
    {
      recursive: true,
    },
  );

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      30_000,
    );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      throw new Error(
        `CACHE_HTTP_${response.status}`,
      );
    }

    const declaredLength =
      Number(
        response.headers.get(
          "content-length",
        ) ?? "0",
      );

    if (
      declaredLength >
      MAX_FILE_BYTES
    ) {
      throw new Error(
        "CACHE_FILE_TOO_LARGE",
      );
    }

    if (!response.body) throw new Error("CACHE_EMPTY_FILE");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > MAX_FILE_BYTES) {
        controller.abort();
        throw new Error("CACHE_FILE_TOO_LARGE");
      }
      chunks.push(chunk);
    }
    if (!bytes) throw new Error("CACHE_EMPTY_FILE");
    const buffer = Buffer.concat(chunks, bytes);

    const filename =
      `${randomUUID()}${extensionFromUrl(sourceUrl)}`;

    const path =
      resolve(
        CACHE_DIR,
        filename,
      );

    await writeFile(
      path,
      buffer,
      {
        mode: 0o600,
      },
    );

    return {
      path,
      bytes:
        buffer.length,
      sourceUrl,
    };

  } finally {
    clearTimeout(timer);
  }
}

export async function deleteCachedMedia(
  path: string,
): Promise<void> {

  const resolvedPath =
    resolve(path);

  if (
    !resolvedPath.startsWith(
      CACHE_DIR + "/",
    )
  ) {
    throw new Error(
      "CACHE_DELETE_OUTSIDE_DIRECTORY",
    );
  }

  await rm(
    resolvedPath,
    {
      force: true,
    },
  );
}
