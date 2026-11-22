/**
 * Frame panels: the scoring flow inside a single frame, drawn relative to the state
 * the frame starts in.
 *
 * Every frame entered with the same pending bonus looks identical apart from a score
 * offset, so one panel per entry state describes all of them. The tenth frame of
 * standard scoring has its own panels because of its bonus rolls.
 */
import {
  nodeCategory,
  nodeKey,
  pendingCategory,
  type Category,
  type GraphNode,
  type Pending,
  type ScoringRule,
} from "../../../core/scoring/graph/types";
import { transitions } from "../../../core/scoring/graph/walker";

/** Columns of a panel, left to right. */
export type PanelColumn = "start" | "r1" | "r2" | "end";

export const PANEL_COLUMNS: readonly PanelColumn[] = ["start", "r1", "r2", "end"];

/** Which frames a panel stands for. */
export interface PanelSpec {
  readonly rule: ScoringRule;
  /** Bonus pending when the frame starts. */
  readonly entry: Pending;
  /** True for the tenth frame of standard scoring. */
  readonly tenth: boolean;
  readonly firstFrame: number;
  readonly lastFrame: number;
}

export interface PanelNode {
  readonly index: number;
  readonly column: PanelColumn;
  /** Graph node with scores measured from the start of the frame. */
  readonly node: GraphNode;
  readonly category: Category;
  /** Points gained since the frame started. */
  readonly delta: number;
  /**
   * Extra placement information: the pins of the first roll for the "after roll 1"
   * column; for tenth-frame panels the number of marks (strikes or spares) thrown in
   * the first two rolls, on "after roll 2" and end nodes. Zero otherwise.
   */
  readonly lane: number;
}

/** A virtual node on an edge that skips a column. */
export interface PanelWaypoint {
  readonly index: number;
  /** Node the waypoint leads to. */
  readonly target: number;
  readonly category: Category;
}

export interface PanelEdge {
  readonly from: number;
  readonly to: number;
  readonly pins: number;
  /** Index into {@link PanelModel.waypoints}, or null for a direct edge. */
  readonly waypoint: number | null;
}

export interface PanelModel {
  readonly spec: PanelSpec;
  /** Nodes ordered by column, then by first appearance. Index 0 is the entry node. */
  readonly nodes: readonly PanelNode[];
  /**
   * Edges in drawing order: all in-frame roll sequences enumerated lexicographically,
   * each edge listed the first time it is used.
   */
  readonly edges: readonly PanelEdge[];
  readonly waypoints: readonly PanelWaypoint[];
  /** Largest score gain reachable inside the frame. */
  readonly maxDelta: number;
  /** Edge leaving `from` with the given pin count, as an index into `edges`. */
  edgeFor(from: number, pins: number): number | undefined;
}

function columnOf(node: GraphNode): PanelColumn {
  switch (node.kind) {
    case "start":
      return "start";
    case "frame-r1":
    case "tenth-r1":
      return "r1";
    case "tenth-r2":
      return "r2";
    case "frame-end":
    case "end":
      return "end";
  }
}

/** The frame-boundary node a panel starts from, with a score of zero. */
function entryNode(spec: PanelSpec): GraphNode {
  return { kind: "frame-end", frame: spec.tenth ? 9 : 1, pending: spec.entry, score: 0 };
}

interface Draft {
  readonly key: string;
  readonly column: PanelColumn;
  readonly node: GraphNode;
  readonly lane: number;
}

