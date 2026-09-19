import {
  resolveYoutubeAudioSource,
} from "./youtube-audio.js";


export interface RadioTrack {
  provider: string;

  externalId?:
    string | null;

  title: string;

  artist: string;

  durationSec?:
    number | null;

  sourceUrl?:
    string | null;
}


export interface RadioSource {
  provider: string;

  url: string;

  title: string;

  artist: string;

  durationSec?:
    number | null;
}


async function sourceAvailable(
  url: string,
): Promise<boolean> {

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      15000,
    );

  try {

    const response =
      await fetch(
        url,
        {
          method:
            "GET",

          signal:
            controller.signal,
        },
      );


    /*
     * Não precisamos consumir a música.
     * Basta confirmar que o Gateway
     * começou a entregar áudio.
     */
    if (!response.ok) {

      console.log(
        `📻 Fonte recusada: HTTP ${response.status}`,
      );

      await response.body?.cancel();

      return false;
    }


    const contentType =
      response.headers
        .get(
          "content-type",
        ) ?? "";


    if (
      !contentType
        .toLowerCase()
        .startsWith(
          "audio/",
        )
    ) {

      console.log(
        `📻 Content-Type inválido: ${contentType || "(vazio)"}`,
      );

      await response.body?.cancel();

      return false;
    }


    await response.body?.cancel();


    console.log(
      `✅ Fonte rádio disponível: ${contentType}`,
    );

    return true;

  } catch (
    error
  ) {

    console.log(
      "📻 Fonte indisponível:",
      error instanceof Error
        ? error.message
        : error,
    );

    return false;

  } finally {

    clearTimeout(
      timeout,
    );
  }
}


export async function resolveRadioSource(
  track: RadioTrack,
): Promise<RadioSource | null> {

  const provider =
    track.provider
      .trim()
      .toLowerCase();


  /*
   * ===================================
   * YOUTUBE
   * ===================================
   */

  if (
    provider === "youtube" &&
    track.externalId
  ) {

    const source =
      await resolveYoutubeAudioSource({
        videoId:
          track.externalId,

        title:
          track.title,

        artist:
          track.artist,

        durationSec:
          track.durationSec,
      });


    if (!source) {
      return null;
    }


    const available =
      await sourceAvailable(
        source.url,
      );


    if (!available) {

      console.log(
        `⛔ Fonte YouTube indisponível: ${track.artist} - ${track.title}`,
      );

      return null;
    }


    return source;
  }


  /*
   * ===================================
   * FONTES DIRETAS
   * ===================================
   */

  if (
    track.sourceUrl &&
    /^https?:\/\//i.test(
      track.sourceUrl,
    )
  ) {

    const source: RadioSource = {
      provider,

      url:
        track.sourceUrl,

      title:
        track.title,

      artist:
        track.artist,

      durationSec:
        track.durationSec,
    };


    const available =
      await sourceAvailable(
        source.url,
      );


    if (!available) {
      return null;
    }


    return source;
  }


  console.log(
    `📻 Sem RadioSource para provider=${track.provider}`,
  );

  return null;
}
