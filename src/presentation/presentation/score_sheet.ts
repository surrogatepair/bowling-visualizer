/**
 * The score sheet: a classic bowling score card for one game, or a stack of rows when
 * several games are compared.
 */
import { FRAME_COUNT, boxCount, boxesInFrame, type GameScore, type RollMark, type SheetRoll } from "../../core/scoring/frames";
import type { ScoringRule } from "../../core/scoring/graph/types";
import { el, group, path, type ChildSpec, type ElementSpec } from "../render/chart";

/** How strikes and spares are drawn. */
export type Notation = "mark" | "text";

export const NOTATIONS: readonly Notation[] = ["mark", "text"];

const SHEET_WIDTH = 920;
const BOX_WIDTH = 40;
const HEADER_HEIGHT = 24;
const ROLL_ROW_HEIGHT = 40;
const TOTAL_ROW_HEIGHT = 24;
const ROW_HEIGHT = ROLL_ROW_HEIGHT + TOTAL_ROW_HEIGHT;

/** A game as shown on one row of the sheet. */
export interface SheetGame {
  readonly score: GameScore;
  /** Problem with the input, shown across the bottom of the row. */
  readonly error: string | null;
  /** Series colour of the row in comparison mode. */
  readonly color?: string;
}

function framesRight(rule: ScoringRule): number {
  return BOX_WIDTH * boxCount(rule);
}

function frameLeft(frame: number): number {
  return 2 * BOX_WIDTH * frame;
}

function frameCentre(rule: ScoringRule, frame: number): number {
  return frameLeft(frame) + (BOX_WIDTH * boxesInFrame(rule, frame)) / 2;
}

function totalCentre(rule: ScoringRule): number {
  return (framesRight(rule) + SHEET_WIDTH) / 2;
}

function rect(left: number, top: number, right: number, bottom: number): string {
  return `M${left},${top}H${right}V${bottom}H${left}Z`;
}

function scoreText(modifier: string, x: number, y: number, text: string, extraClass = ""): ElementSpec {
  return el("text", [["class", `score-text score-text--${modifier}${extraClass}`], ["x", x], ["y", y]], [text]);
}

function frameLabels(rule: ScoringRule): ElementSpec[] {
  const labels: ElementSpec[] = [];
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    labels.push(scoreText("frame-label", frameCentre(rule, frame), HEADER_HEIGHT / 2, String(frame + 1)));
  }
  labels.push(scoreText("frame-label", totalCentre(rule), HEADER_HEIGHT / 2, "Total"));
  return labels;
}

/** Vertical lines of a sheet row: box dividers down to `rollBottom`, frame borders to `bottom`. */
function verticalLines(rule: ScoringRule, top: number, rollTop: number, rollBottom: number, bottom: number): string[] {
  const parts: string[] = [];
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const boxes = boxesInFrame(rule, frame);
    for (let box = 1; box < boxes; box++) parts.push(`M${frameLeft(frame) + BOX_WIDTH * box},${rollTop}V${rollBottom}`);
    parts.push(`M${frameLeft(frame) + BOX_WIDTH * boxes},${top}V${bottom}`);
  }
  return parts;
}

function rollElement(roll: SheetRoll, notation: Notation, rollTop: number): ElementSpec {
  const left = BOX_WIDTH * roll.box;
  const right = left + BOX_WIDTH;
  const centreX = left + BOX_WIDTH / 2;
  const centreY = rollTop + ROLL_ROW_HEIGHT / 2;
  const bottom = rollTop + ROLL_ROW_HEIGHT;
  if (notation === "mark" && roll.mark.kind === "strike") {
    // A bow tie filling the box.
    const d = `M${left},${rollTop}L${centreX},${centreY}L${right},${rollTop}L${right},${bottom}L${centreX},${centreY}L${left},${bottom}Z`;
    return el("path", [["class", "score-mark score-mark--strike"], ["d", d], ["aria-label", "Strike"]]);
  }
  if (notation === "mark" && roll.mark.kind === "spare") {
    // The lower-right half of the box.
    const d = `M${right},${rollTop}L${right},${bottom}L${left},${bottom}Z`;
    return el("path", [["class", "score-mark score-mark--spare"], ["d", d], ["aria-label", "Spare"]]);
  }
  let text: string;
  if (roll.mark.kind === "strike") text = "X";
  else if (roll.mark.kind === "spare") text = "/";
  else text = roll.mark.pins === 0 ? "-" : String(roll.mark.pins);
  return scoreText("roll", centreX, centreY, text);
}

/**
 * The roll, cumulative, total and error groups of one game, with the roll row starting
 * at `rollTop`. `stacked` rows of a comparison leave the bottom edge of the error band
 * to the row's underline.
 */
