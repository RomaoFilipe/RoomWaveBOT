import type {
  AudioTrack
} from "../types";

export class AudioQueue {

  private readonly items:
    AudioTrack[] = [];

  add(
    track: AudioTrack
  ): number {

    this.items.push(track);

    return this.items.length;
  }

  next():
    AudioTrack | null {

    return (
      this.items.shift() ??
      null
    );
  }

  clear(): void {
    this.items.length = 0;
  }

  list(): AudioTrack[] {
    return [...this.items];
  }

  get length(): number {
    return this.items.length;
  }
}
