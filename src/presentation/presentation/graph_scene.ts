/**
 * Builds the SVG scene of the scoring state graph: grid, edges, node markers,
 * axis labels, legend and title.
 */
import {
  CATEGORY_ORDER,
  isBoundaryNode,
  nodeCategory,
  type Category,
  type ScoreGraph,
} from "../../core/scoring/graph/types";
import { el, group, path, type ElementSpec } from "../render/chart";
import { dotPath, formatCount, formatNumber, formatPair, framePath, frameTicksPath, gridLinesPath, segmentPath } from "./chart";
import {
  FRAME_COUNT,
  GRAPH_MARGIN_LEFT,
  GRAPH_MARGIN_TOP,
  GRAPH_SVG_HEIGHT,
  GRAPH_SVG_WIDTH,
  MAX_SCORE,
  PIXELS_PER_POINT,
  PLOT_HEIGHT,
  PLOT_WIDTH,
  SCORE_BASELINE,
  type GraphLayout,
  type Point,
} from "./graph";
import { CATEGORY_LEGEND, RULE_TITLE, categoryMarker } from "./labels";

/** Score distance between labelled grid lines and between tick marks. */
const MAJOR_SCORE_STEP = 50;
const MINOR_SCORE_STEP = 10;
const TICK_LENGTH = 6;
/** Frame brackets below the plot. */
const BRACKET = { top: 650, depth: 8, inset: 6, labelY: 680 } as const;
const Y_LABEL_GAP = 8;
const LEGEND = { markerX: 24, labelX: 40, firstY: 36, rowHeight: 24, labelDrop: 5 } as const;
const TITLE_Y = -35;

/** Geometry of a virtual node: its position and the node it leads to. */
export interface Waypoint {
  readonly point: Point;
  readonly target: number;
}

/** Positions of everything in the graph scene, kept for highlighting and hit testing. */
export interface GraphGeometry {
  readonly graph: ScoreGraph;
  readonly layout: GraphLayout;
  /** Position of every node, by node index. */
  readonly points: readonly Point[];
  /** Virtual node of an edge that skips a column, by edge index (undefined otherwise). */
  readonly waypoints: ReadonlyMap<number, Waypoint>;
}

export function computeGraphGeometry(graph: ScoreGraph, layout: GraphLayout): GraphGeometry {
  const points = graph.nodes.map((node) => layout.position(node));
  const waypoints = new Map<number, Waypoint>();
  graph.edges.forEach((edge, index) => {
    if (edge.skipsColumn) waypoints.set(index, { point: layout.waypoint(graph, edge), target: edge.to });
  });
  return { graph, layout, points, waypoints };
}

function edgesPath(geometry: GraphGeometry): string {
  const { graph, points, waypoints } = geometry;
  const drawnWaypoints = new Set<number>();
  const parts: string[] = [];
  graph.edges.forEach((edge, index) => {
    const [x1, y1] = points[edge.from]!;
    const [x2, y2] = points[edge.to]!;
    const waypoint = waypoints.get(index);
    if (!waypoint) {
      parts.push(segmentPath(x1, y1, x2, y2));
      return;
    }
    const [wx, wy] = waypoint.point;
    parts.push(segmentPath(x1, y1, wx, wy));
    // The shared second half is drawn once per virtual node.
    if (!drawnWaypoints.has(edge.to)) {
      drawnWaypoints.add(edge.to);
      parts.push(segmentPath(wx, wy, x2, y2));
    }
  });
  return parts.join("");
}

function nodeMarkers(geometry: GraphGeometry): ElementSpec[] {
  const { graph, points } = geometry;
  const byCategory = new Map<Category, Point[]>();
  graph.nodes.forEach((node, index) => {
    const category = nodeCategory(node);
    let list = byCategory.get(category);
    if (!list) byCategory.set(category, (list = []));
    list.push(points[index]!);
  });
  const out: ElementSpec[] = [];
  for (const category of CATEGORY_ORDER) {
    const list = byCategory.get(category);
    if (!list) continue;
    out.push(path(`chart-round-stroke graph-marker chart-node chart-node-${categoryMarker(category)} category-${category}`, dotPath(list)));
  }
  return out;
}

function virtualNodeMarkers(geometry: GraphGeometry): ElementSpec[] {
  const { graph, waypoints } = geometry;
  const seen = new Set<number>();
  const byCategory = new Map<Category, Point[]>();
  for (const waypoint of waypoints.values()) {
    if (seen.has(waypoint.target)) continue;
    seen.add(waypoint.target);
    const category = nodeCategory(graph.nodes[waypoint.target]!);
    let list = byCategory.get(category);
    if (!list) byCategory.set(category, (list = []));
    list.push(waypoint.point);
  }
  const out: ElementSpec[] = [];
  for (const layer of ["chart-ghost", "chart-ghost-inner"]) {
    for (const category of CATEGORY_ORDER) {
      const list = byCategory.get(category);
      if (list) out.push(path(`chart-round-stroke graph-marker ${layer} category-${category}`, dotPath(list)));
    }
  }
  return out;
}

