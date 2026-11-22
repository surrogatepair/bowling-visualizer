/**
 * Highlighting of games on the frame panels. Each frame of a game is drawn in the
 * panel of the state it started in; identical frames collapse into one trace.
 */
import { el, type ElementSpec } from "../../render/chart";
import { dotPath, segmentPath } from "../chart";
import type { Point } from "../graph";
import { colorGroupClass, groupByColor, seriesClass, type HighlightMode, type HighlightSeries } from "../highlight";
import type { EntryPanelGeometry, FramesGeometry, MergedPanelGeometry } from "./geometry";

/** What one series covers in an entry panel. */
export interface PanelCoverage {
  /** Visited node indices. */
  readonly nodes: ReadonlySet<number>;
  /** Used edges, as indices into the panel model's edge list. */
  readonly edges: ReadonlySet<number>;
}

/** What one series covers in a summary panel: source positions (indices into `sources`). */
export interface MergedCoverage {
  readonly sources: ReadonlySet<number>;
}

/** One pass of a game through a panel node: the frame it happened in and the rolls so far. */
export interface NodePass {
  readonly panel: number;
  readonly node: number;
  /** One-based frame number. */
  readonly frame: number;
  /** Pins of the rolls thrown in the frame up to this node. */
  readonly rolls: readonly number[];
}

export interface SeriesCoverage {
  /** Coverage by panel index; absent for panels the series never reaches. */
  readonly entry: ReadonlyMap<number, PanelCoverage>;
  readonly merged: ReadonlyMap<number, MergedCoverage>;
  /** Every node the game passes on the entry panels, in playing order. */
  readonly passes: readonly NodePass[];
}

/** Works out which panel nodes and edges a traced game touches. */
export function coverSeries(geometry: FramesGeometry, series: HighlightSeries): SeriesCoverage {
  const entry = new Map<number, { nodes: Set<number>; edges: Set<number> }>();
  const merged = new Map<number, { sources: Set<number> }>();
  const passes: NodePass[] = [];
  const mergedOf = new Map<number, [panel: number, slot: number]>();
  geometry.panels.forEach((panel, index) => {
    if (panel.kind === "merged") panel.entries.forEach((entryPanel, slot) => mergedOf.set(entryPanel, [index, slot]));
  });

  for (const visit of series.visits) {
    const tenth = geometry.rule === "standard" && visit.frame === 10;
    // The tenth-frame panels only light up once a ball has been thrown in the frame.
    if (tenth && visit.rolls.length === 0) continue;
    const panelIndex = geometry.panelFor({ entry: visit.entry, tenth });
    if (panelIndex === undefined) continue;
    const panel = geometry.panels[panelIndex] as EntryPanelGeometry;
    let coverage = entry.get(panelIndex);
    if (!coverage) entry.set(panelIndex, (coverage = { nodes: new Set(), edges: new Set() }));
    let current = 0;
    coverage.nodes.add(current);
    passes.push({ panel: panelIndex, node: current, frame: visit.frame, rolls: [] });
    for (let thrown = 0; thrown < visit.rolls.length; thrown++) {
      const edgeIndex = panel.model.edgeFor(current, visit.rolls[thrown]!);
      if (edgeIndex === undefined) break;
      coverage.edges.add(edgeIndex);
      current = panel.model.edges[edgeIndex]!.to;
      coverage.nodes.add(current);
      passes.push({ panel: panelIndex, node: current, frame: visit.frame, rolls: visit.rolls.slice(0, thrown + 1) });
    }
    if (!visit.complete) continue;
    const summary = mergedOf.get(panelIndex);
    if (!summary) continue;
    const [mergedIndex, slot] = summary;
    const source = (geometry.panels[mergedIndex] as MergedPanelGeometry).merged.sourceFor(slot, current);
    if (source === undefined) continue;
    let mergedCoverage = merged.get(mergedIndex);
    if (!mergedCoverage) merged.set(mergedIndex, (mergedCoverage = { sources: new Set() }));
    mergedCoverage.sources.add(source);
  }
  return { entry, merged, passes };
}

function highlightPath(className: string, d: string, color: string | null): ElementSpec {
  return el("path", [["class", `chart-round-stroke ${className}`], ["d", d]], [], color === null ? undefined : [["--series-color", color]]);
}

/** Halo copies (single-game mode only) followed by the coloured paths. */
function seriesPaths(line: string, dotGroups: readonly Point[][], color: string, mode: HighlightMode): ElementSpec[] {
  const out: ElementSpec[] = [];
  const emit = (suffix: string, pathColor: string | null): void => {
    if (line !== "") out.push(highlightPath(`chart-highlight-line${suffix}`, line, pathColor));
    for (const dots of dotGroups) {
      if (dots.length > 0) out.push(highlightPath(`chart-highlight-dot${suffix}`, dotPath(dots), pathColor));
    }
  };
  if (!mode.comparison) emit(" chart-highlight-halo", null);
  emit("", color);
  return out;
}

