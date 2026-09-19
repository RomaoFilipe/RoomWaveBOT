import { config } from "dotenv";
import { fileURLToPath } from "node:url";

import { searchTrack } from "./index.js";

config({
  path: fileURLToPath(
    new URL("../../../.env", import.meta.url),
  ),
});

const query =
  process.argv.slice(2).join(" ") ||
  "Avicii Levels";

console.log("");
console.log(`🔎 Searching: ${query}`);
console.log("");

const track = await searchTrack(query);

if (!track) {
  console.log("❌ Música não encontrada");
  process.exit(1);
}

console.log("🎵 Resultado");
console.log("--------------------------");
console.log(`Artist:   ${track.artist}`);
console.log(`Title:    ${track.title}`);
console.log(`Duration: ${track.durationSec}s`);
console.log(`Provider: ${track.provider}`);
console.log(`ID:       ${track.externalId}`);
console.log(`Artwork:  ${track.artworkUrl}`);
console.log("");
