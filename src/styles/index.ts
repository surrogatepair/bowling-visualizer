/**
 * The application stylesheet, assembled from its parts and injected at start-up so
 * the page works as a single self-contained file.
 */
import base from "./base.css?raw";
import input from "./input.css?raw";
import layout from "./layout.css?raw";
import theme from "./theme.css?raw";
import topbar from "./topbar.css?raw";
import views from "./views.css?raw";

/** Stroke width of the state graph's edges; thin because there are almost 200,000 of them. */
export const GRAPH_EDGE_STROKE_WIDTH = 0.5;

export function stylesheet(): string {
  return (
    `${theme}\n${base}\n\n${topbar}\n\n${input}\n\n${views}\n${layout}\n` +
    `:root { --graph-edges-stroke-width: ${GRAPH_EDGE_STROKE_WIDTH}; }`
  );
}
