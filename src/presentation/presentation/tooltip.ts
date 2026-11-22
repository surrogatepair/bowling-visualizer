/**
 * Tooltip content for highlighted nodes: what a node of the scoring graph means, in
 * words. Shared by the state graph and the frame panels.
 */
import type { HighlightTrace } from "../../core/app/highlight";
import type { GraphNode, Pending } from "../../core/scoring/graph/types";
import type { Point } from "./graph";
import type { GraphGeometry } from "./graph_scene";
import { PENDING_DESCRIPTION } from "./labels";

export interface TooltipContent {
  readonly title: string;
  /** Label/value pairs shown under the title. */
  readonly rows: ReadonlyArray<readonly [label: string, value: string]>;
}

/** A point of a view that shows a tooltip when the pointer comes close. */
export interface TooltipTarget {
  /** Position in the coordinate system of the view's SVG. */
  readonly point: Point;
  readonly content: TooltipContent;
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function frameTitle(frames: readonly number[] | number, suffix: string): string {
  const list = typeof frames === "number" ? [frames] : frames;
  return `${list.length === 1 ? "Frame" : "Frames"} ${list.join(", ")} - ${suffix}`;
}

/** Describes the state at the start of a frame, i.e. a frame-boundary node. */
export function boundaryContent(title: string, score: number, pending: Pending): TooltipContent {
  return {
    title,
    rows: [
      ["Score", String(score)],
      ["State", PENDING_DESCRIPTION[pending]],
    ],
  };
}

/**
 * Describes a node. `score` is the score to report (absolute on the graph, relative to
 * the frame start on a panel); `frames` are the frames the node belongs to.
 */
export function nodeContent(node: GraphNode, score: number, frames: readonly number[]): TooltipContent {
  switch (node.kind) {
    case "start":
      return { title: "Start", rows: [["Score", String(score)]] };
    case "frame-end":
      return boundaryContent(frameTitle(frames, "end"), score, node.pending);
    case "frame-r1":
      return {
        title: frameTitle(frames, "after R1"),
        rows: [
          ["R1", `${node.r1} pins`],
          ["Score", String(score)],
          ["Carry from prev", yesNo(node.carry)],
        ],
      };
    case "tenth-r1":
      return {
        title: frameTitle(10, "after R1"),
        rows: [
          ["R1", `${node.r1} pins`],
          ["Score", String(score)],
          ["F9 carry still owed", yesNo(node.carry)],
        ],
      };
    case "tenth-r2":
      return {
        title: frameTitle(10, "after R2"),
        rows: [
          ["Score", String(score)],
          ["R3 max pins", node.r3Max === 10 ? "10 (fresh pins)" : `${node.r3Max} (remaining)`],
        ],
      };
    case "end":
      return { title: "Game end", rows: [["Final score", String(score)]] };
  }
}

/** Tooltip targets of the state graph: every node on the route of a game. */
export function graphTooltipTargets(geometry: GraphGeometry, traces: readonly HighlightTrace[]): TooltipTarget[] {
  const targets: TooltipTarget[] = [];
  for (const trace of traces) {
    // A lone start node is not drawn, so it is not a target either.
    if (trace.edges.length === 0) continue;
    for (const index of trace.path) {
      const node = geometry.graph.nodes[index]!;
      const frames = node.kind === "frame-end" || node.kind === "frame-r1" ? [node.frame] : [];
      targets.push({ point: geometry.points[index]!, content: nodeContent(node, node.kind === "start" ? 0 : node.score, frames) });
    }
  }
  return targets;
}

/**
 * The route of a game in words, one line per node: what the tooltips say, for readers
 * who cannot point at the graph.
 */
export function describeRoute(geometry: GraphGeometry, trace: HighlightTrace): string[] {
  return graphTooltipTargets(geometry, [trace]).map(({ content }) => {
    const details = content.rows.map(([label, value]) => `${label} ${value}`).join(", ");
    return `${content.title}: ${details}`;
  });
}

/** Adds a row to existing content. */
export function withRow(content: TooltipContent, label: string, value: string): TooltipContent {
  return { title: content.title, rows: [...content.rows, [label, value]] };
}
