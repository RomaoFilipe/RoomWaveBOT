import {
  spawnSync
} from "node:child_process";

export function ffmpegHealth() {

  const result =
    spawnSync(
      "ffmpeg",
      ["-version"],
      {
        encoding:
          "utf8"
      }
    );

  return {
    available:
      result.status === 0,

    version:
      result.stdout
        ?.split("\n")[0]
        ?.trim() || null
  };
}
