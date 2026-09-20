import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { youtubeVideoId } from "./youtube";

import type {
  AudioTrack
} from "../types";

const AUDIO_DIR =
  path.resolve(
    process.env.ROOMWAVE_AUDIO_DIR ||
    "/home/ubuntu/roomwave/.data/audio"
  );

function resolveLocalFile(
  source: string
): string {

  const absolute =
    path.resolve(source);

  const allowed =
    absolute === AUDIO_DIR ||
    absolute.startsWith(
      AUDIO_DIR + path.sep
    );

  if (!allowed) {
    throw new Error(
      "Local audio must be inside ROOMWAVE_AUDIO_DIR"
    );
  }

  if (!fs.existsSync(absolute)) {
    throw new Error(
      "Audio file does not exist"
    );
  }

  return absolute;
}

export function resolveAudioTrack(
  input: unknown,
  title?: unknown
): AudioTrack {

  if (
    typeof input !== "string" ||
    !input.trim()
  ) {
    throw new Error(
      "Audio source is required"
    );
  }

  let source =
    input.trim();

  const videoId = youtubeVideoId(source);
  if (videoId) source = `https://www.youtube.com/watch?v=${videoId}`;

  /*
   * V1 accepts:
   *
   * - YouTube / YouTube Music video URLs or video IDs
   * - HTTP
   * - HTTPS
   * - local files inside .data/audio
   *
   * YouTube audio is resolved just before playback, so expiring media
   * URLs are never persisted in the queue.
   */
  if (
    source.startsWith("http://") ||
    source.startsWith("https://")
  ) {

    const parsed =
      new URL(source);

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      throw new Error(
        "Unsupported URL protocol"
      );
    }

  } else {

    source =
      resolveLocalFile(source);
  }

  return {
    id:
      crypto.randomUUID(),

    title:
      typeof title === "string" &&
      title.trim()
        ? title.trim()
        : "RoomWave Track",

    source,

    requestedAt:
      new Date().toISOString()
  };
}
