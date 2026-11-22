import { describe, expect, it } from "vitest";
import { scoreGame } from "../src/core/scoring/frames";
import type { ScoringRule } from "../src/core/scoring/graph/types";
import { parseGameLine } from "../src/presentation/app/comparison";
import recorded from "./fixtures/original-scoring.json";

interface RecordedGame {
  rule: string;
  input: string;
  cumulative: number[];
  total: number | null;
  complete: boolean;
  error: string | null;
}

const PERFECT = Array<number>(12).fill(10);

describe("scoreGame", () => {
  it("scores a perfect game as 300 under standard rules", () => {
    const score = scoreGame("standard", PERFECT);
    expect(score.total).toBe(300);
    expect(score.complete).toBe(true);
    expect(score.frames.map((frame) => frame.cumulative)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
  });

  it("holds back a frame's score until its bonus rolls are thrown", () => {
    const score = scoreGame("standard", [10, 9, 1, 8]);
    expect(score.frames.map((frame) => frame.cumulative)).toEqual([20, 38, null]);
    expect(score.complete).toBe(false);
  });

  it("needs no bonus rolls under current-frame scoring", () => {
    const score = scoreGame("current-frame", PERFECT);
    expect(score.total).toBe(300);
    expect(score.complete).toBe(true);
    expect(score.rollsUsed).toBe(10);
    expect(scoreGame("current-frame", [9, 1]).total).toBe(19);
  });
});

/**
 * Inputs and the score sheet the original build showed for them: every frame's running
 * total, the total and the error message.
 */
describe("score sheets recorded from the original build", () => {
  it.each(recorded as RecordedGame[])("$rule: $input", (game) => {
    const entry = parseGameLine(game.input);
    const score = scoreGame(game.rule as ScoringRule, entry.rolls);
    const shown = entry.rolls.length > 0 || entry.error !== null;

    expect(entry.error?.message ?? null).toBe(game.error);
    expect(shown ? score.frames.flatMap((frame) => (frame.cumulative === null ? [] : [frame.cumulative])) : []).toEqual(game.cumulative);
    expect(shown && score.frames.length > 0 ? score.total : null).toBe(game.total);
    expect(shown && score.complete).toBe(game.complete);
  });
});
