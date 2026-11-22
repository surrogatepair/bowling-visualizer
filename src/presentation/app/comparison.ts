/**
 * Comparison mode: several games entered one per line, each optionally coloured, and
 * the preset families of games that can be toggled into the input.
 */
import { parseRolls, type NotationError } from "../../core/notation";
import { parseHexDigits } from "./hex_color";

/** One game as entered by the user. */
export interface GameEntry {
  /** The notation as typed, without the colour and surrounding blanks. */
  readonly text: string;
  /** Pin counts accepted before any error. */
  readonly rolls: readonly number[];
  /** Colour given with a trailing `#rrggbb`, if any. */
  readonly color: string | null;
  readonly error: NotationError | null;
}

const COLOR_SUFFIX = /#([0-9a-fA-F]{6})\s*$/;

/** Parses one line: roll notation with an optional trailing `#rrggbb` colour. */
export function parseGameLine(line: string): GameEntry {
  let notation = line;
  let color: string | null = null;
  const match = COLOR_SUFFIX.exec(line);
  if (match) {
    color = parseHexDigits(match[1]!);
    notation = line.slice(0, match.index);
  }
  const result = parseRolls(notation);
  const text = notation.trim();
  return result.ok ? { text, rolls: result.rolls, color, error: null } : { text, rolls: result.error.rolls, color, error: result.error };
}

/** Splits comparison input into games; blank lines are ignored. */
export function parseComparisonInput(text: string): GameEntry[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map(parseGameLine);
}

/** CSS custom properties that hold the preset colours. */
export type PresetColor =
  | "--preset-spare-start"
  | "--preset-strike-start"
  | "--preset-perfect"
  | "--preset-all-spare"
  | "--preset-all-open"
  | "--preset-tap-band"
  | "--preset-tap-first"
  | "--preset-tap-tenth"
  | "--preset-tap-299";

export const PRESET_COLORS: readonly PresetColor[] = [
  "--preset-spare-start",
  "--preset-strike-start",
  "--preset-perfect",
  "--preset-all-spare",
  "--preset-all-open",
  "--preset-tap-band",
  "--preset-tap-first",
  "--preset-tap-tenth",
  "--preset-tap-299",
];

export interface PresetGame {
  readonly notation: string;
  readonly color: PresetColor;
}

export interface ComparisonPreset {
  readonly id: string;
  readonly label: string;
  /** The preset's own games. */
  readonly games: readonly PresetGame[];
  /** Presets switched on together with this one, after its own games. */
  readonly companions: readonly string[];
}

const NINE_STRIKES = "X X X X X X X X X";

function pinsText(pins: number): string {
  return pins === 0 ? "-" : String(pins);
}

function repeatFrames(frame: string, count: number): string {
  return Array.from({ length: count }, () => frame).join(" ");
}

/**
 * A perfect game interrupted once by `tap` (a nine-count frame): in each of frames
 * 1-9, then on the first and on the second ball of the tenth.
 */
function tapGames(tap: string): PresetGame[] {
  const games: PresetGame[] = [];
  for (let frame = 1; frame <= 9; frame++) {
    const frames = Array.from({ length: 9 }, (_, i) => (i + 1 === frame ? tap : "X"));
    let color: PresetColor = "--preset-tap-band";
    if (frame === 1) color = "--preset-tap-first";
    else if (frame === 2) color = "--preset-spare-start";
    games.push({ notation: `${frames.join(" ")} XXX`, color });
  }
  // A spare on the first two balls of the tenth earns one more ball; an open tenth does not.
  const firstBall = tap.endsWith("/") ? `${tap}X` : tap;
  games.push({ notation: `${NINE_STRIKES} ${firstBall}`, color: "--preset-tap-band" });
  games.push({ notation: `${NINE_STRIKES} X${tap}`, color: "--preset-tap-tenth" });
  return games;
}

function dutchGames(strikeFirst: boolean): PresetGame[] {
  const games: PresetGame[] = [];
  for (let pins = 0; pins <= 9; pins++) {
    const spare = `${pinsText(pins)}/`;
    const notation = strikeFirst
      ? `X ${spare} X ${spare} X ${spare} X ${spare} X ${spare}X`
      : `${spare} X ${spare} X ${spare} X ${spare} X ${spare} X${spare}`;
    games.push({ notation, color: strikeFirst ? "--preset-strike-start" : "--preset-spare-start" });
  }
  return games;
}

