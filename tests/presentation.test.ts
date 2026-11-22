import { describe, expect, it } from "vitest";
import { traceRolls } from "../src/core/app/highlight";
import type { ScoringRule } from "../src/core/scoring/graph/types";
import { buildGraph } from "../src/core/scoring/graph/walker";
import { parseGameLine } from "../src/presentation/app/comparison";
import { dotPath, formatCount, formatNumber, segmentPath } from "../src/presentation/presentation/chart";
import { buildFramesScene, computeFramesGeometry } from "../src/presentation/presentation/frame_panel/geometry";
import { frameRollsText } from "../src/presentation/presentation/frame_panel/geometry/tooltip";
import { clientToSvg, nearestTarget, placeTooltip } from "../src/presentation/presentation/frame_panel/interaction";
import { createGraphLayout } from "../src/presentation/presentation/graph";
import { buildGraphScene, computeGraphGeometry } from "../src/presentation/presentation/graph_scene";
import { graphTooltipTargets, type TooltipTarget } from "../src/presentation/presentation/tooltip";
import type { ElementSpec } from "../src/presentation/render/chart";

/** 64-bit FNV-1a over the serialized scene, as hex. */
function digest(scene: ElementSpec): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of JSON.stringify(scene)) {
    hash ^= BigInt(char.codePointAt(0)!);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

function graphGeometry(rule: ScoringRule) {
  return computeGraphGeometry(buildGraph(rule), createGraphLayout(rule));
}

describe("number formatting", () => {
  it("writes compact path data", () => {
    expect(formatNumber(12)).toBe("12");
    expect(formatNumber(0.5)).toBe(".5");
    expect(formatNumber(-0.25)).toBe("-.25");
    expect(formatNumber(1.005)).toBe("1");
    expect(segmentPath(0, 180, 116, 120)).toBe("M0,180L116,120");
    expect(dotPath([[0, 180], [197, 120]])).toBe("M0,180h.01M197,120h.01");
    expect(formatCount(27695)).toBe("27,695");
  });
});

/**
 * The static scenes were compared element by element with the original build; these
 * digests pin that verified output.
 */
describe("static scenes", () => {
  it.each([
    ["standard", "d825e984df1aa740", "e0fcdef8bc4287fa"],
    ["current-frame", "e6e554035b033d72", "71d330fc68010332"],
  ] as const)("%s scoring", (rule, graphDigest, framesDigest) => {
    expect([digest(buildGraphScene(graphGeometry(rule))), digest(buildFramesScene(computeFramesGeometry(rule)))]).toEqual([graphDigest, framesDigest]);
  });
});

describe("tooltips", () => {
  const geometry = graphGeometry("standard");
  const targets = graphTooltipTargets(geometry, [traceRolls(geometry.graph, parseGameLine("9- X 8- 7/ X X 72 X 81 X71").rolls)]);
  const at = (x: number, y: number): TooltipTarget | undefined => targets.find((target) => target.point[0] === x && target.point[1] === y);

  it("describe the nodes of a game as the original did", () => {
    expect(at(40, 620)?.content).toEqual({ title: "Start", rows: [["Score", "0"]] });
    expect(at(283, 582)?.content).toEqual({
      title: "Frame 2 - end",
      rows: [["Score", "19"], ["State", "Strike bonus pending (+2 rolls)"]],
    });
    expect(at(357, 550)?.content).toEqual({
      title: "Frame 3 - after R1",
      rows: [["R1", "8 pins"], ["Score", "35"], ["Carry from prev", "Yes"]],
    });
    expect(at(1244, 310)?.content).toEqual({
      title: "Frame 10 - after R2",
      rows: [["Score", "155"], ["R3 max pins", "3 (remaining)"]],
    });
    expect(at(1300, 308)?.content).toEqual({ title: "Game end", rows: [["Final score", "156"]] });
  });

  it("pick the nearest node within reach", () => {
    expect(nearestTarget(targets, [45, 615], 18)).toBe(0);
    expect(nearestTarget(targets, [45, 500], 18)).toBeNull();
  });

  it("write in-frame rolls the way they are entered", () => {
    expect(frameRollsText([9, 0], false)).toBe("9-");
    expect(frameRollsText([7, 3], false)).toBe("7/");
    expect(frameRollsText([10, 7, 1], true)).toBe("X71");
    expect(frameRollsText([9, 1, 10], true)).toBe("9/X");
  });

  it("map pointer positions into the scaled SVG", () => {
    expect(clientToSvg([110, 220], { left: 10, top: 20, width: 720, height: 405 }, [-50, -85, 1440, 810])).toEqual([150, 315]);
  });

  it("stay inside their container", () => {
    const size = { width: 100, height: 50 };
    const container = { width: 400, height: 300 };
    expect(placeTooltip([50, 60], size, container, 12)).toEqual([62, 72]);
    expect(placeTooltip([350, 280], size, container, 12)).toEqual([238, 218]);
    expect(placeTooltip([90, 20], { width: 390, height: 290 }, container, 12)).toEqual([0, 0]);
  });
});
