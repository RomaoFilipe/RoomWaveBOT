export type { MusicTrack } from "./types.js";
export { searchYouTubeTrack } from "./youtube.js";

import { searchYouTubeTrack } from "./youtube.js";

export async function searchTrack(query: string) {
  return searchYouTubeTrack(query);
}