function gameContent(rule: ScoringRule, game: SheetGame | null, notation: Notation, rollTop: number, stacked = false): ElementSpec[] {
  const rolls: ChildSpec[] = [];
  const cumulative: ChildSpec[] = [];
  const total: ChildSpec[] = [];
  const error: ChildSpec[] = [];
  const rowBottom = rollTop + ROW_HEIGHT;
  const totalRowTop = rollTop + ROLL_ROW_HEIGHT;
  if (game) {
    const obscured = game.error !== null ? " score-text-obscured" : "";
    for (const frame of game.score.frames) {
      for (const roll of frame.rolls) rolls.push(rollElement(roll, notation, rollTop));
      if (frame.cumulative !== null) {
        cumulative.push(scoreText("cumulative", frameCentre(rule, frame.frame), totalRowTop + TOTAL_ROW_HEIGHT / 2, String(frame.cumulative), obscured));
      }
    }
    if (game.score.frames.length > 0) {
      const modifier = game.score.complete ? "total-final" : "total-provisional";
      total.push(scoreText(modifier, totalCentre(rule), rollTop + ROW_HEIGHT / 2, String(game.score.total)));
    }
    if (game.error !== null) {
      const band = rect(0, totalRowTop, SHEET_WIDTH, rowBottom);
      const frame = stacked ? `M0,${rowBottom}V${totalRowTop}H${SHEET_WIDTH}V${rowBottom}` : band;
      error.push(path("score-error-panel", band), path("score-error-frame", frame));
      error.push(scoreText("error", SHEET_WIDTH / 2, totalRowTop + TOTAL_ROW_HEIGHT / 2, game.error));
    }
  }
  return [
    group("roll-values", rolls),
    group("cumulative-scores", cumulative),
    group("total-score", total),
    group("error-message", error),
  ];
}

/** Background marking the boxes that could not be filled because of an input error. */
function invalidBackground(rule: ScoringRule, game: SheetGame | null, rollTop: number): ElementSpec[] {
  if (!game || game.error === null || game.score.nextBox === null) return [];
  const left = BOX_WIDTH * game.score.nextBox;
  return [path("score-background score-background--invalid", rect(left, rollTop, framesRight(rule), rollTop + ROLL_ROW_HEIGHT))];
}

/** The drawn sheet is for the eye; {@link buildScoreTable} carries the same content for assistive technology. */
function sheetSvg(className: string, height: number, children: readonly ElementSpec[]): ElementSpec {
  return el(
    "svg",
    [
      ["class", className],
      ["viewBox", `0 0 ${SHEET_WIDTH} ${height}`],
      ["preserveAspectRatio", "xMidYMid meet"],
      ["aria-hidden", "true"],
    ],
    children,
  );
}

function rollWord(mark: RollMark): string {
  if (mark.kind === "strike") return "strike";
  if (mark.kind === "spare") return "spare";
  return String(mark.pins);
}

/**
 * The score sheets as a table that is not shown but read by screen readers: per game a
 * row of rolls and a row of running totals. Returns null while there is no game.
 */
export function buildScoreTable(games: readonly SheetGame[], comparing: boolean): ElementSpec | null {
  if (games.length === 0) return null;
  const frames = Array.from({ length: FRAME_COUNT }, (_, index) => index);
  const header = el("tr", [], [
    el("td"),
    ...frames.map((frame) => el("th", [["scope", "col"]], [`Frame ${frame + 1}`])),
    el("th", [["scope", "col"]], ["Total"]),
  ]);
  const rows: ElementSpec[] = [];
  games.forEach((game, index) => {
    const label = (name: string): string => (comparing ? `Game ${index + 1} ${name}` : name);
    const byFrame = new Map(game.score.frames.map((frame) => [frame.frame, frame]));
    const row = (name: string, cells: readonly string[]): ElementSpec =>
      el("tr", [], [el("th", [["scope", "row"]], [label(name)]), ...cells.map((cell) => el("td", [], [cell]))]);
    const started = game.score.frames.length > 0;
    rows.push(
      row("rolls", [...frames.map((frame) => (byFrame.get(frame)?.rolls ?? []).map((roll) => rollWord(roll.mark)).join(", ")), ""]),
      row("score", [
        ...frames.map((frame) => String(byFrame.get(frame)?.cumulative ?? "")),
        started ? (game.score.complete ? String(game.score.total) : `${game.score.total} so far`) : "",
      ]),
    );
    if (game.error !== null) {
      rows.push(el("tr", [], [el("th", [["scope", "row"]], [label("error")]), el("td", [["colspan", FRAME_COUNT + 1]], [game.error])]));
    }
  });
  // A table does not shrink below its content, so the hiding is left to a wrapper.
  return el("div", [["class", "visually-hidden"]], [
    el("table", [], [
      el("caption", [], [comparing ? "Score sheets" : "Score sheet"]),
      el("thead", [], [header]),
      el("tbody", [], rows),
    ]),
  ]);
}

