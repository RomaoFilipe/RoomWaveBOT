import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { resolveMediaSource, youtubeVideoId } from "../src/resolver/youtube.ts";
import { resolveAudioTrack } from "../src/resolver/index.ts";
import { AudioEngine } from "../src/ffmpeg/index.ts";
import { AudioQueue } from "../src/queue/index.ts";
import { StreamHub } from "../src/stream/index.ts";

const id = "seJ83vfHoIU";
const source = `https://www.youtube.com/watch?v=${id}`;

async function until(check: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for expected state");
    await delay(10);
  }
}

test("YouTube URL parsing preserves the requested video", () => {
  for (const input of [id, source, `https://music.youtube.com/watch?v=${id}&list=xyz`, `https://youtu.be/${id}?t=3`, `https://youtube.com/shorts/${id}`]) {
    assert.equal(youtubeVideoId(input), id);
    assert.equal(resolveAudioTrack(input).source, source);
  }
  assert.equal(youtubeVideoId("https://youtube.com.example.org/watch?v=" + id), null);
  assert.throws(() => youtubeVideoId("https://youtube.com/playlist?list=x"), /VIDEO_ID_REQUIRED/);
  assert.throws(() => youtubeVideoId("https://user:secret@youtube.com/watch?v=" + id), /INVALID_URL/);
});

test("YouTube resolver and encoder lifecycle", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "roomwave-audio-test-"));
  const saved = { ...process.env };
  const extractor = join(dir, "extractor.cjs");
  const encoder = join(dir, "encoder.cjs");
  await writeFile(extractor, `#!${process.execPath}
const mode = process.env.ROOMWAVE_TEST_MODE;
if (process.argv.includes('--cookies') || !process.argv.includes('--no-cookies') || !process.argv.includes('--no-cookies-from-browser')) { console.error('Account cookies must be disabled'); process.exit(2); }
if (mode === 'auth') { console.error("Sign in to confirm you're not a bot https://secret.invalid/token"); process.exit(1); }
if (mode === 'malformed') { console.log('bad JSON'); process.exit(0); }
const result = { id: mode === 'mismatch' ? 'abcdefghijk' : '${id}', acodec: 'opus', url: 'https://audio.example.org/audio?secret=123', http_headers: { 'User-Agent': 'fixture', Invalid: 'x\\r\\nInjected: value' } };
if (mode === 'slow') setTimeout(() => console.log(JSON.stringify(result)), 30000);
else console.log(JSON.stringify(result));
`, { mode: 0o700 });
  await writeFile(encoder, `#!${process.execPath}
const mode = process.env.ROOMWAVE_TEST_ENCODER;
if (mode === 'fail') { console.error('secret URL and harbor password'); process.exit(1); }
if (mode === 'silent') process.exit(0);
setTimeout(() => { process.stdout.write('out_time_'); setTimeout(() => process.stdout.write('us=500000\\nprogress=continue\\n'), 20); }, 100);
if (mode === 'end') setTimeout(() => process.exit(0), 250);
else setInterval(() => {}, 1000);
`, { mode: 0o700 });
  process.env.YTDLP_BIN = extractor;
  process.env.YTDLP_COOKIES_FILE = "/unused/legacy-account-cookies.txt";
  process.env.FFMPEG_BIN = encoder;
  const engine = new AudioEngine(new AudioQueue(), new StreamHub());
  try {
    await t.test("resolves audio and sanitizes headers", async () => {
      const media = await resolveMediaSource(source, new AbortController().signal);
      assert.equal(media.url, "https://audio.example.org/audio?secret=123");
      assert.deepEqual(media.headers, { "User-Agent": "fixture" });
      assert.deepEqual(await resolveMediaSource("https://example.org/direct.mp3", new AbortController().signal), { url: "https://example.org/direct.mp3" });
    });
    await t.test("rejects malformed output and a different recording", async () => {
      for (const [mode, code] of [["malformed", /INVALID_RESPONSE/], ["mismatch", /AUDIO_UNAVAILABLE/]] as const) {
        process.env.ROOMWAVE_TEST_MODE = mode;
        await assert.rejects(resolveMediaSource(source, new AbortController().signal), code);
      }
    });
    await t.test("anonymous access rejection stays visible with source identity", async () => {
      process.env.ROOMWAVE_TEST_MODE = "auth";
      await engine.play(resolveAudioTrack(source));
      await until(() => engine.status().state === "ERROR");
      await delay(50);
      assert.equal(engine.status().state, "ERROR");
      assert.equal(engine.status().lastError, "YOUTUBE_ACCESS_DENIED");
      assert.equal(engine.status().current?.source, source);
    });
    await t.test("missing extractor is reported", async () => {
      process.env.YTDLP_BIN = join(dir, "absent");
      await assert.rejects(resolveMediaSource(source, new AbortController().signal), /EXTRACTOR_NOT_INSTALLED/);
      process.env.YTDLP_BIN = extractor;
    });
    await t.test("stop cancels in-flight extraction", async () => {
      process.env.ROOMWAVE_TEST_MODE = "slow";
      await engine.play(resolveAudioTrack(source));
      assert.equal(engine.status().state, "LOADING");
      await delay(100);
      engine.stop();
      await delay(100);
      assert.equal(engine.status().state, "IDLE");
      assert.equal(engine.status().lastError, null);
    });
    await t.test("PLAYING requires encoder output, with pause/resume/stop", async () => {
      delete process.env.ROOMWAVE_TEST_MODE;
      await engine.play(resolveAudioTrack(source));
      assert.equal(engine.status().state, "LOADING");
      assert.equal(engine.status().startedAt, null);
      await until(() => engine.status().state === "PLAYING");
      assert.ok(engine.status().startedAt);
      assert.equal(engine.status().current?.source, source); // no expiring URL in status
      assert.equal(engine.pause(), true);
      assert.equal(engine.status().state, "PAUSED");
      assert.equal(engine.resume(), true);
      engine.pause();
      engine.stop();
      assert.equal(engine.status().state, "IDLE");
    });
    await t.test("encoder failure and no audio output are not success", async () => {
      for (const [mode, code] of [["fail", "FFMPEG_PLAYBACK_FAILED"], ["silent", "AUDIO_NO_OUTPUT"]]) {
        process.env.ROOMWAVE_TEST_ENCODER = mode;
        await engine.play(resolveAudioTrack(source));
        await until(() => engine.status().state === "ERROR");
        assert.equal(engine.status().lastError, code);
        assert.equal(engine.status().current?.source, source);
      }
    });
    await t.test("normal completion becomes IDLE", async () => {
      process.env.ROOMWAVE_TEST_ENCODER = "end";
      await engine.play(resolveAudioTrack(source));
      await until(() => engine.status().state === "PLAYING");
      await until(() => engine.status().state === "IDLE");
      assert.equal(engine.status().current, null);
    });
    await t.test("a queued direct track can follow a failed YouTube request", async () => {
      process.env.ROOMWAVE_TEST_MODE = "auth";
      delete process.env.ROOMWAVE_TEST_ENCODER;
      await engine.play(resolveAudioTrack(source));
      await engine.enqueue(resolveAudioTrack("https://example.org/direct.mp3"));
      await until(() => engine.status().state === "PLAYING");
      assert.equal(engine.status().current?.source, "https://example.org/direct.mp3");
    });
  } finally {
    engine.stop();
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    await rm(dir, { recursive: true, force: true });
  }
});
