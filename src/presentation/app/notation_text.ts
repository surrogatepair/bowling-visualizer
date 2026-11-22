/** Turns pin counts back into roll notation, the inverse of parsing. */
import { scoreGame, type RollMark } from "../../core/scoring/frames";

function markText(mark: RollMark): string {
  if (mark.kind === "strike") return "X";
  if (mark.kind === "spare") return "/";
  return mark.pins === 0 ? "-" : String(mark.pins);
}

/**
 * Formats rolls frame by frame (`X 9/ 81`); the rolls of the tenth frame are written
 * without spaces (`XX9`).
 */
export function formatRolls(rolls: readonly number[]): string {
  return scoreGame("standard", rolls)
    .frames.map((frame) => frame.rolls.map((roll) => markText(roll.mark)).join(""))
    .join(" ");
}
