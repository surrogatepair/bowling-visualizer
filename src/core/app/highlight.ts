/**
 * Maps a sequence of rolls onto the scoring state graph.
 */
import { nodeKey, type GraphNode, type Pending, type ScoreGraph } from "../scoring/graph/types";

/** The route of one game through the graph. */
export interface HighlightTrace {
  /** Visited node indices, starting with the start node. */
  readonly path: readonly number[];
  /** Edge indices; `edges[i]` leads from `path[i]` to `path[i + 1]`. */
  readonly edges: readonly number[];
  /** Pins of each traversed edge. */
  readonly rolls: readonly number[];
}

/** One frame of a traced game, described relative to the state it started in. */
export interface FrameVisit {
  /** One-based frame number. */
  readonly frame: number;
  /** Bonus pending when the frame started. */
  readonly entry: Pending;
  /** Index of the node the frame started from. */
  readonly entryNode: number;
  /** Rolls thrown inside the frame so far. */
  readonly rolls: readonly number[];
  /** Nodes visited inside the frame, entry node first. */
  readonly nodes: readonly number[];
  /** True once the frame has ended. */
  readonly complete: boolean;
}

/**
 * Follows `rolls` from the start node. Rolls beyond the end of the game (possible
 * under current-frame scoring, which has no bonus rolls) are ignored.
 */
export function traceRolls(graph: ScoreGraph, rolls: readonly number[]): HighlightTrace {
  const path: number[] = [0];
  const edges: number[] = [];
  const used: number[] = [];
  let current = 0;
  for (let i = 0; i < rolls.length; i++) {
    const { offset, count } = graph.outgoing[current]!;
    if (count === 0) break;
    let found = -1;
    for (let e = offset; e < offset + count; e++) {
      if (graph.edges[e]!.pins === rolls[i]) {
        found = e;
        break;
      }
    }
    if (found < 0) {
      throw new Error(`cannot match rolls [${rolls.slice(i).join(", ")}] from node ${nodeKey(graph.nodes[current]!)}`);
    }
    edges.push(found);
    used.push(rolls[i]!);
    current = graph.edges[found]!.to;
    path.push(current);
  }
  return { path, edges, rolls: used };
}

function isFrameBoundary(node: GraphNode): boolean {
  return node.kind === "start" || node.kind === "frame-end" || node.kind === "end";
}

function pendingAt(node: GraphNode): Pending {
  return node.kind === "frame-end" ? node.pending : "none";
}

/**
 * Splits a trace into frames. A frame that has been entered but not rolled in yet is
 * included (with no rolls) unless the game is over.
 */
export function frameVisits(graph: ScoreGraph, trace: HighlightTrace): FrameVisit[] {
  const visits: FrameVisit[] = [];
  let frame = 1;
  let start = 0;
  for (let i = 1; i <= trace.path.length; i++) {
    const atEnd = i === trace.path.length;
    const boundary = !atEnd && isFrameBoundary(graph.nodes[trace.path[i]!]!);
    if (!boundary && !atEnd) continue;
    const entryIndex = trace.path[start]!;
    const entry = graph.nodes[entryIndex]!;
    const last = atEnd ? i - 1 : i;
    if (atEnd && last === start) {
      // Standing on a frame boundary: the next frame is entered unless the game is over.
      if (graph.outgoing[entryIndex]!.count > 0) {
        visits.push({ frame, entry: pendingAt(entry), entryNode: entryIndex, rolls: [], nodes: [entryIndex], complete: false });
      }
      break;
    }
    visits.push({
      frame,
      entry: pendingAt(entry),
      entryNode: entryIndex,
      rolls: trace.rolls.slice(start, last),
      nodes: trace.path.slice(start, last + 1),
      complete: !atEnd,
    });
    if (atEnd) break;
    frame += 1;
    start = i;
  }
  return visits;
}
