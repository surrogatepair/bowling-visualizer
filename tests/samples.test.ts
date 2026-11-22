import { describe, expect, it } from "vitest";
import { parseRolls } from "../src/core/notation";
import { scoreGame } from "../src/core/scoring/frames";
import { SAMPLES, SAMPLE_RANDOM_COUNT, generateSample } from "../src/presentation/app/samples";

/** Small deterministic generator, so failures are reproducible. */
function randoms(seed: number): number[] {
  let state = seed >>> 0;
  return Array.from({ length: SAMPLE_RANDOM_COUNT }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  });
}

describe("generateSample", () => {
  it.each(SAMPLES.map((sample) => sample.id))("%s always yields a complete, valid game", (id) => {
    for (let seed = 1; seed <= 200; seed++) {
      const text = generateSample(id, randoms(seed));
      const parsed = parseRolls(text);
      expect(parsed.ok, text).toBe(true);
      if (parsed.ok) expect(scoreGame("standard", parsed.rolls).complete, text).toBe(true);
    }
  });

  it("knows the fixed samples", () => {
    expect(generateSample("perfect", randoms(1))).toBe("X X X X X X X X X XXX");
    expect(scoreGame("standard", (parseRolls(generateSample("perfect", randoms(1))) as { rolls: number[] }).rolls).total).toBe(300);
  });
});
