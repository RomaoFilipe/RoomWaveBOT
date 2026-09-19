import {
  youtubeGatewayUrl,
} from "./audio-gateway.js";


export interface YoutubeAudioRequest {
  videoId: string;

  title: string;

  artist: string;

  durationSec?:
    number | null;
}


export interface YoutubeAudioSource {
  provider:
    "youtube";

  url:
    string;

  title:
    string;

  artist:
    string;

  durationSec?:
    number | null;
}


export async function
resolveYoutubeAudioSource(
  track:
    YoutubeAudioRequest,
):
Promise<YoutubeAudioSource | null> {

  console.log(
    `🎧 Audio Resolver: ${track.artist} - ${track.title}`,
  );

  console.log(
    `🆔 YouTube videoId: ${track.videoId}`,
  );


  const url =
    youtubeGatewayUrl(
      track.videoId,
    );


  return {
    provider:
      "youtube",

    url,

    title:
      track.title,

    artist:
      track.artist,

    durationSec:
      track.durationSec,
  };
}