function bracketsPath(layout: GraphLayout): string {
  let d = "";
  for (let frame = 1; frame <= FRAME_COUNT; frame++) {
    const span = layout.frameWidth(frame) - 2 * BRACKET.inset;
    d += frame === 1 ? `M${formatPair(layout.frameLeft(1) + BRACKET.inset, BRACKET.top)}` : `m${formatPair(2 * BRACKET.inset, 0)}`;
    d += `v${formatNumber(BRACKET.depth)}h${formatNumber(span)}v-${formatNumber(BRACKET.depth)}`;
  }
  return d;
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let value = from; step > 0 ? value <= to : value >= to; value += step) out.push(value);
  return out;
}

function gridLayer(layout: GraphLayout): ElementSpec {
  const left = layout.frameLeft(1);
  const right = layout.frameLeft(FRAME_COUNT) + layout.frameWidth(FRAME_COUNT);
  const halfFrame = layout.frameWidth(1) / 2;
  return group("grid-layer", [
    path("major-y-grid", gridLinesPath(0, PLOT_WIDTH, SCORE_BASELINE, MAJOR_SCORE_STEP * PIXELS_PER_POINT, MAX_SCORE / MAJOR_SCORE_STEP + 1)),
    path("axis plot-frame chart-axis", framePath(0, 0, PLOT_WIDTH, PLOT_HEIGHT)),
    path(
      "axis plot-frame-ticks chart-axis",
      frameTicksPath({
        left: 0,
        top: 0,
        width: PLOT_WIDTH,
        height: PLOT_HEIGHT,
        xTicks: range(left, right, halfFrame),
        yTicks: range(SCORE_BASELINE, SCORE_BASELINE - MAX_SCORE * PIXELS_PER_POINT, -MINOR_SCORE_STEP * PIXELS_PER_POINT),
        length: TICK_LENGTH,
      }),
    ),
    path("frame-brackets", bracketsPath(layout)),
  ]);
}

function yLabels(className: string, x: number): ElementSpec {
  const labels: ElementSpec[] = [];
  for (let score = 0; score <= MAX_SCORE; score += MAJOR_SCORE_STEP) {
    labels.push(el("text", [["x", x], ["y", SCORE_BASELINE - PIXELS_PER_POINT * score], ["dy", "0.32em"]], [String(score)]));
  }
  return group(className, labels);
}

function textLayer(geometry: GraphGeometry): ElementSpec {
  const { graph, layout } = geometry;
  const frameLabels: ElementSpec[] = [];
  for (let frame = 1; frame <= FRAME_COUNT; frame++) {
    const centre = layout.frameLeft(frame) + layout.frameWidth(frame) / 2;
    frameLabels.push(el("text", [["x", centre], ["y", BRACKET.labelY]], [`Frame ${frame}`]));
  }

  const present = new Set(graph.nodes.map(nodeCategory));
  const legendRows: ElementSpec[] = [];
  for (const category of CATEGORY_ORDER) {
    if (!present.has(category)) continue;
    const y = LEGEND.firstY + LEGEND.rowHeight * legendRows.length;
    legendRows.push(
      group("row", [
        el("circle", [["class", `chart-legend-marker chart-node-${categoryMarker(category)} category-${category}`], ["cx", LEGEND.markerX], ["cy", y]]),
        el("text", [["class", "chart-legend-label"], ["x", LEGEND.labelX], ["y", y + LEGEND.labelDrop]], [CATEGORY_LEGEND[category]]),
      ]),
    );
  }

  return group("text-layer", [
    group("axis x-axis-labels", frameLabels),
    yLabels("axis left-y-labels", -Y_LABEL_GAP),
    yLabels("axis right-y-labels", PLOT_WIDTH + Y_LABEL_GAP),
    group("legends", legendRows),
    el("text", [["class", "chart-title"], ["x", PLOT_WIDTH / 2], ["y", TITLE_Y]], [
      el("tspan", [], [`${RULE_TITLE[graph.rule]} scoring`]),
      el("tspan", [["class", "chart-title-count"]], [` - ${formatCount(countRealNodes(graph))} nodes`]),
    ]),
  ]);
}

function countRealNodes(graph: ScoreGraph): number {
  return graph.nodes.length;
}

/** The complete static scene; the `highlights` group is filled in separately. */
export function buildGraphScene(geometry: GraphGeometry): ElementSpec {
  const { graph } = geometry;
  return el(
    "svg",
    [
      ["class", "responsive-svg responsive-svg-absolute responsive-svg-surface"],
      ["viewBox", `${-GRAPH_MARGIN_LEFT} ${-GRAPH_MARGIN_TOP} ${GRAPH_SVG_WIDTH} ${GRAPH_SVG_HEIGHT}`],
      ["preserveAspectRatio", "xMidYMid meet"],
      ["role", "img"],
      ["aria-label", `${RULE_TITLE[graph.rule]} scoring state graph`],
    ],
    [
      gridLayer(geometry.layout),
      group("plot plot-layer", [
        group("edges", [path("edge-ribbons graph-edges", edgesPath(geometry))]),
        group("nodes", nodeMarkers(geometry)),
        group("virtual-nodes", virtualNodeMarkers(geometry)),
        group("highlights"),
      ]),
      textLayer(geometry),
    ],
  );
}

/** True when a node is drawn with the frame-boundary marker. */
export function usesBoundaryMarker(graph: ScoreGraph, index: number): boolean {
  return isBoundaryNode(graph.nodes[index]!);
}
