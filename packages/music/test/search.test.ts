import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchTrack } from "../src/index.ts";

test("main catalog uses YouTube Music and YouTube only", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const dir = await mkdtemp(join(tmpdir(), "roomwave-search-test-"));
  const python = join(dir, "python.cjs");
  await writeFile(python, `#!${process.execPath}
console.log(JSON.stringify({ ok: true, best: { provider: 'youtube', videoId: 'seJ83vfHoIU', title: 'Mary On A Cross', artist: 'Ghost', durationSec: 245, score: 100 } }));
`, { mode: 0o700 });
  process.env.YTMUSIC_PYTHON = python;
  process.env.YOUTUBE_API_KEY = "test-placeholder";
  const details = { items: [{ id: "seJ83vfHoIU", snippet: { title: "Mary On A Cross", channelTitle: "Ghost - Topic" }, contentDetails: { duration: "PT4M5S" }, status: { embeddable: false } }] };
  try {
    await t.test("YouTube Music result is preferred without an Audius request", async () => {
      globalThis.fetch = async () => { throw new Error("Unexpected network request"); };
      const track = await searchTrack("Ghost - Mary On A Cross");
      assert.equal(track?.provider, "youtube");
      assert.equal(track?.externalId, "seJ83vfHoIU");
      assert.equal(track?.artist, "Ghost");
      assert.equal(await searchTrack("   "), null);
    });
    await t.test("explicit YouTube Music link keeps its video ID", async () => {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.host, "www.googleapis.com");
        assert.equal(url.pathname, "/youtube/v3/videos");
        assert.equal(url.searchParams.get("id"), "seJ83vfHoIU");
        return Response.json(details);
      };
      const track = await searchTrack("https://music.youtube.com/watch?v=seJ83vfHoIU");
      assert.equal(track?.externalId, "seJ83vfHoIU");
      assert.equal(track?.durationSec, 245);
    });
    await t.test("YouTube Data API is the fallback when music search is unavailable", async () => {
      process.env.YTMUSIC_PYTHON = join(dir, "missing");
      const calls: string[] = [];
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.host, "www.googleapis.com");
        assert.equal(url.searchParams.has("videoEmbeddable"), false);
        calls.push(url.pathname);
        return Response.json(url.pathname.endsWith("/search") ? { items: [{ id: { videoId: "seJ83vfHoIU" } }] } : details);
      };
      assert.equal((await searchTrack("Ghost - Mary On A Cross"))?.externalId, "seJ83vfHoIU");
      assert.deepEqual(calls, ["/youtube/v3/search", "/youtube/v3/videos"]);
    });
    await t.test("provider failure is distinguishable from no match", async () => {
      globalThis.fetch = async () => new Response(null, { status: 403 });
      await assert.rejects(searchTrack("Ghost"), /403/);
      globalThis.fetch = async () => Response.json({ items: [] });
      assert.equal(await searchTrack("Ghost"), null);
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    await rm(dir, { recursive: true, force: true });
  }
});
