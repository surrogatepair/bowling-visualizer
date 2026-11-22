/**
 * Transition rules of both scoring systems and the breadth-first walk that turns
 * them into a {@link ScoreGraph}.
 */
import {
  nodeKey,
  type GraphEdge,
  type GraphNode,
  type Pending,
  type ScoreGraph,
  type ScoringRule,
} from "./types";

export interface Transition {
  readonly pins: number;
  readonly node: GraphNode;
  readonly skipsColumn: boolean;
}

const LAST_FRAME = 10;

/** How many times the next roll is counted again as a bonus for earlier frames. */
function firstRollBonus(pending: Pending): number {
  switch (pending) {
    case "none":
      return 0;
    case "spare":
    case "strike":
      return 1;
    case "double_strike":
      return 2;
  }
}

function carriesStrike(pending: Pending): boolean {
  return pending === "strike" || pending === "double_strike";
}

function standardFrameStart(frame: number, pending: Pending, score: number): Transition[] {
  const bonus = firstRollBonus(pending);
  const carry = carriesStrike(pending);
  const out: Transition[] = [];
  for (let pins = 0; pins <= 10; pins++) {
    const next = score + pins + bonus * pins;
    if (frame === LAST_FRAME) {
      out.push({ pins, node: { kind: "tenth-r1", r1: pins, carry, score: next }, skipsColumn: false });
    } else if (pins === 10) {
      const node: GraphNode = { kind: "frame-end", frame, pending: carry ? "double_strike" : "strike", score: next };
      out.push({ pins, node, skipsColumn: true });
    } else {
      out.push({ pins, node: { kind: "frame-r1", frame, r1: pins, carry, score: next }, skipsColumn: false });
    }
  }
  return out;
}

function standardTransitions(node: GraphNode): Transition[] {
  switch (node.kind) {
    case "start":
      return standardFrameStart(1, "none", 0);
    case "frame-end":
      return standardFrameStart(node.frame + 1, node.pending, node.score);
    case "frame-r1": {
      const out: Transition[] = [];
      for (let pins = 0; pins <= 10 - node.r1; pins++) {
        const score = node.score + pins + (node.carry ? pins : 0);
        const pending: Pending = node.r1 + pins === 10 ? "spare" : "none";
        out.push({ pins, node: { kind: "frame-end", frame: node.frame, pending, score }, skipsColumn: false });
      }
      return out;
    }
    case "tenth-r1": {
      const out: Transition[] = [];
      const strike = node.r1 === 10;
      const limit = strike ? 10 : 10 - node.r1;
      for (let pins = 0; pins <= limit; pins++) {
        const score = node.score + pins + (node.carry ? pins : 0);
        if (strike) {
          const r3Max = pins === 10 ? 10 : 10 - pins;
          out.push({ pins, node: { kind: "tenth-r2", r3Max, score }, skipsColumn: false });
        } else if (node.r1 + pins === 10) {
          out.push({ pins, node: { kind: "tenth-r2", r3Max: 10, score }, skipsColumn: false });
        } else {
          out.push({ pins, node: { kind: "end", score }, skipsColumn: true });
        }
      }
      return out;
    }
    case "tenth-r2": {
      const out: Transition[] = [];
      for (let pins = 0; pins <= node.r3Max; pins++) {
        out.push({ pins, node: { kind: "end", score: node.score + pins }, skipsColumn: false });
      }
      return out;
    }
    case "end":
      return [];
  }
}

/** Points awarded for a strike under current-frame scoring. */
export const CURRENT_FRAME_STRIKE = 30;
/** Points awarded for a spare under current-frame scoring, on top of the first roll. */
export const CURRENT_FRAME_SPARE = 10;

function currentFrameStart(frame: number, score: number): Transition[] {
  const out: Transition[] = [];
  for (let pins = 0; pins <= 10; pins++) {
    if (pins === 10) {
      const node: GraphNode = { kind: "frame-end", frame, pending: "none", score: score + CURRENT_FRAME_STRIKE };
      out.push({ pins, node, skipsColumn: true });
    } else {
      out.push({ pins, node: { kind: "frame-r1", frame, r1: pins, carry: false, score: score + pins }, skipsColumn: false });
    }
  }
  return out;
}

function currentFrameTransitions(node: GraphNode): Transition[] {
  switch (node.kind) {
    case "start":
      return currentFrameStart(1, 0);
    case "frame-end":
      return node.frame >= LAST_FRAME ? [] : currentFrameStart(node.frame + 1, node.score);
    case "frame-r1": {
      const out: Transition[] = [];
      for (let pins = 0; pins <= 10 - node.r1; pins++) {
        const spare = node.r1 + pins === 10;
        const score = node.score + (spare ? CURRENT_FRAME_SPARE : pins);
        out.push({ pins, node: { kind: "frame-end", frame: node.frame, pending: "none", score }, skipsColumn: false });
      }
      return out;
    }
    default:
      return [];
  }
}

/** All rolls possible at `node`, in ascending pin order. */
export function transitions(rule: ScoringRule, node: GraphNode): Transition[] {
  return rule === "standard" ? standardTransitions(node) : currentFrameTransitions(node);
}

/** True when no further roll can be thrown at `node`. */
export function isTerminal(rule: ScoringRule, node: GraphNode): boolean {
  if (node.kind === "end") return true;
  return rule === "current-frame" && node.kind === "frame-end" && node.frame >= LAST_FRAME;
}

/**
 * Position of a node in the left-to-right flow of a game: the start, then for every
 * frame "after roll 1" and "frame end" (plus "after roll 2" in a standard tenth frame).
 */
function stage(node: GraphNode): number {
  switch (node.kind) {
    case "start":
      return 0;
    case "frame-r1":
      return 2 * node.frame - 1;
    case "frame-end":
      return 2 * node.frame;
    case "tenth-r1":
      return 2 * LAST_FRAME - 1;
    case "tenth-r2":
      return 2 * LAST_FRAME;
    case "end":
      return 2 * LAST_FRAME + 1;
  }
}

/**
 * Builds the complete state graph of a scoring rule. Nodes are expanded stage by
 * stage, within a stage in the order they were discovered; a strike therefore does
 * not let the walk run ahead into the next frame.
 */
export function buildGraph(rule: ScoringRule): ScoreGraph {
  const start: GraphNode = { kind: "start" };
  const nodes: GraphNode[] = [start];
  const index = new Map<string, number>([[nodeKey(start), 0]]);
  const edges: GraphEdge[] = [];
  const outgoing: { offset: number; count: number }[] = [{ offset: 0, count: 0 }];
  const stages: number[][] = [[0]];

  for (let current = 0; current < stages.length; current++) {
    const members = stages[current];
    if (!members) continue;
    for (const from of members) {
      const offset = edges.length;
      for (const step of transitions(rule, nodes[from]!)) {
        const key = nodeKey(step.node);
        let to = index.get(key);
        if (to === undefined) {
          to = nodes.length;
          nodes.push(step.node);
          outgoing.push({ offset: 0, count: 0 });
          index.set(key, to);
          (stages[stage(step.node)] ??= []).push(to);
        }
        edges.push({ from, to, pins: step.pins, skipsColumn: step.skipsColumn });
      }
      outgoing[from] = { offset, count: edges.length - offset };
    }
  }
  return { rule, nodes, edges, outgoing, index };
}
