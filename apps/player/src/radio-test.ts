import {
  radioPush,
  radioQueue,
} from "./liquidsoap.js";

const tracks = [
  "/home/ubuntu/roomwave/radio/test/track-1.mp3",
  "/home/ubuntu/roomwave/radio/test/track-2.mp3",
];

for (
  const track
  of tracks
) {
  console.log(
    await radioPush(
      track,
    ),
  );
}

console.log("");
console.log(
  "===== LIQUIDSOAP QUEUE =====",
);

console.log(
  await radioQueue(),
);
