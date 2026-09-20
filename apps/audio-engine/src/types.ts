export type PlaybackState =
  | "IDLE"
  | "LOADING"
  | "PLAYING"
  | "PAUSED"
  | "ERROR";

export interface AudioTrack {
  id: string;
  title: string;
  source: string;
  requestedAt: string;
}

export interface EngineStatus {
  state: PlaybackState;
  current: AudioTrack | null;
  queueLength: number;
  listeners: number;
  startedAt: string | null;
  lastError: string | null;
}