/** Score sheet for a single game; `game` is null while nothing has been entered. */
export function buildScoreSheet(rule: ScoringRule, game: SheetGame | null, notation: Notation): ElementSpec {
  const height = HEADER_HEIGHT + ROW_HEIGHT;
  const rollTop = HEADER_HEIGHT;
  const rollBottom = rollTop + ROLL_ROW_HEIGHT;
  const grid = [
    rect(0, 0, SHEET_WIDTH, height),
    `M0,${rollTop}H${SHEET_WIDTH}`,
    `M0,${rollBottom}H${framesRight(rule)}`,
    ...verticalLines(rule, 0, rollTop, rollBottom, height),
  ].join(" ");
  return sheetSvg(game ? "score-sheet" : "score-sheet score-sheet-empty", height, [
    group("score-scene-root", [
      group("sheet-layer", [
        path("score-background score-background--surface", rect(0, 0, SHEET_WIDTH, height)),
        path("score-background score-background--label", rect(0, 0, SHEET_WIDTH, HEADER_HEIGHT)),
        ...invalidBackground(rule, game, rollTop),
        path("score-grid-lines", grid),
      ]),
      group("content-layer", [group("frame-labels", frameLabels(rule)), ...gameContent(rule, game, notation, rollTop)]),
    ]),
  ]);
}

/**
 * Stacked score sheet for comparison mode: a header row and one row per game. Without
 * any game a single blank row keeps the sheet's shape.
 */
export function buildComparisonSheet(rule: ScoringRule, games: readonly SheetGame[], notation: Notation): ElementSpec {
  const rowGames: readonly (SheetGame | null)[] = games.length > 0 ? games : [null];
  const height = HEADER_HEIGHT + ROW_HEIGHT * rowGames.length;
  const headerGrid = [rect(0, 0, SHEET_WIDTH, HEADER_HEIGHT)];
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    headerGrid.push(`M${frameLeft(frame) + BOX_WIDTH * boxesInFrame(rule, frame)},0V${HEADER_HEIGHT}`);
  }
  const header = group("score-scene-root score-sheet-header-row", [
    group("sheet-layer", [
      path("score-background score-background--surface", rect(0, 0, SHEET_WIDTH, HEADER_HEIGHT)),
      path("score-background score-background--label", rect(0, 0, SHEET_WIDTH, HEADER_HEIGHT)),
      path("score-grid-lines", headerGrid.join(" ")),
    ]),
    group("content-layer", [group("frame-labels", frameLabels(rule)), ...gameContent(rule, null, notation, 0)]),
  ]);

  // A valid game's row is closed at the bottom by its coloured underline.
  const underlined = (game: SheetGame | null): boolean => game !== null && game.error === null;
  const rowGrid = (game: SheetGame | null): string =>
    [
      underlined(game) ? `M0,${ROW_HEIGHT}V0H${SHEET_WIDTH}V${ROW_HEIGHT}` : rect(0, 0, SHEET_WIDTH, ROW_HEIGHT),
      `M0,${ROLL_ROW_HEIGHT}H${framesRight(rule)}`,
      ...verticalLines(rule, 0, 0, ROLL_ROW_HEIGHT, ROW_HEIGHT),
    ].join(" ");
  const rowTransform = (index: number): string => `translate(0 ${HEADER_HEIGHT + ROW_HEIGHT * index})`;
  const rows = rowGames.map((game, index) =>
    el(
      "g",
      [
        ["class", "score-scene-root score-sheet-row"],
        ["transform", rowTransform(index)],
        ["aria-label", `Game ${index + 1}`],
      ],
      [
        group("sheet-layer", [
          path("score-background score-background--surface", rect(0, 0, SHEET_WIDTH, ROW_HEIGHT)),
          ...invalidBackground(rule, game, 0),
          path("score-grid-lines", rowGrid(game)),
        ]),
        group("content-layer", [group("frame-labels"), ...gameContent(rule, game, notation, 0, true)]),
      ],
    ),
  );

  const underlines = games.map((game, index) =>
    el("g", [["transform", rowTransform(index)]], [
      el(
        "path",
        [["class", underlined(game) ? "score-highlight-bottom" : "score-error-highlight"], ["d", `M0,${ROW_HEIGHT}H${SHEET_WIDTH}`]],
        [],
        game.color ? [["--series-color", game.color]] : undefined,
      ),
    ]),
  );

  const className = games.length > 0 ? "score-sheet score-sheet-comparison" : "score-sheet score-sheet-comparison score-sheet-empty";
  return sheetSvg(className, height, [header, ...rows, group("comparison-highlights", underlines)]);
}
