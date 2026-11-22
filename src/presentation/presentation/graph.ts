/**
 * Layout of the scoring state graph: where every node of a {@link ScoreGraph} sits on
 * the frame-by-score chart.
 */
import {
  PENDING_ORDER,
  nodeScore,
  type GraphEdge,
  type GraphNode,
  type ScoreGraph,
  type ScoringRule,
} from "../../core/scoring/graph/types";

export type Point = readonly [x: number, y: number];

export const GRAPH_SVG_WIDTH = 1440;
export const GRAPH_SVG_HEIGHT = 810;
/** Space reserved left of and above the plot area for labels and the title. */
export const GRAPH_MARGIN_LEFT = 50;
export const GRAPH_MARGIN_TOP = 85;
export const PLOT_WIDTH = 1340;
export const PLOT_HEIGHT = 640;

/** Vertical position of score zero and the scale in pixels per point. */
export const SCORE_BASELINE = 620;
export const PIXELS_PER_POINT = 2;
export const MAX_SCORE = 300;

export const FRAME_COUNT = 10;
/** Width of an ordinary frame column. */
export const FRAME_WIDTH = 120;
/** Under standard scoring the tenth frame holds a third roll and is wider. */
const STANDARD_LAST_FRAME_WIDTH = 180;

/** Horizontal spread of frame-end nodes by pending bonus, centred on the frame boundary. */
const PENDING_OFFSET = [-9, -3, 3, 9] as const;

/** Offsets of the "after roll 1" lanes inside a frame, per pin and per carry state. */
const STANDARD_R1_LANE = { noCarry: 39, carry: 61, perPin: 2 } as const;
const CURRENT_FRAME_R1_LANE = { start: 40, perPin: 4 } as const;
/** Offset of the "after roll 2" lane inside the tenth frame (standard scoring). */
const TENTH_R2_LANE = { start: 110, perPin: 2 } as const;

export interface GraphLayout {
  readonly rule: ScoringRule;
  /** X coordinate of the start node, i.e. the left edge of frame 1. */
  readonly originX: number;
  /** Left edge of a 1-based frame. */
  frameLeft(frame: number): number;
  /** Width of a 1-based frame. */
  frameWidth(frame: number): number;
  scoreY(score: number): number;
  position(node: GraphNode): Point;
  /** Position of the virtual node an edge passes through when it skips a column. */
  waypoint(graph: ScoreGraph, edge: GraphEdge): Point;
}

function lastFrameWidth(rule: ScoringRule): number {
  return rule === "standard" ? STANDARD_LAST_FRAME_WIDTH : FRAME_WIDTH;
}

/** Tenth-frame "after roll 2" lane index: pins of the second roll, a fresh rack counting as ten. */
function tenthR2Lane(r3Max: number): number {
  return r3Max === 10 ? 10 : 10 - r3Max;
}

export function createGraphLayout(rule: ScoringRule): GraphLayout {
  // Both layouts are centred in the plot area.
  const totalWidth = FRAME_WIDTH * (FRAME_COUNT - 1) + lastFrameWidth(rule);
  const originX = (PLOT_WIDTH - totalWidth) / 2;

  const frameLeft = (frame: number): number => originX + FRAME_WIDTH * (frame - 1);
  const frameWidth = (frame: number): number => (frame === FRAME_COUNT ? lastFrameWidth(rule) : FRAME_WIDTH);
  const scoreY = (score: number): number => SCORE_BASELINE - PIXELS_PER_POINT * score;

  const r1LaneX = (frame: number, pins: number, carry: boolean): number => {
    if (rule === "current-frame") {
      return frameLeft(frame) + CURRENT_FRAME_R1_LANE.start + CURRENT_FRAME_R1_LANE.perPin * pins;
    }
    const lane = carry ? STANDARD_R1_LANE.carry : STANDARD_R1_LANE.noCarry;
    return frameLeft(frame) + lane + STANDARD_R1_LANE.perPin * pins;
  };

  const position = (node: GraphNode): Point => {
    const y = scoreY(nodeScore(node));
    switch (node.kind) {
      case "start":
        return [originX, y];
      case "frame-r1":
        return [r1LaneX(node.frame, node.r1, node.carry), y];
      case "frame-end": {
        const boundary = frameLeft(node.frame) + frameWidth(node.frame);
        const spread = rule === "standard" ? PENDING_OFFSET[PENDING_ORDER.indexOf(node.pending)]! : 0;
        return [boundary + spread, y];
      }
      case "tenth-r1":
        return [r1LaneX(FRAME_COUNT, node.r1, node.carry), y];
      case "tenth-r2":
        return [frameLeft(FRAME_COUNT) + TENTH_R2_LANE.start + TENTH_R2_LANE.perPin * tenthR2Lane(node.r3Max), y];
      case "end":
        return [frameLeft(FRAME_COUNT) + frameWidth(FRAME_COUNT), y];
    }
  };

  const waypoint = (graph: ScoreGraph, edge: GraphEdge): Point => {
    const source = graph.nodes[edge.from]!;
    const target = graph.nodes[edge.to]!;
    const y = scoreY(nodeScore(target));
    if (source.kind === "tenth-r1") {
      // An open tenth frame ends the game without visiting the "after roll 2" lane.
      return [frameLeft(FRAME_COUNT) + TENTH_R2_LANE.start, y];
    }
    // A strike: the virtual node sits where a ten-pin first roll would be.
    const frame = source.kind === "frame-end" ? source.frame + 1 : 1;
    const carry = source.kind === "frame-end" && (source.pending === "strike" || source.pending === "double_strike");
    return [r1LaneX(frame, 10, carry), y];
  };

  return { rule, originX, frameLeft, frameWidth, scoreY, position, waypoint };
}
