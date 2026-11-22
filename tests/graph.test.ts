import { describe, expect, it } from "vitest";
import { frameVisits, traceRolls } from "../src/core/app/highlight";
import { nodeKey } from "../src/core/scoring/graph/types";
import { buildGraph } from "../src/core/scoring/graph/walker";

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
