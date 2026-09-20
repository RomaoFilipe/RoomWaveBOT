import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type Socket } from "node:net";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { AudioEngine } from "../src/ffmpeg/index.ts";
import { AudioQueue } from "../src/queue/index.ts";
import { StreamHub } from "../src/stream/index.ts";
import { resolveAudioTrack } from "../src/resolver/index.ts";

test("real FFmpeg sends MP3 to an isolated Harbor-compatible HTTP receiver", async () => {
  const saved = { ...process.env };
  const dir = await mkdtemp(join(tmpdir(), "roomwave-harbor-test-"));
  const filename = join(dir, "tone.wav");
  const generated = spawnSync("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", filename]);
  assert.equal(generated.status, 0, "FFmpeg must be installed for this integration test");
  let bytes = 0;
  let requestPath = "";
  let contentType = "";
  const sockets = new Set<Socket>();
  const receiver = createServer(socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let headers = Buffer.alloc(0);
    let connected = false;
    socket.on("data", chunk => {
      if (connected) { bytes += chunk.length; return; }
      headers = Buffer.concat([headers, chunk]);
      const boundary = headers.indexOf("\r\n\r\n");
      if (boundary < 0) return;
      const text = headers.subarray(0, boundary).toString();
      requestPath = text.split(" ")[1];
      contentType = /^content-type: (.+)$/im.exec(text)?.[1].trim() ?? "";
      bytes += headers.length - boundary - 4;
      connected = true;
      // Icecast source connections send audio until disconnect, without the
      // HTTP request-body framing required by Node's general HTTP parser.
      socket.write("HTTP/1.0 200 OK\r\n\r\n");
    });
  });
  const engine = new AudioEngine(new AudioQueue(), new StreamHub());
  try {
    await new Promise<void>((resolve, reject) => {
      receiver.once("error", reject);
      receiver.listen(0, "127.0.0.1", resolve);
    });
    const address = receiver.address();
    assert.ok(address && typeof address !== "string");
    process.env.ROOMWAVE_AUDIO_DIR = dir;
    process.env.ROOMWAVE_HARBOR_HOST = "127.0.0.1";
    process.env.ROOMWAVE_HARBOR_PORT = String(address.port);
    process.env.ROOMWAVE_HARBOR_USER = "source";
    process.env.ROOMWAVE_HARBOR_PASSWORD = "test-placeholder";
    process.env.ROOMWAVE_HARBOR_MOUNT = "test-only";
    process.env.FFMPEG_BIN = "ffmpeg";
    // AUDIO_DIR is captured on import; create the internal track explicitly.
    const track = { ...resolveAudioTrack("https://example.org/test.mp3"), source: filename };
    await engine.play(track);
    let playing = false;
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const status = engine.status();
      if (status.state === "PLAYING") playing = true;
      assert.notEqual(status.state, "ERROR", status.lastError ?? "Unexpected engine failure");
      if (playing && status.state === "IDLE") break;
      await delay(10);
    }
    assert.equal(playing, true);
    assert.equal(engine.status().state, "IDLE");
    assert.equal(requestPath, "/test-only");
    assert.equal(contentType, "audio/mpeg");
    assert.ok(bytes > 10000, `Expected encoded audio, received ${bytes} bytes`);
  } finally {
    engine.stop();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => receiver.close(() => resolve()));
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    await rm(dir, { recursive: true, force: true });
  }
});
