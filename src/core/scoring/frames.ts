/**
 * Frame-by-frame scoring of a (possibly unfinished) game for the score sheet.
 */
import type { ScoringRule } from "./graph/types";
import { CURRENT_FRAME_SPARE, CURRENT_FRAME_STRIKE } from "./graph/walker";

export const FRAME_COUNT = 10;

/** How a roll is written on the score sheet. */
export type RollMark = { readonly kind: "pins"; readonly pins: number } | { readonly kind: "strike" } | { readonly kind: "spare" };

export interface SheetRoll {
  /** Box on the score sheet, counted from the left; two per frame, three in a standard tenth. */
  readonly box: number;
  readonly pins: number;
  readonly mark: RollMark;
}

export interface FrameScore {
  /** Zero-based frame index. */
  readonly frame: number;
  readonly rolls: readonly SheetRoll[];
  /** Running total up to this frame, once nothing can change it any more. */
  readonly cumulative: number | null;
}

export interface GameScore {
  readonly rule: ScoringRule;
  readonly frames: readonly FrameScore[];
  /** Pins plus all bonuses credited so far. */
  readonly total: number;
  readonly complete: boolean;
  /** Number of input rolls that belong to the game under this rule. */
  readonly rollsUsed: number;
  /** Box the next roll would go into, or null when the game is over. */
  readonly nextBox: number | null;
}

/** Number of roll boxes on the score sheet of a rule. */
export function boxCount(rule: ScoringRule): number {
  return rule === "standard" ? 2 * (FRAME_COUNT - 1) + 3 : 2 * FRAME_COUNT;
}

/** Number of roll boxes in a zero-based frame. */
export function boxesInFrame(rule: ScoringRule, frame: number): number {
  return rule === "standard" && frame === FRAME_COUNT - 1 ? 3 : 2;
}

function pinsMark(pins: number): RollMark {
  return { kind: "pins", pins };
}

function scoreStandard(rolls: readonly number[]): GameScore {
  const frames: FrameScore[] = [];
  let total = 0;
  let running: number | null = 0;
  let cursor = 0;
  let complete = false;
  let nextBox: number | null = 0;

  for (let frame = 0; frame < FRAME_COUNT && cursor < rolls.length; frame++) {
    const firstBox = 2 * frame;
    const first = rolls[cursor]!;
    const sheet: SheetRoll[] = [];
    let settled: number | null = null;
    let score: number;

    if (frame < FRAME_COUNT - 1) {
      if (first === 10) {
        sheet.push({ box: firstBox, pins: 10, mark: { kind: "strike" } });
        const bonus = rolls.slice(cursor + 1, cursor + 3);
        score = 10 + bonus.reduce((a, b) => a + b, 0);
        if (bonus.length === 2) settled = score;
        cursor += 1;
        nextBox = firstBox + 2;
      } else {
        sheet.push({ box: firstBox, pins: first, mark: pinsMark(first) });
        const second = rolls[cursor + 1];
        if (second === undefined) {
          score = first;
          cursor += 1;
          nextBox = firstBox + 1;
        } else if (first + second === 10) {
          sheet.push({ box: firstBox + 1, pins: second, mark: { kind: "spare" } });
          const bonus = rolls[cursor + 2];
          score = 10 + (bonus ?? 0);
          if (bonus !== undefined) settled = score;
          cursor += 2;
          nextBox = firstBox + 2;
        } else {
          sheet.push({ box: firstBox + 1, pins: second, mark: pinsMark(second) });
          score = first + second;
          settled = score;
          cursor += 2;
          nextBox = firstBox + 2;
        }
      }
    } else {
      // Tenth frame: up to three rolls, each counted once.
      score = 0;
      let standing = 10;
      let fresh = true;
      let thrown = 0;
      let allowed = 2;
      while (thrown < allowed && cursor < rolls.length) {
        const pins = rolls[cursor]!;
        let mark: RollMark;
        if (fresh && pins === 10) mark = { kind: "strike" };
        else if (!fresh && pins === standing) mark = { kind: "spare" };
        else mark = pinsMark(pins);
        sheet.push({ box: firstBox + thrown, pins, mark });
        score += pins;
        standing -= pins;
        if (standing === 0) {
          // A strike or spare resets the rack and earns the third roll.
          standing = 10;
          fresh = true;
          if (thrown < 2) allowed = 3;
        } else {
          fresh = false;
        }
        thrown += 1;
        cursor += 1;
      }
      complete = thrown === allowed;
      if (complete) settled = score;
      nextBox = complete ? null : firstBox + thrown;
    }

    total += score;
    running = running !== null && settled !== null ? running + settled : null;
    frames.push({ frame, rolls: sheet, cumulative: running });
  }
  return { rule: "standard", frames, total, complete, rollsUsed: cursor, nextBox };
}

function scoreCurrentFrame(rolls: readonly number[]): GameScore {
  const frames: FrameScore[] = [];
  let total = 0;
  let cursor = 0;
  let nextBox: number | null = 0;
  let completedFrames = 0;

  for (let frame = 0; frame < FRAME_COUNT && cursor < rolls.length; frame++) {
    const firstBox = 2 * frame;
    const first = rolls[cursor]!;
    const sheet: SheetRoll[] = [];
    let settled = true;
    let score: number;
    if (first === 10) {
      sheet.push({ box: firstBox, pins: 10, mark: { kind: "strike" } });
      score = CURRENT_FRAME_STRIKE;
      cursor += 1;
    } else {
      sheet.push({ box: firstBox, pins: first, mark: pinsMark(first) });
      const second = rolls[cursor + 1];
      if (second === undefined) {
        score = first;
        settled = false;
        cursor += 1;
      } else if (first + second === 10) {
        sheet.push({ box: firstBox + 1, pins: second, mark: { kind: "spare" } });
        score = CURRENT_FRAME_SPARE + first;
        cursor += 2;
      } else {
        sheet.push({ box: firstBox + 1, pins: second, mark: pinsMark(second) });
        score = first + second;
        cursor += 2;
      }
    }
    total += score;
    if (settled) completedFrames += 1;
    nextBox = settled ? firstBox + 2 : firstBox + 1;
    frames.push({ frame, rolls: sheet, cumulative: settled ? total : null });
  }
  const complete = completedFrames === FRAME_COUNT;
  return { rule: "current-frame", frames, total, complete, rollsUsed: cursor, nextBox: complete ? null : nextBox };
}

/** Scores the rolls thrown so far under the given rule. */
export function scoreGame(rule: ScoringRule, rolls: readonly number[]): GameScore {
  return rule === "standard" ? scoreStandard(rolls) : scoreCurrentFrame(rolls);
}
