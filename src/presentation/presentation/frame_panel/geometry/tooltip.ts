/**
 * Tooltip targets of the frame panels: every highlighted panel node, described with
 * the frames and rolls of the games that pass through it.
 */
import type { SeriesCoverage } from "../highlight";
import type { PanelNode, PanelSpec } from "../model";
import { boundaryContent, nodeContent, withRow, type TooltipContent, type TooltipTarget } from "../../tooltip";
import type { Point } from "../../graph";
import type { EntryPanelGeometry, FramesGeometry, MergedPanelGeometry } from "./index";

/** What is known about the games passing through one panel node. */
interface NodeUsage {
  /** Frames (one-based) in which a game is at this node. */
  readonly frames: Set<number>;
  /** In-frame rolls leading to this node, as notation. */
  readonly rolls: Set<string>;
}

/** Notation of the rolls thrown so far inside one frame (`7/`, `X`, `X71`). */
export function frameRollsText(rolls: readonly number[], tenth: boolean): string {
  let text = "";
  let standing = 10;
  let fresh = true;
  for (const pins of rolls) {
    if (fresh && pins === 10) text += "X";
    else if (!fresh && pins === standing) text += "/";
    else text += pins === 0 ? "-" : String(pins);
    standing -= pins;
    if (standing === 0 && tenth) {
      standing = 10;
      fresh = true;
    } else {
      fresh = false;
    }
  }
  return text;
}

function nodeTooltip(spec: PanelSpec, node: PanelNode, usage: NodeUsage): TooltipContent {
  if (node.column === "start") {
    return boundaryContent(spec.tenth ? "Frame 9 - end" : "Previous frame end", node.delta, spec.entry);
  }
  const frames = [...usage.frames].sort((a, b) => a - b);
  const rolls = [...usage.rolls].sort();
  return withRow(nodeContent(node.node, node.delta, frames), "In-frame rolls", rolls.join(", "));
}

function offset(origin: Point, point: Point): Point {
  return [origin[0] + point[0], origin[1] + point[1]];
}

/** Tooltip targets for everything the given games highlight on the frame panels. */
export function panelTooltipTargets(geometry: FramesGeometry, coverages: readonly SeriesCoverage[]): TooltipTarget[] {
  // Games are merged: a node passed in several frames or by several games lists them all.
  const usage = new Map<number, Map<number, NodeUsage>>();
  for (const coverage of coverages) {
    for (const pass of coverage.passes) {
      const panel = geometry.panels[pass.panel] as EntryPanelGeometry;
      let nodes = usage.get(pass.panel);
      if (!nodes) usage.set(pass.panel, (nodes = new Map()));
      let node = nodes.get(pass.node);
      if (!node) nodes.set(pass.node, (node = { frames: new Set(), rolls: new Set() }));
      node.frames.add(pass.frame);
      node.rolls.add(frameRollsText(pass.rolls, panel.model.spec.tenth));
    }
  }

  const targets: TooltipTarget[] = [];
  geometry.panels.forEach((panel, panelIndex) => {
    if (panel.kind === "merged") {
      mergedTargets(geometry, panel, usage, targets);
      return;
    }
    const used = usage.get(panelIndex);
    if (!used) return;
    for (const nodeIndex of [...used.keys()].sort((a, b) => a - b)) {
      targets.push({
        point: offset(panel.contentOrigin, panel.points[nodeIndex]!),
        content: nodeTooltip(panel.model.spec, panel.model.nodes[nodeIndex]!, used.get(nodeIndex)!),
      });
    }
  });
  return targets;
}

/**
 * A summary panel repeats the end nodes of its entry panels. An outcome reached from
 * several entry states combines what is known about each of them.
 */
function mergedTargets(
  geometry: FramesGeometry,
  panel: MergedPanelGeometry,
  usage: ReadonlyMap<number, ReadonlyMap<number, NodeUsage>>,
  targets: TooltipTarget[],
): void {
  const { merged } = panel;
  const outcomes = new Map<number, { spec: PanelSpec; node: PanelNode; usage: NodeUsage }>();
  for (const source of merged.sources) {
    const entryIndex = panel.entries[source.entry]!;
    const used = usage.get(entryIndex)?.get(source.node);
    if (!used) continue;
    const entry = geometry.panels[entryIndex] as EntryPanelGeometry;
    const node = entry.model.nodes[source.node]!;
    targets.push({ point: offset(panel.contentOrigin, source.point), content: nodeTooltip(entry.model.spec, node, used) });
    let outcome = outcomes.get(source.outcome);
    if (!outcome) outcomes.set(source.outcome, (outcome = { spec: entry.model.spec, node, usage: { frames: new Set(), rolls: new Set() } }));
    used.frames.forEach((frame) => outcome.usage.frames.add(frame));
    used.rolls.forEach((rolls) => outcome.usage.rolls.add(rolls));
  }
  for (const index of [...outcomes.keys()].sort((a, b) => a - b)) {
    const outcome = outcomes.get(index)!;
    targets.push({ point: offset(panel.contentOrigin, merged.outcomes[index]!.point), content: nodeTooltip(outcome.spec, outcome.node, outcome.usage) });
  }
}
