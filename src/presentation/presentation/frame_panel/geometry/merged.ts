/**
 * The "Entry State / Outcome" summary panel at the end of a row: for every entry state
 * it repeats the end column of that state's panel, and links each end node to a shared
 * outcome column. It shows at a glance which results each entry state can produce.
 */
import type { Category } from "../../../../core/scoring/graph/types";
import type { Point } from "../../graph";
import type { PanelModel } from "../model";
import { endOffset, type PanelLayout } from "./layout";

/** Horizontal distance between the entry-state columns. */
export const MERGED_ENTRY_SPACING = 36;
/** X of the outcome column. */
export const MERGED_OUTCOME_X = 180;
/** Spacing of the sub-columns inside an entry-state column. */
const MERGED_SOURCE_SPACING = 6;
/** Distance from the plot frame to the content origin. */
export const MERGED_INSET = 28;

/** An end node of one entry panel, repeated in the summary panel. */
export interface MergedSource {
  /** Index of the entry panel within the row. */
  readonly entry: number;
  /** Node index in that entry panel's model. */
  readonly node: number;
  readonly category: Category;
  readonly point: Point;
  /** Index of the outcome this source leads to. */
  readonly outcome: number;
}

export interface MergedOutcome {
  readonly index: number;
  readonly category: Category;
  readonly delta: number;
  readonly point: Point;
  /** The first source that produces this outcome; the static edge starts there. */
  readonly firstSource: number;
}

export interface MergedGeometry {
  /** Sources by entry state, within an entry state in the order of its panel's nodes. */
  readonly sources: readonly MergedSource[];
  /** Sources drawn as one marker path: one group per sub-column of an entry state. */
  readonly sourceGroups: readonly { readonly entry: number; readonly category: Category; readonly members: readonly number[] }[];
  /** Outcomes in order of first appearance. */
  readonly outcomes: readonly MergedOutcome[];
  /** Outcome categories in order of first appearance. */
  readonly categories: readonly Category[];
  /** Index into `sources` of the given node of an entry panel. */
  sourceFor(entry: number, node: number): number | undefined;
}

export function buildMergedGeometry(models: readonly PanelModel[], layouts: readonly PanelLayout[]): MergedGeometry {
  const sources: MergedSource[] = [];
  const sourceGroups: { entry: number; category: Category; members: number[] }[] = [];
  const outcomes: MergedOutcome[] = [];
  const outcomeIndex = new Map<string, number>();
  const categories: Category[] = [];

  models.forEach((model, entry) => {
    const layout = layouts[entry]!;
    const spec = model.spec;
    // Sub-columns of this entry state, in order of first appearance.
    const groups = new Map<string, { entry: number; category: Category; members: number[] }>();
    for (const node of model.nodes) {
      if (node.column !== "end") continue;
      const y = layout.deltaY(node.delta);
      const x = MERGED_ENTRY_SPACING * entry + endOffset(spec, node, MERGED_SOURCE_SPACING);
      const key = `${node.category}|${node.delta}`;
      let outcome = outcomeIndex.get(key);
      if (outcome === undefined) {
        outcome = outcomes.length;
        outcomeIndex.set(key, outcome);
        if (!categories.includes(node.category)) categories.push(node.category);
        // Outcomes of a tenth-frame row share one column; otherwise they spread by category.
        const spread = spec.tenth ? 0 : endOffset(spec, node);
        outcomes.push({ index: outcome, category: node.category, delta: node.delta, point: [MERGED_OUTCOME_X + spread, y], firstSource: sources.length });
      }
      const groupKey = `${node.category}|${node.lane}`;
      let sourceGroup = groups.get(groupKey);
      if (!sourceGroup) groups.set(groupKey, (sourceGroup = { entry, category: node.category, members: [] }));
      sourceGroup.members.push(sources.length);
      sources.push({ entry, node: node.index, category: node.category, point: [x, y], outcome });
    }
    sourceGroups.push(...groups.values());
  });

  const lookup = new Map<string, number>();
  sources.forEach((source, index) => lookup.set(`${source.entry}|${source.node}`, index));
  return { sources, sourceGroups, outcomes, categories, sourceFor: (entry, node) => lookup.get(`${entry}|${node}`) };
}
