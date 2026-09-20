import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import type { AudioTrack, EngineStatus, PlaybackState } from "../types";
import { AudioQueue } from "../queue";
import { StreamHub } from "../stream";
import { resolveMediaSource, type MediaSource } from "../resolver/youtube";

type Encoder = ChildProcessByStdio<null, Readable, Readable>;

export class AudioEngine {
  private process: Encoder | null = null;
  private state: PlaybackState = "IDLE";
  private current: AudioTrack | null = null;
  private startedAt: string | null = null;
  private lastError: string | null = null;
  private generation = 0;
  private resolution: AbortController | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly queue: AudioQueue, private readonly stream: StreamHub) {}

  private harborUrl(): string {
    const user = encodeURIComponent(process.env.ROOMWAVE_HARBOR_USER || "source");
    const password = encodeURIComponent(process.env.ROOMWAVE_HARBOR_PASSWORD || "roomwave-local-harbor");
    const host = process.env.ROOMWAVE_HARBOR_HOST || "127.0.0.1";
    const port = Number(process.env.ROOMWAVE_HARBOR_PORT || 3211);
    const mount = (process.env.ROOMWAVE_HARBOR_MOUNT || "roomwave-engine").replace(/^\/+/, "");
    return `icecast://${user}:${password}@${host}:${port}/${mount}`;
  }

  private ffmpegArgs(media: MediaSource): string[] {
    const args = ["-nostdin", "-hide_banner", "-loglevel", "warning", "-nostats", "-progress", "pipe:1", "-re"];
    if (/^https?:\/\//.test(media.url)) {
      args.push("-rw_timeout", "15000000", "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5");
      const headers = Object.entries(media.headers ?? {}).map(([key, value]) => `${key}: ${value}\r\n`).join("");
      if (headers) args.push("-headers", headers);
    }
    args.push("-i", media.url, "-vn", "-map", "0:a:0", "-map_metadata", "-1",
      "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", "-ac", "2",
      "-content_type", "audio/mpeg", "-f", "mp3", this.harborUrl());
    return args;
  }

  async play(track: AudioTrack): Promise<void> {
    this.stopInternal();
    const generation = this.generation;
    this.current = track;
    this.state = "LOADING";
    this.lastError = null;
    const controller = new AbortController();
    this.resolution = controller;
    // HTTP returns LOADING immediately; /stop can cancel resolution while it runs.
    void this.start(track, generation, controller);
  }

  private async start(track: AudioTrack, generation: number, controller: AbortController): Promise<void> {
    try {
      const media = await resolveMediaSource(track.source, controller.signal);
      if (generation !== this.generation) return;
      this.resolution = null;
      const child = spawn(process.env.FFMPEG_BIN || "ffmpeg", this.ffmpegArgs(media), {
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.process = child;
      let progress = "";
      this.startupTimer = setTimeout(() => {
        if (generation === this.generation && this.state === "LOADING") {
          this.fail("AUDIO_START_TIMEOUT");
        }
      }, 20000);
      this.startupTimer.unref();

      child.stdout.on("data", (chunk: Buffer) => {
        if (generation !== this.generation) return;
        progress += chunk.toString();
        const lines = progress.split("\n");
        progress = lines.pop()!.slice(-4096);
        for (const line of lines) {
          const match = /^out_time_us=(\d+)/.exec(line);
          if (match && Number(match[1]) > 0 && this.state === "LOADING") {
            this.clearStartupTimer();
            this.state = "PLAYING";
            this.startedAt = new Date().toISOString();
            console.log(`▶ Playing: ${track.title}`);
          }
        }
      });
      // Drain stderr but never log raw FFmpeg output: it may contain the Harbor
      // password, cookies and signed YouTube URLs. Expose stable error codes.
      child.stderr.resume();
      child.once("error", () => {
        if (generation === this.generation) this.fail("FFMPEG_START_FAILED");
      });
      child.once("close", (code, signal) => {
        if (generation !== this.generation) return;
        this.clearStartupTimer();
        this.process = null;
        if (code !== 0 || signal !== null || this.startedAt === null) {
          this.fail(code === 0 ? "AUDIO_NO_OUTPUT" : "FFMPEG_PLAYBACK_FAILED");
          return;
        }
        this.current = null;
        this.startedAt = null;
        this.state = "IDLE";
        this.advanceQueued(generation);
      });
    } catch (error) {
      if (generation === this.generation) {
        this.fail(error instanceof Error ? error.message : "AUDIO_SOURCE_FAILED");
      }
    }
  }

  private fail(message: string): void {
    const track = this.current;
    this.stopInternal();
    // Retain identity so the AutoDJ can associate the error with its queue item.
    this.current = track;
    this.state = "ERROR";
    this.lastError = message;
    console.error(`Audio Engine: ${message}`);
    this.advanceQueued(this.generation);
  }

  private advanceQueued(generation: number): void {
    if (!this.queue.length) return; // Keep ERROR visible when there is no next item.
    setImmediate(() => {
      if (generation === this.generation) void this.playNext();
    });
  }

  async enqueue(track: AudioTrack): Promise<number> {
    const length = this.queue.add(track);
    if (this.state === "IDLE" || this.state === "ERROR") await this.playNext();
    return length;
  }

  async playNext(): Promise<void> {
    const next = this.queue.next();
    if (next) await this.play(next);
  }

  pause(): boolean {
    if (!this.process || this.state !== "PLAYING") return false;
    this.process.kill("SIGSTOP");
    this.state = "PAUSED";
    return true;
  }

  resume(): boolean {
    if (!this.process || this.state !== "PAUSED") return false;
    this.process.kill("SIGCONT");
    this.state = "PLAYING";
    return true;
  }

  stop(): void {
    this.stopInternal();
    this.lastError = null;
    this.queue.clear();
  }

  async skip(): Promise<void> {
    this.stopInternal();
    this.lastError = null;
    await this.playNext();
  }

  private clearStartupTimer(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = null;
  }

  private stopInternal(): void {
    ++this.generation;
    this.clearStartupTimer();
    this.resolution?.abort();
    this.resolution = null;
    const child = this.process;
    this.process = null;
    this.current = null;
    this.startedAt = null;
    this.state = "IDLE";
    if (child) {
      // Resume a paused process so it can handle SIGTERM.
      child.kill("SIGCONT");
      child.kill("SIGTERM");
      const timer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, 2000);
      timer.unref();
      child.once("close", () => clearTimeout(timer));
    }
  }

  status(): EngineStatus {
    return {
      state: this.state, current: this.current, queueLength: this.queue.length,
      listeners: this.stream.listenerCount, startedAt: this.startedAt, lastError: this.lastError,
    };
  }

  queueItems(): AudioTrack[] { return this.queue.list(); }
}
