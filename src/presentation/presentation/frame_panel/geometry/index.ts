/**
 * Geometry and static scene of the "Frame Scoring Flow" view: one row of panels per
 * kind of frame, each row closed by a summary panel when it has several entry states.
 */
import { CATEGORY_ORDER, type Category, type ScoringRule } from "../../../../core/scoring/graph/types";
import { el, group, path, type ElementSpec } from "../../../render/chart";
import { dotPath, formatNumber, framePath, frameTicksPath, gridLinesPath, ribbonPath } from "../../chart";
import { GRAPH_SVG_HEIGHT, GRAPH_SVG_WIDTH, type Point } from "../../graph";
import { categoryMarker } from "../../labels";
import { buildPanelModel, panelCaption, panelRows, type PanelModel, type PanelSpec } from "../model";
import {
  PANEL_CONTENT_TOP,
  PANEL_GAP,
  PANEL_PIXELS_PER_POINT,
  PANEL_ROWS_TOP,
  PANEL_SCORE_STEP,
  PANEL_SPAN,
  PANEL_WIDTH,
  PLOT_BOX,
  createPanelLayout,
  rowMetrics,
  type PanelLayout,
} from "./layout";
import { MERGED_ENTRY_SPACING, MERGED_INSET, MERGED_OUTCOME_X, buildMergedGeometry, type MergedGeometry } from "./merged";

export const FRAMES_TITLE = "Frame Scoring Flow";
const TITLE_POSITION: Point = [GRAPH_SVG_WIDTH / 2, 50];
const TICK_LENGTH = 6;
/** Width of panel edge ribbons. */
const RIBBON_WIDTH = 1;
/** Vertical offsets below the baseline. */
const BELOW = { columnLabels: 30, bracket: 38, bracketDepth: 8, caption: 66, entryMarker: 22, mergedLabels: 44 } as const;
const Y_LABEL_GAP = 3;
/** The coloured bar under each entry-state column of a summary panel. */
const ENTRY_MARKER = { width: MERGED_ENTRY_SPACING * 0.7, height: 3 } as const;

/** A frame panel with everything needed to draw onto it. */
export interface EntryPanelGeometry {
  readonly kind: "entry";
  readonly model: PanelModel;
  readonly layout: PanelLayout;
  /** Panel origin inside the frames SVG. */
  readonly origin: Point;
  /** Content origin (x = 0 at the entry node) inside the frames SVG. */
  readonly contentOrigin: Point;
  readonly points: readonly Point[];
  readonly waypoints: readonly Point[];
}

export interface MergedPanelGeometry {
  readonly kind: "merged";
  readonly merged: MergedGeometry;
  readonly origin: Point;
  readonly contentOrigin: Point;
  readonly baseline: number;
  readonly height: number;
  /** Indices (into {@link FramesGeometry.panels}) of the entry panels it summarises. */
  readonly entries: readonly number[];
}

export type PanelGeometry = EntryPanelGeometry | MergedPanelGeometry;

export interface FramesGeometry {
  readonly rule: ScoringRule;
  readonly panels: readonly PanelGeometry[];
  /** Finds the entry panel for a frame: by entry state and whether it is the tenth frame. */
  panelFor(spec: Pick<PanelSpec, "entry" | "tenth">): number | undefined;
}

export function computeFramesGeometry(rule: ScoringRule): FramesGeometry {
  const panels: PanelGeometry[] = [];
  let top = PANEL_ROWS_TOP;
  for (const row of panelRows(rule)) {
    const models = row.map(buildPanelModel);
    const maxDelta = models.reduce((max, model) => Math.max(max, model.maxDelta), 0);
    const { baseline, height } = rowMetrics(maxDelta);
    const count = models.length + (models.length > 1 ? 1 : 0);
    const rowWidth = count * PANEL_WIDTH + (count - 1) * PANEL_GAP;
    let left = (GRAPH_SVG_WIDTH - rowWidth) / 2;

    const entryIndices: number[] = [];
    const layouts: PanelLayout[] = [];
    for (const model of models) {
      const layout = createPanelLayout(model.spec, maxDelta);
      layouts.push(layout);
      entryIndices.push(panels.length);
      panels.push({
        kind: "entry",
        model,
        layout,
        origin: [left, top],
        contentOrigin: [left + PLOT_BOX.left + layout.inset, top + PANEL_CONTENT_TOP],
        points: model.nodes.map((node) => layout.position(node)),
        waypoints: model.waypoints.map((_, index) => layout.waypoint(model, index)),
      });
      left += PANEL_WIDTH + PANEL_GAP;
    }
    if (models.length > 1) {
      panels.push({
        kind: "merged",
        merged: buildMergedGeometry(models, layouts),
        origin: [left, top],
        contentOrigin: [left + PLOT_BOX.left + MERGED_INSET, top + PANEL_CONTENT_TOP],
        baseline,
        height,
        entries: entryIndices,
      });
    }
    top += height + PANEL_GAP;
  }

  const lookup = new Map<string, number>();
  panels.forEach((panel, index) => {
    if (panel.kind === "entry") lookup.set(`${panel.model.spec.entry}|${panel.model.spec.tenth}`, index);
  });
  return { rule, panels, panelFor: (spec) => lookup.get(`${spec.entry}|${spec.tenth}`) };
}

