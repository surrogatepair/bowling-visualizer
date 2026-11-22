/**
 * Statements of the original design documents (product specification and state
 * model), checked one by one.
 */
import { describe, expect, it } from "vitest";
import { traceRolls } from "../src/core/app/highlight";
import { parseRolls } from "../src/core/notation";
import { scoreGame } from "../src/core/scoring/frames";
import type { ScoreGraph } from "../src/core/scoring/graph/types";
import { buildGraph, isTerminal } from "../src/core/scoring/graph/walker";
import { parseComparisonInput, parseGameLine } from "../src/presentation/app/comparison";
import { buildQuery, parseQuery } from "../src/presentation/app/url";

const DEFAULT_COLOR = "#dc2626";
const standard = buildGraph("standard");
const currentFrame = buildGraph("current-frame");

function valid(text: string): boolean {
  return parseRolls(text).ok;
}

/** Provisional score after each roll of a game. */
function scores(graph: ScoreGraph, text: string): number[] {
  const trace = traceRolls(graph, parseGameLine(text).rolls);
  return trace.path.slice(1).map((index) => {
    const node = graph.nodes[index]!;
    return node.kind === "start" ? 0 : node.score;
  });
}

describe("notation and validation", () => {
  it("infers frame boundaries and accepts partial games", () => {
    expect(valid("X X 9")).toBe(true);
    expect(valid("56")).toBe(false);
    expect(valid("/")).toBe(false);
  });

  it("applies the rack rules of the tenth frame", () => {
    const nine = "X X X X X X X X X ";
    for (const tenth of ["X54", "X3/", "9/X", "XXX", "9-"]) expect(valid(nine + tenth), tenth).toBe(true);
    for (const tenth of ["X56", "9//", "XX/", "9-1"]) expect(valid(nine + tenth), tenth).toBe(false);
  });

  it("rejects a thirteenth strike but accepts separators after the last roll", () => {
    expect(valid("X X X X X X X X X XXX X")).toBe(false);
    expect(valid("X X X X X X X X X XXX | \t")).toBe(true);
    expect(parseGameLine("X X X X X X X X X XXX #00ff00").error).toBeNull();
  });

  it("requires colour tokens to be six hex digits at the end of the line", () => {
    expect(parseGameLine("X #00FF00").color).toBe("#00ff00");
    for (const line of ["X #0f0", "#00ff00 X", "X #00ff00 9", "X #00ff000"]) expect(parseGameLine(line).error, line).not.toBeNull();
  });

  it("ignores white space around a line and around its colour", () => {
    // U+3000 is what a Japanese input method types for a space.
    for (const line of ["　X 9/　", "X 9/ ", " X 9/", "X 9/　#00ff00　", "X 9/\u0085"]) {
      const entry = parseGameLine(line);
      expect(entry.error, JSON.stringify(line)).toBeNull();
      expect(entry.text).toBe("X 9/");
    }
    // Inside a line it separates rolls, like a plain space.
    expect(parseGameLine("X　9/").rolls).toEqual([10, 9, 1]);
    // A byte order mark is not white space.
    expect(parseGameLine("X 9/﻿").error).not.toBeNull();
    expect(parseGameLine("X #00ff00﻿").color).toBeNull();
  });

  it("treats blank and separator-only lines as empty, even with a colour", () => {
    const entries = parseComparisonInput("X\n\n 　 \n| | #00ff00\n9/");
    expect(entries.filter((entry) => entry.rolls.length > 0 || entry.error !== null)).toHaveLength(2);
  });
});

describe("standard scoring", () => {
  it("adds bonuses as the rolls occur", () => {
    expect(scores(standard, "5/ 34")).toEqual([5, 10, 16, 20]);
    expect(scores(standard, "X X X")).toEqual([10, 30, 60]);
    expect(scores(standard, "X X X X X X X X X XXX").slice(-4)).toEqual([240, 270, 290, 300]);
  });
});

describe("current-frame scoring", () => {
  it("scores every frame on its own", () => {
    expect(scoreGame("current-frame", [3, 4]).total).toBe(7);
    expect(scoreGame("current-frame", [3, 7]).total).toBe(13);
    expect(scoreGame("current-frame", [10]).total).toBe(30);
    expect(scores(currentFrame, "3/ X")).toEqual([3, 13, 43]);
  });

  it("consumes ten strikes of a twelve-strike game", () => {
    const score = scoreGame("current-frame", Array<number>(12).fill(10));
    expect([score.rollsUsed, score.total, score.complete]).toEqual([10, 300, true]);
  });
});

describe("graph invariants", () => {
  it.each([
    ["standard", standard, 27_695, 196_319],
    ["current-frame", currentFrame, 14_261, 96_520],
  ] as const)("%s graph has the documented size", (_rule, graph, nodes, edges) => {
    expect(graph.nodes).toHaveLength(nodes);
    expect(graph.edges).toHaveLength(edges);
  });

  it.each([
    ["standard", standard],
    ["current-frame", currentFrame],
  ] as const)("%s scores stay within 0..300 and never decrease", (rule, graph) => {
    const score = (index: number): number => {
      const node = graph.nodes[index]!;
      return node.kind === "start" ? 0 : node.score;
    };
    const reached = new Set<number>([0]);
    for (const edge of graph.edges) {
      expect(score(edge.to)).toBeGreaterThanOrEqual(score(edge.from));
      expect(score(edge.to)).toBeLessThanOrEqual(300);
      // Nodes are discovered in order, so an edge never starts from an unreached node.
      expect(reached.has(edge.from)).toBe(true);
      reached.add(edge.to);
    }
    expect(reached.size).toBe(graph.nodes.length);
    expect(graph.nodes.some((node) => isTerminal(rule, node))).toBe(true);
  });
});

describe("shared URLs", () => {
  const query = (text: string): string => buildQuery([parseGameLine(text)], "standard", DEFAULT_COLOR);
  const restored = (search: string): string => parseQuery(search, DEFAULT_COLOR).games.join("\n");

  it("writes compact roll values", () => {
    expect(query("X-/")).toBe("rolls=x0x");
    expect(query("9/")).toBe("rolls=91");
  });

  it("restores contextual notation and keeps an invalid rest for display", () => {
    expect(restored("?rolls=x0x")).toBe("X -/");
    expect(restored("?rolls=0x?")).toBe("-/ ?");
    expect(query(restored("?rolls=0x?"))).toBe("rolls=0x");
  });

  it("lets the first view parameter decide", () => {
    expect(parseQuery("?view=current-frame&view=standard", DEFAULT_COLOR).view).toBe("current-frame");
    expect(parseQuery("?view=bogus&view=current-frame", DEFAULT_COLOR).view).toBe("standard");
  });

  it("pairs colours with games by position, empty games included", () => {
    expect(restored("?rolls=&rolls=xx&color=ff0000&color=00ff00")).toBe("X X #00ff00");
    expect(restored("?rolls=x&rolls=9&color=zzzzzz")).toBe(`X ${DEFAULT_COLOR}\n9`);
    expect(parseQuery("?rolls=&rolls=", DEFAULT_COLOR).comparing).toBe(true);
    expect(parseQuery("?rolls=x", DEFAULT_COLOR).comparing).toBe(false);
  });
});