function allSpareGames(): PresetGame[] {
  const games: PresetGame[] = [];
  for (let pins = 0; pins <= 9; pins++) {
    const spare = `${pinsText(pins)}/`;
    games.push({ notation: `${repeatFrames(spare, 9)} ${spare}${pinsText(pins)}`, color: "--preset-all-spare" });
  }
  return games;
}

function allOpenGames(): PresetGame[] {
  const frames = ["--"];
  for (let pins = 1; pins <= 9; pins++) frames.push(`-${pins}`, `${pins}-`);
  return frames.map((frame) => ({ notation: repeatFrames(frame, 10), color: "--preset-all-open" as const }));
}

export const COMPARISON_PRESETS: readonly ComparisonPreset[] = [
  { id: "perfect", label: "Perfect 300", games: [{ notation: `${NINE_STRIKES} XXX`, color: "--preset-perfect" }], companions: [] },
  { id: "tap-299", label: "Tap 299", games: [{ notation: `${NINE_STRIKES} XX9`, color: "--preset-tap-299" }], companions: [] },
  { id: "tap-save", label: "Tap Save", games: tapGames("9/"), companions: ["tap-299", "perfect"] },
  { id: "tap-miss", label: "Tap Miss", games: tapGames("9-"), companions: ["tap-299", "perfect"] },
  { id: "dutch-spare", label: "Dutch Spare", games: dutchGames(false), companions: ["dutch-strike"] },
  { id: "dutch-strike", label: "Dutch Strike", games: dutchGames(true), companions: ["dutch-spare"] },
  { id: "all-spare", label: "All Spare", games: allSpareGames(), companions: [] },
  { id: "all-open", label: "All Open", games: allOpenGames(), companions: [] },
];

export function findPreset(id: string): ComparisonPreset | undefined {
  return COMPARISON_PRESETS.find((preset) => preset.id === id);
}

/** Resolves preset colour names to actual colours. */
export type PresetPalette = (name: PresetColor) => string;

/** The pin counts of a preset's own games. */
function presetRolls(preset: ComparisonPreset): string[] {
  return preset.games.map((game) => rollsKey(parseGameLine(game.notation)));
}

function rollsKey(entry: GameEntry): string {
  return entry.error === null ? entry.rolls.join(",") : "";
}

/** A line is a game once it has a roll or at least fails to parse; blank and colour-only lines are not. */
export function isGame(entry: GameEntry): boolean {
  return entry.rolls.length > 0 || entry.error !== null;
}

/**
 * A preset counts as active while every one of its own games is among the entered
 * games. Games are compared by their rolls; colour and spelling do not matter.
 */
export function isPresetActive(preset: ComparisonPreset, entries: readonly GameEntry[]): boolean {
  const present = new Set(entries.map(rollsKey));
  return presetRolls(preset).every((key) => present.has(key));
}

/**
 * Toggles a preset: an active preset has all lines with its games removed; an
 * inactive one is added together with its companions, skipping games that are
 * already entered.
 */
export function togglePreset(preset: ComparisonPreset, text: string, palette: PresetPalette): string {
  // The input is rewritten from its games: one trimmed line each, nothing else.
  const lines: string[] = [];
  const keys: string[] = [];
  for (const line of text.split("\n")) {
    const entry = parseGameLine(line);
    if (!isGame(entry)) continue;
    lines.push(line.trim());
    keys.push(rollsKey(entry));
  }
  const present = new Set(keys);
  const own = presetRolls(preset);
  if (own.every((key) => present.has(key))) {
    const remove = new Set(own);
    return lines.filter((_, index) => !remove.has(keys[index]!)).join("\n");
  }
  for (const id of [preset.id, ...preset.companions]) {
    const member = findPreset(id);
    if (!member) continue;
    for (const game of member.games) {
      const key = rollsKey(parseGameLine(game.notation));
      if (present.has(key)) continue;
      present.add(key);
      lines.push(`${game.notation} ${palette(game.color)}`);
    }
  }
  return lines.join("\n");
}