/** Collects items into classes while remembering the order classes first appeared in. */
class OrderedGroups<T> {
  private readonly groups = new Map<string, T[]>();

  add(key: string, item: T): void {
    const list = this.groups.get(key);
    if (list) list.push(item);
    else this.groups.set(key, [item]);
  }

  entries(): IterableIterator<[string, T[]]> {
    return this.groups.entries();
  }
}

function gridLayer(inset: number, baseline: number, xTicks: readonly number[], axisClass: string, extra: ElementSpec): ElementSpec {
  const left = -inset;
  const top = -PLOT_BOX.overhang;
  const height = baseline + 2 * PLOT_BOX.overhang;
  const step = PANEL_SCORE_STEP * PANEL_PIXELS_PER_POINT;
  const yTicks: number[] = [];
  for (let y = baseline; y >= 0; y -= step) yTicks.push(y);
  return group("grid-layer", [
    path("major-y-grid", gridLinesPath(left, PLOT_BOX.width, baseline, step, yTicks.length)),
    path(`axis plot-frame ${axisClass}`, framePath(left, top, PLOT_BOX.width, height)),
    path(`axis plot-frame-ticks ${axisClass}`, frameTicksPath({ left, top, width: PLOT_BOX.width, height, xTicks, yTicks, length: TICK_LENGTH })),
    extra,
  ]);
}

function yAxisLabels(inset: number, baseline: number): ElementSpec {
  const labels: ElementSpec[] = [];
  const step = PANEL_SCORE_STEP * PANEL_PIXELS_PER_POINT;
  for (let y = baseline, score = 0; y >= 0; y -= step, score += PANEL_SCORE_STEP) {
    labels.push(el("text", [["x", -inset - Y_LABEL_GAP], ["y", y], ["dy", "0.32em"]], [String(score)]));
  }
  return group("axis y-axis-labels", labels);
}

function panelShell(origin: Point, inset: number, height: number, layers: readonly ElementSpec[]): ElementSpec {
  return el("g", [["class", "frame-panel"], ["transform", `translate(${formatNumber(origin[0])}, ${formatNumber(origin[1])})`]], [
    el("rect", [["class", "panel-background"], ["width", PANEL_WIDTH], ["height", height]]),
    el("g", [["transform", `translate(${formatNumber(PLOT_BOX.left + inset)}, ${PANEL_CONTENT_TOP})`]], layers),
  ]);
}

function entryPanelScene(panel: EntryPanelGeometry): ElementSpec {
  const { model, layout, points, waypoints } = panel;
  const { baseline } = layout;
  const entryCategory = model.nodes[0]!.category;

  const edges = new OrderedGroups<string>();
  const drawnWaypoints = new Set<number>();
  for (const edge of model.edges) {
    const key = `edge-ribbons panel-edges category-${model.nodes[edge.to]!.category}`;
    const [x1, y1] = points[edge.from]!;
    const [x2, y2] = points[edge.to]!;
    if (edge.waypoint === null) {
      edges.add(key, ribbonPath(x1, y1, x2, y2, RIBBON_WIDTH));
      continue;
    }
    const [wx, wy] = waypoints[edge.waypoint]!;
    edges.add(key, ribbonPath(x1, y1, wx, wy, RIBBON_WIDTH));
    if (!drawnWaypoints.has(edge.waypoint)) {
      drawnWaypoints.add(edge.waypoint);
      edges.add(key, ribbonPath(wx, wy, x2, y2, RIBBON_WIDTH));
    }
  }

  const nodes = new OrderedGroups<Point>();
  for (const node of model.nodes) {
    nodes.add(`chart-round-stroke panel-marker chart-node chart-node-${categoryMarker(node.category)} category-${node.category}`, points[node.index]!);
  }

  const virtual = new OrderedGroups<Point>();
  for (const waypoint of model.waypoints) virtual.add(waypoint.category, waypoints[waypoint.index]!);
  const virtualPaths: ElementSpec[] = [];
  for (const layer of ["chart-ghost", "chart-ghost-inner"]) {
    for (const [category, list] of virtual.entries()) {
      virtualPaths.push(path(`chart-round-stroke panel-marker ${layer} category-${category}`, dotPath(list)));
    }
  }

  const columnNames = model.spec.tenth ? ["Start", "Roll 1", "Roll 2", "End"] : ["Start", "Roll 1", "End"];
  const bracketY = baseline + BELOW.bracket;
  const bracket = path("frame-bracket", `M0,${bracketY}v${BELOW.bracketDepth}H${PANEL_SPAN}v-${BELOW.bracketDepth}`);

  return panelShell(panel.origin, layout.inset, layout.height, [
    gridLayer(layout.inset, baseline, layout.columns, `panel-axis category-${entryCategory}`, bracket),
    group("plot-layer", [
      group("edges", [...edges.entries()].map(([className, parts]) => path(className, parts.join("")))),
      group("nodes", [...nodes.entries()].map(([className, list]) => path(className, dotPath(list)))),
      group("virtual-nodes", virtualPaths),
      group("highlight"),
    ]),
    group("text-layer", [
      yAxisLabels(layout.inset, baseline),
      group("x-axis-labels", layout.columns.map((x, i) => el("text", [["x", x], ["y", baseline + BELOW.columnLabels]], [columnNames[i]!]))),
      el("text", [["class", "frame-bracket-label"], ["x", PANEL_SPAN / 2], ["y", baseline + BELOW.caption]], [panelCaption(model.spec)]),
    ]),
  ]);
}

