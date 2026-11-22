import { describe, expect, it } from "vitest";
import type { ScoringRule } from "../src/core/scoring/graph/types";
import { isGame, parseComparisonInput, parseGameLine } from "../src/presentation/app/comparison";
import { buildQuery, encodeRolls, parseQuery } from "../src/presentation/app/url";
import recorded from "./fixtures/original-urls.json";

const DEFAULT_COLOR = "#dc2626";

/** `location.search` for a query built by `buildQuery`. */
function search(query: string): string {
  return query === "" ? "" : `?${query}`;
}

interface RecordedUrl {
  query: string;
  input: string;
  comparing: boolean;
  view: string;
  synced: string;
}

describe("buildQuery", () => {
  it("writes one compact rolls parameter per game", () => {
    expect(encodeRolls([10, 9, 1, 0])).toBe("x910");
    expect(buildQuery([{ rolls: [10, 9, 1], color: null }], "standard", DEFAULT_COLOR)).toBe("rolls=x91");
    expect(buildQuery([], "standard", DEFAULT_COLOR)).toBe("");
    expect(buildQuery([], "current-frame", DEFAULT_COLOR)).toBe("view=current-frame");
  });

  it("lists colours up to the last non-default one", () => {
    const games = [
      { rolls: [10], color: null },
      { rolls: [9], color: "#00ff00" },
      { rolls: [8], color: null },
    ];
    expect(buildQuery(games, "standard", DEFAULT_COLOR)).toBe("rolls=x&rolls=9&rolls=8&color=dc2626&color=00ff00");
  });
});

/**
 * Query strings, the input the original build restored from them and the query it
 * wrote back once it had settled.
 */
describe("URLs recorded from the original build", () => {
  it.each(recorded as RecordedUrl[])("$query", (url) => {
    const state = parseQuery(url.query, DEFAULT_COLOR);
    const input = state.games.join("\n");
    expect(input).toBe(url.input);
    expect(state.comparing).toBe(url.comparing);
    expect(state.view).toBe(url.view);

    const entries = (state.comparing ? parseComparisonInput(input) : [parseGameLine(input)]).filter(isGame);
    expect(search(buildQuery(entries, state.view as ScoringRule, DEFAULT_COLOR))).toBe(url.synced);
  });
});
