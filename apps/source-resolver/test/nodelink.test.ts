import { test } from "node:test";
import { strict as assert } from "node:assert";
import { assertExactTrack } from "../src/nodelink.js";
const id = "lsBmNKMTrtw";
test("accepts only the requested YouTube recording", () => {
  const track = (identifier: string, sourceName: string, isStream = false) => ({ encoded: "", info: { identifier, sourceName, isStream } });
  assert.doesNotThrow(() => assertExactTrack(track(id, "youtube"), id));
  assert.throws(() => assertExactTrack(track(id, "soundcloud"), id));
  assert.throws(() => assertExactTrack(track("other-video", "youtube"), id));
  assert.throws(() => assertExactTrack(track(id, "youtube", true), id));
});
