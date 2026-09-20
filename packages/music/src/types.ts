export interface MusicTrack {
  provider:
    | "audius"
    | "youtube";

  externalId: string;

  title: string;
  artist: string;

  durationSec:
    number |
    null;

  artworkUrl:
    string |
    null;

  sourceUrl: string;
}