function mergedPanelScene(panel: MergedPanelGeometry, entryCategories: readonly Category[]): ElementSpec {
  const { merged, baseline } = panel;
  const entryXs = entryCategories.map((_, i) => MERGED_ENTRY_SPACING * i);

  const markers = el("g", [], entryCategories.map((category, i) =>
    el("rect", [
      ["class", `panel-entry-marker category-${category}`],
      ["x", formatNumber(entryXs[i]! - ENTRY_MARKER.width / 2)],
      ["y", baseline + BELOW.entryMarker],
      ["width", formatNumber(ENTRY_MARKER.width)],
      ["height", ENTRY_MARKER.height],
    ]),
  ));

  const edges = new Map<Category, string[]>();
  const outcomeNodes = new Map<Category, Point[]>();
  for (const category of merged.categories) {
    edges.set(category, []);
    outcomeNodes.set(category, []);
  }
  for (const outcome of merged.outcomes) {
    const [x1, y1] = merged.sources[outcome.firstSource]!.point;
    const [x2, y2] = outcome.point;
    edges.get(outcome.category)!.push(ribbonPath(x1, y1, x2, y2, RIBBON_WIDTH));
    outcomeNodes.get(outcome.category)!.push(outcome.point);
  }
  const ordered = CATEGORY_ORDER.filter((category) => merged.categories.includes(category));

  const sourcePaths = merged.sourceGroups.map((sourceGroup) =>
    path(
      `chart-round-stroke panel-source-node chart-node-${categoryMarker(sourceGroup.category)} category-${sourceGroup.category}`,
      dotPath(sourceGroup.members.map((index) => merged.sources[index]!.point)),
    ),
  );
  const outcomePaths = ordered.map((category) =>
    path(`chart-round-stroke panel-marker chart-node chart-node-${categoryMarker(category)} category-${category}`, dotPath(outcomeNodes.get(category)!)),
  );

  const labelY = baseline + BELOW.mergedLabels;
  const entryCentre = (entryXs[0]! + entryXs[entryXs.length - 1]!) / 2;
  return panelShell(panel.origin, MERGED_INSET, panel.height, [
    gridLayer(MERGED_INSET, baseline, [...entryXs, MERGED_OUTCOME_X], "chart-axis", markers),
    group("plot-layer", [
      group("edges", ordered.map((category) => path(`edge-ribbons panel-edges category-${category}`, edges.get(category)!.join("")))),
      group("nodes", [...sourcePaths, ...outcomePaths]),
      group("highlight"),
    ]),
    group("text-layer", [
      yAxisLabels(MERGED_INSET, baseline),
      group("x-axis-labels", [
        el("text", [["x", entryCentre], ["y", labelY]], ["Entry State"]),
        el("text", [["x", MERGED_OUTCOME_X], ["y", labelY]], ["Outcome"]),
      ]),
    ]),
  ]);
}

/** The complete static scene; each panel's `highlight` group is filled in separately. */
export function buildFramesScene(geometry: FramesGeometry): ElementSpec {
  const panels = geometry.panels.map((panel) => {
    if (panel.kind === "entry") return entryPanelScene(panel);
    const categories = panel.entries.map((index) => {
      const entry = geometry.panels[index] as EntryPanelGeometry;
      return entry.model.nodes[0]!.category;
    });
    return mergedPanelScene(panel, categories);
  });
  return el(
    "svg",
    [
      ["class", "responsive-svg responsive-svg-block responsive-svg-surface"],
      ["viewBox", `0 0 ${GRAPH_SVG_WIDTH} ${GRAPH_SVG_HEIGHT}`],
      ["preserveAspectRatio", "xMidYMid meet"],
      ["role", "img"],
      ["aria-label", FRAMES_TITLE],
    ],
    [
      el("text", [["class", "chart-title"], ["x", TITLE_POSITION[0]], ["y", TITLE_POSITION[1]]], [FRAMES_TITLE]),
      group("rows-base", panels),
    ],
  );
}
