/**
 * The shareable state of the app as URL query parameters:
 * `rolls` (one per game, compact digits with `x` for ten), `color` (one per game,
 * six hex digits) and `view` (the scoring rule when it is not the default).
 */
import { parseRolls } from "../../core/notation";
import { SCORING_RULES, type ScoringRule } from "../../core/scoring/graph/types";
import { hexDigits, parseHexDigits } from "./hex_color";
import { formatRolls } from "./notation_text";

export const DEFAULT_VIEW: ScoringRule = "standard";

export interface UrlGame {
  readonly rolls: readonly number[];
  /** Explicit colour, or null for the default highlight colour. */
  readonly color: string | null;
}

/** State restored from a URL. */
export interface UrlState {
  readonly view: ScoringRule;
  /** One input line per game, formatted as roll notation with an optional colour. */
  readonly games: readonly string[];
  /** Whether the URL describes a comparison: it has more than one `rolls` parameter. */
  readonly comparing: boolean;
}

/** Compact form of a game's rolls: one character per roll. */
export function encodeRolls(rolls: readonly number[]): string {
  return rolls.map((pins) => (pins === 10 ? "x" : String(pins))).join("");
}

/** Builds the query string (without `?`) for the given games and view. */
export function buildQuery(games: readonly UrlGame[], view: ScoringRule, defaultColor: string): string {
  const params = new URLSearchParams();
  const shown = games.filter((game) => game.rolls.length > 0);
  for (const game of shown) params.append("rolls", encodeRolls(game.rolls));
  // Colours are positional, so defaults in between are spelled out; trailing ones are omitted.
  let colored = 0;
  shown.forEach((game, index) => {
    if (game.color !== null && game.color !== defaultColor) colored = index + 1;
  });
  for (const game of shown.slice(0, colored)) params.append("color", hexDigits(game.color ?? defaultColor));
  if (view !== DEFAULT_VIEW) params.append("view", view);
  return params.toString();
}

/** Converts a `rolls` parameter into input text, keeping whatever could not be parsed. */
function rollsParamToText(value: string): string {
  const result = parseRolls(value, { literalStrike: true });
  if (result.ok) return formatRolls(result.rolls);
  const parsed = formatRolls(result.error.rolls);
  const rest = value.slice(result.error.position);
  return parsed === "" ? rest : `${parsed} ${rest}`;
}

/** Reads the app state from a query string (with or without the leading `?`). */
export function parseQuery(query: string, defaultColor: string): UrlState {
  let view: ScoringRule | "invalid" | null = null;
  const rolls: string[] = [];
  const colors: string[] = [];
  for (const [key, value] of new URLSearchParams(query)) {
    if (key === "view") {
      // Only the first `view` parameter counts, valid or not.
      if (view === null) view = (SCORING_RULES as readonly string[]).includes(value) ? (value as ScoringRule) : "invalid";
    } else if (key === "color") {
      colors.push(parseHexDigits(value) ?? defaultColor);
    } else if (key === "rolls") {
      rolls.push(value === "" ? "" : rollsParamToText(value));
    }
  }
  const games: string[] = [];
  rolls.forEach((text, index) => {
    if (text === "") return;
    const color = colors[index];
    games.push(color === undefined ? text : `${text} ${color}`);
  });
  return { view: view === null || view === "invalid" ? DEFAULT_VIEW : view, games, comparing: rolls.length > 1 };
}