export function buildPanelModel(spec: PanelSpec): PanelModel {
  const drafts: Draft[] = [];
  const draftIndex = new Map<string, number>();
  const draftEdges: { from: number; to: number; pins: number; waypoint: number | null }[] = [];
  const waypointTargets: number[] = [];
  const waypointByTarget = new Map<number, number>();

  const register = (key: string, column: PanelColumn, node: GraphNode, lane: number): [index: number, isNew: boolean] => {
    const known = draftIndex.get(key);
    if (known !== undefined) return [known, false];
    const index = drafts.length;
    drafts.push({ key, column, node, lane });
    draftIndex.set(key, index);
    return [index, true];
  };

  const visit = (from: number): void => {
    const source = drafts[from]!;
    for (const step of transitions(spec.rule, source.node)) {
      const column = columnOf(step.node);
      let lane: number;
      let key = nodeKey(step.node);
      if (column === "r1") {
        lane = step.pins;
      } else if (column === "r2") {
        // Marks so far: a strike on the first roll, plus a second strike or a spare.
        const firstWasStrike = source.node.kind === "tenth-r1" && source.node.r1 === 10;
        lane = firstWasStrike ? (step.pins === 10 ? 2 : 1) : 1;
      } else if (spec.tenth) {
        lane = source.column === "r2" ? source.lane : 0;
        key += `|${lane}`;
      } else {
        lane = 0;
      }
      const [to, isNew] = register(key, column, step.node, lane);
      let waypoint: number | null = null;
      if (step.skipsColumn) {
        let known = waypointByTarget.get(to);
        if (known === undefined) {
          known = waypointTargets.length;
          waypointTargets.push(to);
          waypointByTarget.set(to, known);
        }
        waypoint = known;
      }
      draftEdges.push({ from, to, pins: step.pins, waypoint });
      if (isNew && column !== "end") visit(to);
    }
  };

  register("entry", "start", entryNode(spec), 0);
  visit(0);

  // Final numbering: by column, keeping first-appearance order inside each column.
  const order: number[] = [];
  for (const column of PANEL_COLUMNS) {
    drafts.forEach((draft, index) => {
      if (draft.column === column) order.push(index);
    });
  }
  const finalIndex = new Map<number, number>();
  order.forEach((draft, index) => finalIndex.set(draft, index));

  const nodes: PanelNode[] = order.map((draftId, index) => {
    const draft = drafts[draftId]!;
    const delta = draft.node.kind === "start" ? 0 : draft.node.score;
    const category = draft.column === "start" ? pendingCategory(spec.entry) : nodeCategory(draft.node);
    return { index, column: draft.column, node: draft.node, category, delta, lane: draft.lane };
  });
  const edges: PanelEdge[] = draftEdges.map((edge) => ({
    from: finalIndex.get(edge.from)!,
    to: finalIndex.get(edge.to)!,
    pins: edge.pins,
    waypoint: edge.waypoint,
  }));
  const waypoints: PanelWaypoint[] = waypointTargets.map((draftId, index) => {
    const target = finalIndex.get(draftId)!;
    return { index, target, category: nodes[target]!.category };
  });

  const lookup = new Map<number, number>();
  edges.forEach((edge, index) => lookup.set(edge.from * 16 + edge.pins, index));
  const maxDelta = nodes.reduce((max, node) => Math.max(max, node.delta), 0);

  return {
    spec,
    nodes,
    edges,
    waypoints,
    maxDelta,
    edgeFor: (from, pins) => lookup.get(from * 16 + pins),
  };
}

/** The panels shown for a scoring rule, row by row. */
export function panelRows(rule: ScoringRule): PanelSpec[][] {
  if (rule === "current-frame") {
    return [[{ rule, entry: "none", tenth: false, firstFrame: 1, lastFrame: 10 }]];
  }
  const entries: readonly [Pending, number][] = [
    ["none", 1],
    ["spare", 2],
    ["strike", 2],
    ["double_strike", 3],
  ];
  return [
    entries.map(([entry, firstFrame]) => ({ rule, entry, tenth: false, firstFrame, lastFrame: 9 })),
    entries.map(([entry]) => ({ rule, entry, tenth: true, firstFrame: 10, lastFrame: 10 })),
  ];
}

/** Caption under a panel, e.g. "Frame 2-9" or "Frame 10". */
export function panelCaption(spec: PanelSpec): string {
  return spec.firstFrame === spec.lastFrame ? `Frame ${spec.firstFrame}` : `Frame ${spec.firstFrame}-${spec.lastFrame}`;
}
