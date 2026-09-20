import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

export interface MediaSource {
  url: string;
  headers?: Record<string, string>;
}

/** null denotes a non-YouTube source; malformed YouTube links are rejected. */
export function youtubeVideoId(source: string): string | null {
  if (videoIdPattern.test(source)) return source;
  let url: URL;
  try { url = new URL(source); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (!["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"].includes(host)) {
    return null;
  }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("YOUTUBE_INVALID_URL");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const id = host.endsWith("youtu.be")
    ? segments[0]
    : url.pathname === "/watch"
      ? url.searchParams.get("v")
      : ["shorts", "live", "embed"].includes(segments[0] ?? "") ? segments[1] : null;
  if (!id || !videoIdPattern.test(id)) throw new Error("YOUTUBE_VIDEO_ID_REQUIRED");
  return id;
}

export async function resolveMediaSource(source: string, signal: AbortSignal): Promise<MediaSource> {
  const id = youtubeVideoId(source);
  if (!id) return { url: source };

  const args = [
    "--ignore-config", "--no-cookies", "--no-cookies-from-browser",
    "--no-playlist", "--no-warnings", "--no-progress",
    "--no-cache-dir", "--socket-timeout", "10", "--retries", "0",
    "--extractor-retries", "0", "--js-runtimes", `node:${process.execPath}`,
    "--skip-download", "--dump-single-json", "-f", "bestaudio/best",
  ];
  // RoomWave operates anonymously: no account cookies or browser profiles.
  args.push("--", `https://www.youtube.com/watch?v=${id}`);

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(process.env.YTDLP_BIN || "yt-dlp", args, {
      encoding: "utf8", signal, timeout: 45000, killSignal: "SIGKILL",
      maxBuffer: 8 * 1024 * 1024,
    }));
  } catch (error) {
    if (signal.aborted) throw new Error("YOUTUBE_RESOLUTION_CANCELLED");
    const failure = error as { code?: string; killed?: boolean; stderr?: string };
    const stderr = failure.stderr ?? "";
    // Do not expose signed media URLs, cookies or raw subprocess output in /status.
    if (failure.code === "ENOENT") throw new Error("YOUTUBE_EXTRACTOR_NOT_INSTALLED");
    if (failure.killed) throw new Error("YOUTUBE_RESOLUTION_TIMEOUT");
    if (/confirm.*not a bot|sign in|login required|authentication/i.test(stderr)) {
      throw new Error("YOUTUBE_ACCESS_DENIED");
    }
    if (/private video|video unavailable|not available|removed|copyright/i.test(stderr)) {
      throw new Error("YOUTUBE_VIDEO_UNAVAILABLE");
    }
    throw new Error("YOUTUBE_RESOLUTION_FAILED");
  }

  let data: { id?: string; url?: string; acodec?: string; http_headers?: unknown };
  try { data = JSON.parse(stdout); } catch { throw new Error("YOUTUBE_INVALID_RESPONSE"); }
  if (!data || data.id !== id || typeof data.url !== "string" || data.acodec === "none") {
    throw new Error("YOUTUBE_AUDIO_UNAVAILABLE");
  }
  let mediaUrl: URL;
  try { mediaUrl = new URL(data.url); } catch { throw new Error("YOUTUBE_AUDIO_UNAVAILABLE"); }
  if (mediaUrl.protocol !== "https:" || mediaUrl.username || mediaUrl.password) {
    throw new Error("YOUTUBE_INVALID_MEDIA_URL");
  }
  const headers: Record<string, string> = {};
  if (data.http_headers && typeof data.http_headers === "object") {
    for (const [key, value] of Object.entries(data.http_headers)) {
      if (/^[A-Za-z0-9-]+$/.test(key) && typeof value === "string" && !/[\r\n\0]/.test(value)) {
        headers[key] = value;
      }
    }
  }
  return { url: mediaUrl.href, headers };
}
