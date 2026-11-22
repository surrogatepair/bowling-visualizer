/**
 * Parser for bowling roll notation.
 *
 * Accepted tokens: `X` (strike), `/` (spare), digits `0`-`9`, and `-`, `G`, `F` for a
 * roll that knocks down no pins. Whitespace and `|` separate tokens and are ignored.
 * Letters are case-insensitive.
 */

/** A failed parse: the message, where it happened, and the rolls accepted before it. */
export interface NotationError {
  readonly message: string;
  /** Offset (in UTF-16 code units) of the offending character in the input. */
  readonly position: number;
  /** Rolls that were parsed successfully before the error. */
  readonly rolls: readonly number[];
}

export type NotationResult =
  | { readonly ok: true; readonly rolls: number[] }
  | { readonly ok: false; readonly error: NotationError };

export interface NotationOptions {
  /**
   * When set, `X` always means "ten pins" regardless of rack state. This is the
   * compact form used in shared URLs, where `0x` is a gutter ball followed by a spare.
   */
  readonly literalStrike?: boolean;
}

const GAME_COMPLETE = "input continues after the game is complete";
const STRIKE_MID_RACK = '"X" (strike) cannot appear after the first roll of a rack';
const SPARE_FIRST_ROLL = '"/" (spare) cannot appear as the first roll of a frame';
const SPARE_FRESH_RACK = '"/" (spare) cannot follow a strike or spare on a fresh rack';

/** Tracks where in the game the next roll falls while parsing. */
class RackState {
  /** True when some pins of the current rack are already down. */
  midRack = false;
  /** Pins still standing; only meaningful while `midRack` is true. */
  standing = 10;
  complete = false;
  frame = 1;
  /** Rolls already thrown in the current frame. */
  rollsInFrame = 0;

  get available(): number {
    return this.midRack ? this.standing : 10;
  }

  /** Validates a pin count against the rack; returns an error message or null. */
  check(pins: number): string | null {
    if (this.complete) return GAME_COMPLETE;
    const available = this.available;
    if (pins > available) {
      const prefix = this.frame === 10 ? "F10 " : "";
      const label = this.rollsInFrame === 2 ? "R2 + R3" : "R1 + R2";
      return `${prefix}${label} = ${10 - available} + ${pins} exceeds 10`;
    }
    return null;
  }

  advance(pins: number): void {
    const wasMidRack = this.midRack;
    const available = this.available;
    const rolls = this.rollsInFrame + 1;
    this.rollsInFrame = rolls;
    this.standing = available - pins;
    this.midRack = pins < available;
    if (this.frame >= 10) {
      if (rolls === 2) this.complete = wasMidRack && this.midRack;
      else if (rolls === 3) this.complete = true;
      else this.complete = false;
      return;
    }
    if (pins === 10 || rolls === 2) {
      this.rollsInFrame = 0;
      this.midRack = false;
      this.frame += 1;
    }
  }
}

function isSeparator(code: number): boolean {
  // tab, line feed, carriage return, space, vertical bar
  return code === 9 || code === 10 || code === 13 || code === 32 || code === 124;
}

/**
 * Characters read as `-`: hyphen, non-breaking hyphen, minus sign, and the long vowel
 * marks a Japanese keyboard types for the minus key. Dashes (`–`, `—`) are left out on
 * purpose: software produces them from two hyphens, so what they stand for is unclear.
 */
const HYPHENS = new Set([0x2010, 0x2011, 0x2212, 0x30fc, 0xff70]);

/**
 * Maps a character to the ASCII character the notation knows it as: full-width forms
 * (`Ｘ`, `／`, `９`, ...) to their plain counterparts, the ideographic space to a space
 * and hyphen look-alikes to `-`. Other characters are returned unchanged.
 */
export function foldChar(code: number): number {
  if (code >= 0xff01 && code <= 0xff5e) return code - 0xfee0;
  if (code === 0x3000) return 32;
  if (HYPHENS.has(code)) return 45;
  return code;
}

/** Applies {@link foldChar} to a whole text. The result has the same length as the input. */
export function foldText(text: string): string {
  let folded = "";
  for (const char of text) folded += String.fromCodePoint(foldChar(char.codePointAt(0)!));
  return folded;
}

/** Parses roll notation into pin counts, validating against the rules of ten-pin bowling. */
export function parseRolls(text: string, options: NotationOptions = {}): NotationResult {
  const rolls: number[] = [];
  const state = new RackState();
  const fail = (message: string, position: number): NotationResult => ({
    ok: false,
    error: { message, position, rolls },
  });

  let position = 0;
  for (const char of text) {
    const at = position;
    position += char.length;
    let code = foldChar(char.codePointAt(0)!);
    if (isSeparator(code)) continue;
    if (code >= 97 && code <= 122) code -= 32;
    const symbol = String.fromCodePoint(code);

    if (state.complete) return fail(GAME_COMPLETE, at);

    let pins: number;
    if (symbol === "-" || symbol === "F" || symbol === "G") {
      pins = 0;
    } else if (symbol === "X") {
      if (!options.literalStrike && state.midRack) return fail(STRIKE_MID_RACK, at);
      pins = 10;
    } else if (symbol === "/") {
      if (!state.midRack) {
        return fail(state.rollsInFrame === 0 ? SPARE_FIRST_ROLL : SPARE_FRESH_RACK, at);
      }
      pins = state.standing;
    } else if (code >= 48 && code <= 57) {
      pins = code - 48;
    } else {
      return fail(`unexpected character "${symbol}"`, at);
    }

    const problem = state.check(pins);
    if (problem !== null) return fail(problem, at);
    state.advance(pins);
    rolls.push(pins);
  }
  return { ok: true, rolls };
}
