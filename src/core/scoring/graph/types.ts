/**
 * Data model of the scoring state graph.
 *
 * A node is a distinguishable scoring situation between two rolls; an edge is one roll.
 * Two games pass through the same node exactly when nothing that happened earlier can
 * still influence how the rest of the game is scored.
 */

/** The two scoring systems the visualizer can display. */
export type ScoringRule = "standard" | "current-frame";

export const SCORING_RULES: readonly ScoringRule[] = ["standard", "current-frame"];

/** Bonus owed to earlier frames when a frame ends. */
export type Pending = "none" | "spare" | "strike" | "double_strike";

export const PENDING_ORDER: readonly Pending[] = ["none", "spare", "strike", "double_strike"];

/** Visual/semantic class of a node; doubles as a CSS class suffix. */
export type Category =
  | "no_pending"
  | "spare_pending"
  | "strike_pending"
  | "double_strike_pending"
  | "mid_no_carry"
  | "mid_carry";

export const CATEGORY_ORDER: readonly Category[] = [
  "no_pending",
  "spare_pending",
  "strike_pending",
  "double_strike_pending",
  "mid_no_carry",
  "mid_carry",
];

export type GraphNode =
  /** Before the first roll. */
  | { readonly kind: "start" }
  /** Frames 1-9 (every frame under current-frame scoring), after a non-strike first roll. */
  | { readonly kind: "frame-r1"; readonly frame: number; readonly r1: number; readonly carry: boolean; readonly score: number }
  /** Between two frames. */
  | { readonly kind: "frame-end"; readonly frame: number; readonly pending: Pending; readonly score: number }
  /** Tenth frame under standard scoring, after the first roll (strikes included). */
  | { readonly kind: "tenth-r1"; readonly r1: number; readonly carry: boolean; readonly score: number }
  /** Tenth frame under standard scoring, after two rolls with a third still to come. */
  | { readonly kind: "tenth-r2"; readonly r3Max: number; readonly score: number }
  /** Game over. */
  | { readonly kind: "end"; readonly score: number };

export type NodeKind = GraphNode["kind"];

/** Running score at a node: pins plus every bonus already credited. */
export function nodeScore(node: GraphNode): number {
  return node.kind === "start" ? 0 : node.score;
}

/** Stable textual identity of a node. */
export function nodeKey(node: GraphNode): string {
  switch (node.kind) {
    case "start":
      return "Start";
    case "frame-r1":
      return `F${node.frame}-R1|${node.r1}|${node.carry}|${node.score}`;
    case "frame-end":
      return `F${node.frame}-end|${node.score}|${node.pending}`;
    case "tenth-r1":
      return `F10-R1|${node.r1}|${node.carry}|${node.score}`;
    case "tenth-r2":
      return `F10-R2|${node.r3Max}|${node.score}`;
    case "end":
      return `End|${node.score}`;
  }
}

export function pendingCategory(pending: Pending): Category {
  switch (pending) {
    case "none":
      return "no_pending";
    case "spare":
      return "spare_pending";
    case "strike":
      return "strike_pending";
    case "double_strike":
      return "double_strike_pending";
  }
}

export function nodeCategory(node: GraphNode): Category {
  switch (node.kind) {
    case "start":
    case "end":
      return "no_pending";
    case "frame-end":
      return pendingCategory(node.pending);
    case "frame-r1":
    case "tenth-r1":
      return node.carry ? "mid_carry" : "mid_no_carry";
    case "tenth-r2":
      return "mid_no_carry";
  }
}

/** True for nodes that sit on a frame boundary (drawn with the larger marker). */
export function isBoundaryNode(node: GraphNode): boolean {
  return node.kind === "start" || node.kind === "frame-end" || node.kind === "end";
}

/** One roll leading from `from` to `to` (indices into {@link ScoreGraph.nodes}). */
export interface GraphEdge {
  readonly from: number;
  readonly to: number;
  readonly pins: number;
  /**
   * True when the roll skips a column of the layout (a strike skips the "after roll 1"
   * column; an open tenth frame skips the "after roll 2" column). Such edges are drawn
   * through a virtual waypoint in the skipped column.
   */
  readonly skipsColumn: boolean;
}

export interface ScoreGraph {
  readonly rule: ScoringRule;
  /** Nodes in discovery order; index 0 is the start node. */
  readonly nodes: readonly GraphNode[];
  /** Edges grouped by source node in the order nodes were expanded, rolls ascending. */
  readonly edges: readonly GraphEdge[];
  /** For each node, the range `[offset, offset + count)` of its outgoing edges. */
  readonly outgoing: readonly { readonly offset: number; readonly count: number }[];
  /** Node lookup by {@link nodeKey}. */
  readonly index: ReadonlyMap<string, number>;
}