function entryPanelPaths(panel: EntryPanelGeometry, coverage: PanelCoverage, color: string, mode: HighlightMode): ElementSpec[] {
  const { model, points, waypoints } = panel;
  // Edges keep the panel's drawing order and are collected per category of the node
  // they lead to, categories in order of first use.
  const byCategory = new Map<string, string>();
  for (const edgeIndex of [...coverage.edges].sort((x, y) => x - y)) {
    const edge = model.edges[edgeIndex]!;
    const [x1, y1] = points[edge.from]!;
    const [x2, y2] = points[edge.to]!;
    let d: string;
    if (edge.waypoint === null) {
      d = segmentPath(x1, y1, x2, y2);
    } else {
      const [wx, wy] = waypoints[edge.waypoint]!;
      d = segmentPath(x1, y1, wx, wy) + segmentPath(wx, wy, x2, y2);
    }
    const category = model.nodes[edge.to]!.category;
    byCategory.set(category, (byCategory.get(category) ?? "") + d);
  }
  const line = [...byCategory.values()].join("");
  const dots = [...coverage.nodes].sort((x, y) => x - y).map((index) => points[index]!);
  return seriesPaths(line, [dots], color, mode);
}

/**
 * Joins horizontal spans that overlap. Spans are grouped by height in order of first
 * appearance; within one height they are sorted and merged left to right.
 */
function mergeSpans(spans: ReadonlyArray<readonly [x1: number, x2: number, y: number]>): string {
  const byHeight = new Map<number, [number, number][]>();
  for (const [x1, x2, y] of spans) {
    const span: [number, number] = [Math.min(x1, x2), Math.max(x1, x2)];
    const list = byHeight.get(y);
    if (list) list.push(span);
    else byHeight.set(y, [span]);
  }
  let d = "";
  for (const [y, list] of byHeight) {
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let [from, to] = list[0]!;
    for (const [nextFrom, nextTo] of list.slice(1)) {
      if (nextFrom > to) {
        d += segmentPath(from, y, to, y);
        from = nextFrom;
        to = nextTo;
      } else {
        to = Math.max(to, nextTo);
      }
    }
    d += segmentPath(from, y, to, y);
  }
  return d;
}

function mergedPanelPaths(panel: MergedPanelGeometry, coverage: MergedCoverage, color: string, mode: HighlightMode): ElementSpec[] {
  const { merged } = panel;
  const sources = [...coverage.sources].sort((a, b) => a - b).map((index) => merged.sources[index]!);

  // Lines run from each source to its outcome, drawn category by category.
  const byCategory = new Map<string, [number, number, number][]>();
  for (const source of sources) {
    const [x1, y] = source.point;
    const [x2] = merged.outcomes[source.outcome]!.point;
    const list = byCategory.get(source.category);
    if (list) list.push([x1, x2, y]);
    else byCategory.set(source.category, [[x1, x2, y]]);
  }
  let line = "";
  for (const spans of byCategory.values()) line += mergeSpans(spans);

  // One dot group per entry-state column, then the outcome column.
  const byEntry = new Map<number, Point[]>();
  for (const source of sources) {
    const list = byEntry.get(source.entry);
    if (list) list.push(source.point);
    else byEntry.set(source.entry, [source.point]);
  }
  const outcomes = [...new Set(sources.map((source) => source.outcome))].sort((a, b) => a - b).map((index) => merged.outcomes[index]!.point);
  return seriesPaths(line, [...byEntry.values(), outcomes], color, mode);
}

/**
 * Children of every panel's `highlight` group, by panel index: one group per colour
 * holding one group per game. With no series the groups are left empty.
 */
export function buildPanelHighlights(
  geometry: FramesGeometry,
  series: readonly HighlightSeries[],
  coverages: readonly SeriesCoverage[],
  mode: HighlightMode,
): ElementSpec[][] {
  const colors = groupByColor(series);
  return geometry.panels.map((panel, panelIndex) =>
    colors.map((group) =>
      el("g", [["class", colorGroupClass(mode)]], group.members.map((seriesIndex) => {
        const coverage = coverages[seriesIndex]!;
        let paths: ElementSpec[] = [];
        if (panel.kind === "entry") {
          const covered = coverage.entry.get(panelIndex);
          if (covered) paths = entryPanelPaths(panel, covered, group.color, mode);
        } else {
          const covered = coverage.merged.get(panelIndex);
          if (covered) paths = mergedPanelPaths(panel, covered, group.color, mode);
        }
        return el("g", [["class", seriesClass(`highlight-series-${seriesIndex + 1}`, mode)]], paths);
      })),
    ),
  );
}
