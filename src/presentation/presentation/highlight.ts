/**
 * Highlighting of games on the state graph: the route of each game is drawn on top
 * of the static scene, coloured per series.
 */
import type { FrameVisit, HighlightTrace } from "../../core/app/highlight";
import { CATEGORY_ORDER, nodeCategory, type Category } from "../../core/scoring/graph/types";
import { el, type ElementSpec } from "../render/chart";
import { dotPath, formatNumber } from "./chart";
import type { Point } from "./graph";
import type { GraphGeometry } from "./graph_scene";

/** One highlighted game. */
export interface HighlightSeries {
  /** CSS colour of the series. */
  readonly color: string;
  readonly trace: HighlightTrace;
  readonly visits: readonly FrameVisit[];
}

/** Class names that differ between single-game and comparison rendering. */
export interface HighlightMode {
  readonly comparison: boolean;
}

export function rootClass(base: string, mode: HighlightMode): string {
  return mode.comparison ? `${base} chart-comparison-root` : base;
}

export function colorGroupClass(mode: HighlightMode): string {
  return mode.comparison ? "highlight-color-group chart-comparison-colors" : "highlight-color-group";
}

export function seriesClass(base: string, mode: HighlightMode): string {
  return mode.comparison ? `${base} chart-comparison-series` : base;
}

/** A polyline through the given points as one sub-path. */
export function polyline(points: readonly Point[]): string {
  let d = "";
  points.forEach(([x, y], i) => {
    d += `${i === 0 ? "M" : "L"}${formatNumber(x)},${formatNumber(y)}`;
  });
  return d;
}

function highlightPath(className: string, d: string): ElementSpec {
  return el("path", [["class", `chart-round-stroke ${className}`], ["d", d]]);
}

/** Points an edge of the trace passes through, including a virtual waypoint. */
function edgePoints(geometry: GraphGeometry, edgeIndex: number): Point[] {
  const edge = geometry.graph.edges[edgeIndex]!;
  const waypoint = geometry.waypoints.get(edgeIndex);
  const from = geometry.points[edge.from]!;
  const to = geometry.points[edge.to]!;
  return waypoint ? [from, waypoint.point, to] : [from, to];
}

/**
 * Series that share a colour, colours in order of first appearance. Members are indices
 * into the series list.
 */
export function groupByColor(series: readonly HighlightSeries[]): { color: string; members: number[] }[] {
  const groups: { color: string; members: number[] }[] = [];
  series.forEach((item, index) => {
    const group = groups.find((candidate) => candidate.color === item.color);
    if (group) group.members.push(index);
    else groups.push({ color: item.color, members: [index] });
  });
  return groups;
}

function seriesGroup(geometry: GraphGeometry, series: HighlightSeries, mode: HighlightMode): ElementSpec {
  const { graph, points } = geometry;
  const lines = new Map<Category, string>(CATEGORY_ORDER.map((category) => [category, ""]));
  const dots = new Map<Category, Point[]>(CATEGORY_ORDER.map((category) => [category, []]));
  let allLines = "";
  for (const edgeIndex of series.trace.edges) {
    const d = polyline(edgePoints(geometry, edgeIndex));
    allLines += d;
    const category = nodeCategory(graph.nodes[graph.edges[edgeIndex]!.to]!);
    lines.set(category, lines.get(category)! + d);
  }
  const allDots: Point[] = [];
  for (const nodeIndex of series.trace.path) {
    allDots.push(points[nodeIndex]!);
    dots.get(nodeCategory(graph.nodes[nodeIndex]!))!.push(points[nodeIndex]!);
  }
  // A light halo keeps a single trace legible on top of the graph; overlapping
  // comparison traces are blended instead and get none.
  const children: ElementSpec[] = [
    highlightPath("chart-highlight-line chart-highlight-halo", mode.comparison ? "" : allLines),
    highlightPath("chart-highlight-dot chart-highlight-halo", mode.comparison ? "" : dotPath(allDots)),
  ];
  for (const category of CATEGORY_ORDER) children.push(highlightPath("chart-highlight-line", lines.get(category)!));
  for (const category of CATEGORY_ORDER) children.push(highlightPath("chart-highlight-dot", dotPath(dots.get(category)!)));
  return el("g", [["class", seriesClass("highlight", mode)]], children, [["--series-color", series.color]]);
}

/** Children of the graph's `highlights` group: one group per colour, one child per game. */
export function buildGraphHighlights(geometry: GraphGeometry, series: readonly HighlightSeries[], mode: HighlightMode): ElementSpec[] {
  // A game without a single valid roll has no route to show.
  const routed = series.filter((item) => item.trace.edges.length > 0);
  return groupByColor(routed).map((group) =>
    el("g", [["class", colorGroupClass(mode)]], group.members.map((index) => seriesGroup(geometry, routed[index]!, mode))),
  );
}
