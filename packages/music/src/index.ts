export type {
  MusicTrack,
} from "./types.js";

export {
  searchAudiusTrack,
} from "./audius.js";

export {
  searchYouTubeTrack,
} from "./youtube.js";

export {
  searchNodeLinkTrack,
} from "./nodelink.js";

import {
  searchNodeLinkTrack,
} from "./nodelink.js";

export async function searchTrack(
  query: string,
) {
  if (!query.trim()) {
    return null;
  }

  /*
   * Catálogo principal do RoomWave:
   *
   * 1. YouTube Music via NodeLink
   * 2. YouTube via NodeLink
   *
   * Audius deixa de participar no caminho
   * normal de pesquisa.
   */
  return searchNodeLinkTrack(
    query,
  );
}
