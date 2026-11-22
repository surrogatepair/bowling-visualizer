/**
 * The static application shell: tabs, toggles, the roll input, sample buttons and the
 * empty containers the views are rendered into.
 */
import { SCORING_RULES, type ScoringRule } from "../../core/scoring/graph/types";
import { COMPARISON_PRESETS } from "../../presentation/app/comparison";
import { SAMPLES } from "../../presentation/app/samples";
import { APP_TITLE, RULE_TITLE } from "../../presentation/presentation/labels";
import { NOTATIONS, type Notation } from "../../presentation/presentation/score_sheet";
import { el, type ElementSpec } from "../../presentation/render/chart";
import { createElement } from "./dom";

export type ViewLayout = "vertical" | "horizontal";

export const VIEW_LAYOUTS: readonly ViewLayout[] = ["vertical", "horizontal"];

const NOTATION_BUTTONS: Record<Notation, { glyph: string; title: string; label: string }> = {
  mark: { glyph: "◢", title: "Strikes and spares as Japanese-style figures", label: "Figure notation" },
  text: { glyph: "X/", title: "Strikes and spares as text (X, /)", label: "Text notation" },
};

const LAYOUT_BUTTONS: Record<ViewLayout, { glyph: string; title: string; label: string }> = {
  vertical: { glyph: "⬓", title: "Stack the overall and per-frame views vertically", label: "Stacked layout" },
  horizontal: { glyph: "◨", title: "Place the overall and per-frame views side by side", label: "Side-by-side layout" },
};

/** Handles to the parts of the shell the controller works with. */
export interface Shell {
  readonly root: HTMLElement;
  readonly tabs: ReadonlyMap<ScoringRule, HTMLButtonElement>;
  readonly notationButtons: ReadonlyMap<Notation, HTMLButtonElement>;
  readonly layoutButtons: ReadonlyMap<ViewLayout, HTMLButtonElement>;
  readonly input: HTMLTextAreaElement;
  readonly clearButton: HTMLButtonElement;
  readonly copyButton: HTMLButtonElement;
  readonly sampleRow: HTMLElement;
  readonly sampleButtons: ReadonlyMap<string, HTMLButtonElement>;
  readonly compareButton: HTMLButtonElement;
  readonly presetRow: HTMLElement;
  readonly presetButtons: ReadonlyMap<string, HTMLButtonElement>;
  readonly exitCompareButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly liveRegion: HTMLElement;
  readonly views: HTMLElement;
  readonly graphHost: HTMLElement;
  readonly framesHost: HTMLElement;
}

function button(className: string, attrs: ReadonlyArray<readonly [string, string]>, text: string): ElementSpec {
  return el("button", [["type", "button"], ["class", className], ...attrs], [text]);
}

function toggleGroup(caption: string, groupLabel: string, buttons: readonly ElementSpec[]): ElementSpec {
  return el("div", [["class", "toggle-group"]], [
    el("span", [["class", "toggle-label"], ["aria-hidden", "true"]], [caption]),
    el("div", [["class", "seg-toggle"], ["role", "group"], ["aria-label", groupLabel]], buttons),
  ]);
}

