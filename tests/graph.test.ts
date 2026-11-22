import { describe, expect, it } from "vitest";
import { frameVisits, traceRolls } from "../src/core/app/highlight";
import { nodeKey, type ScoringRule } from "../src/core/scoring/graph/types";
import { buildGraph, isTerminal } from "../src/core/scoring/graph/walker";

const standard = buildGraph("standard");
const currentFrame = buildGraph("current-frame");

describe("buildGraph", () => {
  it("finds every reachable scoring state", () => {
    expect(standard.nodes).toHaveLength(27_695);
    expect(currentFrame.nodes).toHaveLength(14_261);
  });

  it("starts at the start node and indexes nodes by key", () => {
    expect(nodeKey(standard.nodes[0]!)).toBe("Start");
    standard.nodes.forEach((node, index) => expect(standard.index.get(nodeKey(node))).toBe(index));
  });

  it("only has edges that knock down 0 to 10 pins", () => {
    for (const graph of [standard, currentFrame]) {
      for (const edge of graph.edges) {
        expect(edge.pins).toBeGreaterThanOrEqual(0);
        expect(edge.pins).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe("paths through the graph", () => {
  /** Number of distinct paths from the start node to an end node. */
  function games(rule: ScoringRule): bigint {
    const graph = rule === "standard" ? standard : currentFrame;
    const targets = graph.nodes.map((): number[] => []);
    const incoming = new Array<number>(graph.nodes.length).fill(0);
    for (const edge of graph.edges) {
      targets[edge.from]!.push(edge.to);
      incoming[edge.to]! += 1;
    }
    // Paths are summed in topological order: a node is handled once all its sources are.
    const paths = new Array<bigint>(graph.nodes.length).fill(0n);
    paths[0] = 1n;
    const ready = [0];
    while (ready.length > 0) {
      const node = ready.pop()!;
      for (const target of targets[node]!) {
        paths[target]! += paths[node]!;
        if (--incoming[target]! === 0) ready.push(target);
      }
    }
    return graph.nodes.reduce((sum, node, index) => (isTerminal(rule, node) ? sum + paths[index]! : sum), 0n);
  }

  it("are exactly the possible games", () => {
    // 66 ways to bowl each of the first nine frames, 241 ways to bowl the tenth.
    expect(games("standard")).toBe(66n ** 9n * 241n);
    expect(games("current-frame")).toBe(66n ** 10n);
  });

  it("end in one node per reachable total", () => {
    const totals = (rule: ScoringRule): number[] => {
      const graph = rule === "standard" ? standard : currentFrame;
      return graph.nodes.flatMap((node) => (isTerminal(rule, node) && node.kind !== "start" ? [node.score] : [])).sort((a, b) => a - b);
    };
    expect(totals("standard")).toEqual(Array.from({ length: 301 }, (_, total) => total));
    // Without bonus rolls the totals from 290 to 299 cannot be reached.
    expect(totals("current-frame")).toEqual([...Array.from({ length: 290 }, (_, total) => total), 300]);
  });
});

describe("traceRolls", () => {
  it("leads a perfect game to the end node with 300", () => {
    const trace = traceRolls(standard, Array<number>(12).fill(10));
    expect(trace.edges).toHaveLength(12);
    expect(nodeKey(standard.nodes[trace.path.at(-1)!]!)).toBe("End|300");
  });

  it("splits a game into frames with the bonus pending at their start", () => {
    const trace = traceRolls(standard, [10, 9, 1, 8, 1]);
    const visits = frameVisits(standard, trace);
    expect(visits.map((visit) => [visit.frame, visit.entry, visit.rolls, visit.complete])).toEqual([
      [1, "none", [10], true],
      [2, "strike", [9, 1], true],
      [3, "spare", [8, 1], true],
      [4, "none", [], false],
    ]);
  });

  it("ignores rolls after the tenth frame under current-frame scoring", () => {
    const trace = traceRolls(currentFrame, Array<number>(12).fill(10));
    expect(trace.edges).toHaveLength(10);
  });
});
