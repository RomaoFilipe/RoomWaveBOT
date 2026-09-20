import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { searchTrack } from "../packages/music/src/index.ts";
import { resolveMediaSource } from "../apps/audio-engine/src/resolver/youtube.ts";

const envPath = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error('Uso: pnpm youtube:probe "Ghost - Mary On A Cross"');
  process.exitCode = 1;
} else {
  let stage = "search";
  try {
    const track = await searchTrack(query);
    if (!track) throw new Error("TRACK_NOT_FOUND");
    console.log(JSON.stringify({ stage, provider: track.provider, id: track.externalId, title: track.title, artist: track.artist, durationSec: track.durationSec }));
    stage = "resolve";
    const media = await resolveMediaSource(track.sourceUrl, new AbortController().signal);
    console.log(JSON.stringify({ stage, ok: true }));
    stage = "decode";
    const args = ["-nostdin", "-hide_banner", "-loglevel", "error", "-rw_timeout", "15000000"];
    const headers = Object.entries(media.headers ?? {}).map(([key, value]) => `${key}: ${value}\r\n`).join("");
    if (headers) args.push("-headers", headers);
    args.push("-i", media.url, "-t", "3", "-vn", "-map", "0:a:0", "-f", "null", "-");
    await promisify(execFile)(process.env.FFMPEG_BIN || "ffmpeg", args, { timeout: 25000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 });
    console.log(JSON.stringify({ stage, ok: true, seconds: 3, broadcast: false }));
  } catch (error) {
    // Never print subprocess commands or signed URLs.
    console.error(JSON.stringify({ stage, ok: false, error: stage === "decode" ? "AUDIO_DECODE_FAILED" : error instanceof Error ? error.message : "PROBE_FAILED" }));
    process.exitCode = 1;
  }
}
