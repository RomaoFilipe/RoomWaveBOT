import { readFile } from "node:fs/promises";
import { downloadToEphemeralCache } from "./ephemeral-cache.js";

const base = (process.env.NODELINK_URL ?? "http://127.0.0.1:2334").replace(/\/+$/, "");
type Track = { encoded: string; info: { identifier: string; sourceName: string; isStream?: boolean } };

export function assertExactTrack(track: Track, id: string): void {
  if (track?.info?.identifier !== id || track.info.sourceName !== "youtube" || track.info.isStream) {
    throw new Error("YOUTUBE_TRACK_MISMATCH");
  }
}

export async function resolveYouTube(id: string) {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) throw new Error("INVALID_YOUTUBE_ID");
  const password = process.env.NODELINK_PASSWORD ?? (await readFile(
    "/home/ubuntu/roomwave/.data/nodelink/password", "utf8",
  )).trim();
  const signal = AbortSignal.timeout(45_000);
  async function request(path: string) {
    const response = await fetch(base + path, { headers: { Authorization: password }, signal });
    if (!response.ok) throw new Error(`NODELINK_HTTP_${response.status}`);
    return response.json();
  }
  const loaded = await request(`/v4/loadtracks?identifier=${encodeURIComponent("ytsearch:" + id)}`);
  const tracks: Track[] = loaded.loadType === "track" ? [loaded.data] :
    loaded.loadType === "search" && Array.isArray(loaded.data) ? loaded.data : [];
  const track = tracks.find(t => t.info?.identifier === id);
  if (!track) throw new Error("YOUTUBE_TRACK_NOT_FOUND");
  assertExactTrack(track, id);
  const stream = await request(`/v4/trackstream?encodedTrack=${encodeURIComponent(track.encoded)}`);
  if (stream.newTrack) assertExactTrack(stream.newTrack, id);
  const url = new URL(stream.url);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".googlevideo.com")) {
    throw new Error("YOUTUBE_SOURCE_MISMATCH");
  }
  const cached = await downloadToEphemeralCache(url.toString());
  return { type: "local", uri: cached.path, ephemeral: true };
}
