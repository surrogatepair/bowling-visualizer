import { describe, expect, it } from "vitest";
import { parseRolls } from "../src/core/notation";

function rolls(text: string): readonly number[] {
  const result = parseRolls(text);
  if (!result.ok) throw new Error(result.error.message);
  return result.rolls;
}

function error(text: string): string {
  const result = parseRolls(text);
  if (result.ok) throw new Error("expected a notation error");
  return result.error.message;
}

describe("parseRolls", () => {
  it("reads strikes, spares, misses and digits", () => {
    expect(rolls("X 9/ 81 -5 F3 G/")).toEqual([10, 9, 1, 8, 1, 0, 5, 0, 3, 0, 10]);
  });

  it("accepts lower case and any mix of separators", () => {
    expect(rolls("x|9/\t8 1\n")).toEqual([10, 9, 1, 8, 1]);
    expect(rolls("")).toEqual([]);
  });

  it("reads the bonus rolls of the tenth frame", () => {
    expect(rolls("X X X X X X X X X XXX")).toHaveLength(12);
    expect(rolls("9- 9- 9- 9- 9- 9- 9- 9- 9- 9/X")).toHaveLength(21);
  });

  it("explains what is wrong with the input", () => {
    expect(error("/")).toBe('"/" (spare) cannot appear as the first roll of a frame');
    expect(error("5X")).toBe('"X" (strike) cannot appear after the first roll of a rack');
    expect(error("X X X X X X X X X X/")).toBe('"/" (spare) cannot follow a strike or spare on a fresh rack');
    expect(error("56")).toBe("R1 + R2 = 5 + 6 exceeds 10");
    expect(error("X X X X X X X X X X56")).toBe("F10 R2 + R3 = 5 + 6 exceeds 10");
    expect(error("9- 9- 9- 9- 9- 9- 9- 9- 9- 9- 1")).toBe("input continues after the game is complete");
    expect(error("9a")).toBe('unexpected character "A"');
  });

  it("keeps the rolls read before an error", () => {
    const result = parseRolls("X 9/ /");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.rolls).toEqual([10, 9, 1]);
  });
});
