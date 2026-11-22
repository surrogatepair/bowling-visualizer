/**
 * Coordinates inside a frame panel. All positions are relative to the panel's content
 * origin: x = 0 is the entry node, y = 0 is the highest reachable score gain.
 */
import { PENDING_ORDER, type ScoringRule } from "../../../../core/scoring/graph/types";
import type { Point } from "../../graph";
import type { PanelModel, PanelNode, PanelSpec } from "../model";

export const PANEL_WIDTH = 280;
export const PANEL_GAP = 10;
/** Y of the first panel row inside the frames SVG. */
export const PANEL_ROWS_TOP = 68;
/** Vertical offset of the content origin inside a panel. */
export const PANEL_CONTENT_TOP = 20;
/** The plot frame is a fixed box inside every panel. */
export const PLOT_BOX = { left: 32, width: 240, overhang: 12 } as const;
/** Space below the plot baseline for axis labels and the caption. */
const PANEL_FOOTER = 96;

export const PANEL_PIXELS_PER_POINT = 6;
export const PANEL_SCORE_STEP = 10;
/** X of the last column (frame end) and therefore the span of the columns. */
export const PANEL_SPAN = 192;

/** Half-width of an "after roll" lane and the distance between neighbouring pin counts. */
const FRAME_LANE = { half: 20, perPin: 4 } as const;
const TENTH_LANE = { half: 10, perPin: 2 } as const;
/** Horizontal distance between the sub-columns of the end column. */
const FRAME_END_SPACING = 10;
const TENTH_END_SPACING = 6;

/** Distance from the plot frame to the content origin, by rule. */
const CONTENT_INSET: Record<ScoringRule, number> = { standard: 20, "current-frame": 24 };

export interface PanelLayout {
  /** Left padding between the plot frame and x = 0. */
  readonly inset: number;
  /** Y of a zero score gain. */
  readonly baseline: number;
  readonly height: number;
  /** X of each column centre, left to right (start, after roll 1, [after roll 2,] end). */
  readonly columns: readonly number[];
  deltaY(delta: number): number;
  position(node: PanelNode): Point;
  waypoint(model: PanelModel, index: number): Point;
}

/** Baseline and overall height shared by every panel of a row. */
export function rowMetrics(maxDelta: number): { baseline: number; height: number } {
  const baseline = Math.ceil(maxDelta / PANEL_SCORE_STEP) * PANEL_SCORE_STEP * PANEL_PIXELS_PER_POINT;
  return { baseline, height: baseline + PANEL_FOOTER };
}

/** Number of sub-columns in the end column. */
function endLanes(spec: PanelSpec): number {
  if (spec.tenth) return 3;
  return spec.rule === "standard" ? PENDING_ORDER.length : 1;
}

/** Offset of an end-column node from the column centre. */
export function endOffset(spec: PanelSpec, node: PanelNode, spacing?: number): number {
  const lanes = endLanes(spec);
  let lane: number;
  if (spec.tenth) lane = node.lane;
  else if (spec.rule === "standard" && node.node.kind === "frame-end") lane = PENDING_ORDER.indexOf(node.node.pending);
  else lane = 0;
  const step = spacing ?? (spec.tenth ? TENTH_END_SPACING : FRAME_END_SPACING);
  return step * (lane - (lanes - 1) / 2);
}

export function createPanelLayout(spec: PanelSpec, maxDelta: number): PanelLayout {
  const { baseline, height } = rowMetrics(maxDelta);
  const columnCount = spec.tenth ? 4 : 3;
  const columns = Array.from({ length: columnCount }, (_, i) => (PANEL_SPAN * i) / (columnCount - 1));
  const lane = spec.tenth ? TENTH_LANE : FRAME_LANE;
  const deltaY = (delta: number): number => baseline - PANEL_PIXELS_PER_POINT * delta;

  const laneX = (column: number, pins: number): number => columns[column]! - lane.half + lane.perPin * pins;

  const position = (node: PanelNode): Point => {
    const y = deltaY(node.delta);
    switch (node.column) {
      case "start":
        return [columns[0]!, y];
      case "r1":
        return [laneX(1, node.node.kind === "tenth-r1" || node.node.kind === "frame-r1" ? node.node.r1 : 0), y];
      case "r2": {
        const r3Max = node.node.kind === "tenth-r2" ? node.node.r3Max : 10;
        return [laneX(2, r3Max === 10 ? 10 : 10 - r3Max), y];
      }
      case "end":
        return [columns[columnCount - 1]! + endOffset(spec, node), y];
    }
  };

  const waypoint = (model: PanelModel, index: number): Point => {
    const target = model.nodes[model.waypoints[index]!.target]!;
    const y = deltaY(target.delta);
    // Tenth frame: an open frame skips the "after roll 2" column. Otherwise a strike
    // skips "after roll 1"; its virtual node sits where ten pins would be.
    return spec.tenth ? [laneX(2, 0), y] : [laneX(1, 10), y];
  };

  return { inset: CONTENT_INSET[spec.rule], baseline, height, columns, deltaY, position, waypoint };
}
