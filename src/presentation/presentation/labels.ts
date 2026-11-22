/** Human-readable names shared by charts, tooltips and controls. */
import type { Category, Pending, ScoringRule } from "../../core/scoring/graph/types";

export const RULE_TITLE: Record<ScoringRule, string> = {
  standard: "Standard",
  "current-frame": "Current-frame",
};

export const CATEGORY_LEGEND: Record<Category, string> = {
  no_pending: "No pending bonus",
  spare_pending: "Spare bonus pending",
  strike_pending: "Strike bonus pending",
  double_strike_pending: "Double-strike bonus pending",
  mid_no_carry: "Mid-frame (no carry-over)",
  mid_carry: "Mid-frame (carry-over)",
};

export const PENDING_DESCRIPTION: Record<Pending, string> = {
  none: "No bonus pending",
  spare: "Spare bonus pending (+1 roll)",
  strike: "Strike bonus pending (+2 rolls)",
  double_strike: "Double-strike bonus pending",
};

/** Whether nodes of a category sit on a frame boundary ("end") or inside a frame ("mid"). */
export function categoryMarker(category: Category): "end" | "mid" {
  return category === "mid_no_carry" || category === "mid_carry" ? "mid" : "end";
}

/** Name of the application: the document title and the page heading. */
export const APP_TITLE = "Bowling Score State Visualizer";