function shellSpec(): ElementSpec[] {
  const tabs = SCORING_RULES.map((rule) =>
    button("tab", [["data-view", rule], ["role", "tab"], ["aria-controls", "views"], ["aria-selected", "false"], ["tabindex", "-1"]], `${RULE_TITLE[rule]} scoring`),
  );
  const notation = NOTATIONS.map((value) => {
    const info = NOTATION_BUTTONS[value];
    return button("seg-button seg-button--text", [["data-notation", value], ["title", info.title], ["aria-label", info.label], ["aria-pressed", "false"], ["tabindex", "-1"]], info.glyph);
  });
  const layout = VIEW_LAYOUTS.map((value) => {
    const info = LAYOUT_BUTTONS[value];
    return button("seg-button seg-button--icon", [["data-layout", value], ["title", info.title], ["aria-label", info.label], ["aria-pressed", "false"], ["tabindex", "-1"]], info.glyph);
  });

  const header = el("header", [["class", "topbar"]], [
    el("h1", [["class", "visually-hidden"]], [APP_TITLE]),
    el("div", [["class", "tab-row"]], [
      el("div", [["class", "tabs"], ["role", "tablist"], ["aria-label", "Scoring rule"]], tabs),
      el("div", [["class", "topbar-toggles"]], [
        toggleGroup("Notation", "Roll notation", notation),
        toggleGroup("Layout", "View layout", layout),
      ]),
    ]),
    el("div", [["class", "input-row"]], [
      el("div", [["class", "input-wrap"]], [
        el("textarea", [
          ["id", "rolls-input"],
          ["wrap", "off"],
          ["spellcheck", "false"],
          ["autocomplete", "off"],
          ["autocapitalize", "characters"],
          ["placeholder", "Enter pins knocked down. e.g. X 5/ 9-"],
          ["aria-label", "Rolls"],
        ]),
        button("input-clear", [["title", "Clear"], ["aria-label", "Clear rolls"]], "×"),
      ]),
      button("copy-link", [["id", "copy-link"], ["title", "Copy the current URL"]], "Copy URL"),
    ]),
    el("div", [["class", "sample-row"]], [
      ...SAMPLES.map((sample) => button("sample-button", [["data-sample", sample.id]], sample.label)),
      button("sample-button compare-toggle", [["title", "Overlay multiple games; each input line is one game"]], "Compare"),
    ]),
    el("div", [["class", "sample-row preset-row"], ["hidden", ""]], [
      ...COMPARISON_PRESETS.map((preset) => button("sample-button preset-chip", [["data-preset", preset.id], ["aria-pressed", "false"]], preset.label)),
      button("sample-button compare-toggle", [["title", "Return to single-game input"]], "Exit comparison"),
    ]),
    el("div", [["class", "status"], ["id", "status"]]),
    el("div", [["class", "visually-hidden"], ["aria-live", "polite"]]),
  ]);

  const views = el("div", [["class", "views"], ["id", "views"], ["role", "tabpanel"], ["aria-label", "Score state diagrams"]], [
    el("div", [["id", "graph"]]),
    el("div", [["id", "frames"]]),
  ]);
  return [header, views];
}

function indexButtons<K extends string>(root: ParentNode, attribute: string): Map<K, HTMLButtonElement> {
  const map = new Map<K, HTMLButtonElement>();
  root.querySelectorAll<HTMLButtonElement>(`button[${attribute}]`).forEach((node) => {
    map.set(node.getAttribute(attribute) as K, node);
  });
  return map;
}

/** Builds the shell inside `root`, replacing whatever was there. */
export function mountShell(doc: Document, root: HTMLElement): Shell {
  root.replaceChildren(...shellSpec().map((spec) => createElement(doc, spec)));
  const need = <T extends Element>(selector: string): T => {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`missing presentation binding: ${selector}`);
    return found;
  };
  return {
    root,
    tabs: indexButtons<ScoringRule>(root, "data-view"),
    notationButtons: indexButtons<Notation>(root, "data-notation"),
    layoutButtons: indexButtons<ViewLayout>(root, "data-layout"),
    input: need<HTMLTextAreaElement>("#rolls-input"),
    clearButton: need<HTMLButtonElement>(".input-clear"),
    copyButton: need<HTMLButtonElement>("#copy-link"),
    sampleRow: need<HTMLElement>(".sample-row:not(.preset-row)"),
    sampleButtons: indexButtons<string>(root, "data-sample"),
    compareButton: need<HTMLButtonElement>(".sample-row:not(.preset-row) .compare-toggle"),
    presetRow: need<HTMLElement>(".preset-row"),
    presetButtons: indexButtons<string>(root, "data-preset"),
    exitCompareButton: need<HTMLButtonElement>(".preset-row .compare-toggle"),
    status: need<HTMLElement>("#status"),
    liveRegion: need<HTMLElement>("[aria-live]"),
    views: need<HTMLElement>("#views"),
    graphHost: need<HTMLElement>("#graph"),
    framesHost: need<HTMLElement>("#frames"),
  };
}
