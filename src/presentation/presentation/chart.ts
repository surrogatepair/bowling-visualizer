/**
 * Shared chart vocabulary: number formatting for SVG path data and small path builders
 * used by both the state graph and the frame panels.
 */

/** Rounds to the two decimals kept in path data (never returns negative zero). */
export function roundCoordinate(value: number): number {
  const magnitude = Math.round(Math.abs(value) * 100) / 100;
  if (magnitude === 0) return 0;
  return value < 0 ? -magnitude : magnitude;
}

/**
 * Formats a coordinate with at most two decimals, without a leading zero
 * (`0.5` becomes `.5`, `-0.25` becomes `-.25`).
 */
export function formatNumber(value: number): string {
  let text = String(roundCoordinate(value));
  if (text.startsWith("0.")) text = text.slice(1);
  else if (text.startsWith("-0.")) text = "-" + text.slice(2);
  return text;
}

/**
 * Formats a coordinate pair compactly: the separator is dropped when the sign of the
 * second number already delimits it (`-20-12`, but `0 620`).
 */
export function formatPair(x: number, y: number): string {
  const second = formatNumber(y);
  return formatNumber(x) + (second.startsWith("-") ? "" : " ") + second;
}

/** Accumulates zero-length round-capped strokes, i.e. dots, as one path. */
export function dotPath(points: ReadonlyArray<readonly [number, number]>): string {
  let d = "";
  for (const [x, y] of points) d += `M${formatNumber(x)},${formatNumber(y)}h.01`;
  return d;
}

/** A straight segment as an independent sub-path. */
export function segmentPath(x1: number, y1: number, x2: number, y2: number): string {
  return `M${formatNumber(x1)},${formatNumber(y1)}L${formatNumber(x2)},${formatNumber(y2)}`;
}

/** Horizontal grid lines drawn boustrophedon style so the pen never lifts far. */
export function gridLinesPath(left: number, width: number, firstY: number, step: number, count: number): string {
  let d = `M${formatPair(left, firstY)}h${formatNumber(width)}`;
  let direction = -1;
  for (let i = 1; i < count; i++) {
    d += `m${formatPair(0, -step)}h${formatNumber(direction * width)}`;
    direction = -direction;
  }
  return d;
}

/** Closed rectangle outline starting at its top-left corner. */
export function framePath(left: number, top: number, width: number, height: number): string {
  return `M${formatPair(left, top)}h${formatNumber(width)}v${formatNumber(height)}h${formatNumber(-width)}Z`;
}

/** A run of equally long tick marks: the first is absolute, the rest are relative moves. */
function tickRun(
  axis: "v" | "h",
  startX: number,
  startY: number,
  length: number,
  steps: ReadonlyArray<readonly [number, number]>,
): string {
  let d = `M${formatPair(startX, startY)}${axis}${formatNumber(length)}`;
  for (const [dx, dy] of steps) {
    const mx = axis === "h" ? dx - length : dx;
    const my = axis === "v" ? dy - length : dy;
    d += `m${formatPair(mx, my)}${axis}${formatNumber(length)}`;
  }
  return d;
}

export interface TickSpec {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** X positions of ticks along the top and bottom edges. */
  readonly xTicks: readonly number[];
  /** Y positions of ticks along the left and right edges, bottom-most first. */
  readonly yTicks: readonly number[];
  readonly length: number;
}

/** Inward tick marks on all four sides of a plot frame. */
export function frameTicksPath(spec: TickSpec): string {
  const { left, top, width, height, xTicks, yTicks, length } = spec;
  const xSteps: [number, number][] = [];
  for (let i = 1; i < xTicks.length; i++) xSteps.push([xTicks[i]! - xTicks[i - 1]!, 0]);
  const ySteps: [number, number][] = [];
  for (let i = 1; i < yTicks.length; i++) ySteps.push([0, yTicks[i]! - yTicks[i - 1]!]);
  const first = xTicks[0]!;
  const base = yTicks[0]!;
  return (
    tickRun("v", first, top, length, xSteps) +
    tickRun("v", first, top + height, -length, xSteps) +
    tickRun("h", left, base, length, ySteps) +
    tickRun("h", left + width, base, -length, ySteps)
  );
}

/**
 * A thin filled quadrilateral following a straight edge. Ribbons are used instead of
 * strokes so overlapping edges of one category merge into a flat tint.
 */
export function ribbonPath(x1: number, y1: number, x2: number, y2: number, width: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const half = width / 2;
  // Offset from the centre line to one long side, rounded once so that both long
  // sides stay exactly parallel after formatting.
  const ox = roundCoordinate(length === 0 ? 0 : (-dy / length) * half);
  const oy = roundCoordinate(length === 0 ? half : (dx / length) * half);
  return (
    `M${formatNumber(x1 + ox)} ${formatNumber(y1 + oy)}` +
    `l${formatNumber(dx)} ${formatNumber(dy)} ${formatNumber(-2 * ox)} ${formatNumber(-2 * oy)} ${formatNumber(-dx)} ${formatNumber(-dy)}z`
  );
}

/** Formats an integer with thousands separators (`27695` becomes `27,695`). */
export function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
