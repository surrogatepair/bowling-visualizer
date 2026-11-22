/**
 * The application controller: owns the UI state, reacts to events and keeps the
 * score sheet, both views, the controls and the URL in sync with it.
 */
import { frameVisits, traceRolls } from "../../core/app/highlight";
import { scoreGame } from "../../core/scoring/frames";
import { SCORING_RULES, type ScoreGraph, type ScoringRule } from "../../core/scoring/graph/types";
import { buildGraph } from "../../core/scoring/graph/walker";
import {
  COMPARISON_PRESETS,
  PRESET_COLORS,
  findPreset,
  isGame,
  isPresetActive,
  parseComparisonInput,
  parseGameLine,
  togglePreset,
  type GameEntry,
  type PresetColor,
} from "../../presentation/app/comparison";
import { parseHexColor } from "../../presentation/app/hex_color";
import { SAMPLE_RANDOM_COUNT, generateSample } from "../../presentation/app/samples";
import { buildQuery, parseQuery } from "../../presentation/app/url";
import { buildFramesScene, computeFramesGeometry, type FramesGeometry } from "../../presentation/presentation/frame_panel/geometry";
import { panelTooltipTargets } from "../../presentation/presentation/frame_panel/geometry/tooltip";
import { buildPanelHighlights, coverSeries } from "../../presentation/presentation/frame_panel/highlight";
import { GRAPH_SVG_HEIGHT, GRAPH_SVG_WIDTH, createGraphLayout } from "../../presentation/presentation/graph";
import { buildGraphScene, computeGraphGeometry, type GraphGeometry } from "../../presentation/presentation/graph_scene";
import { buildGraphHighlights, rootClass, type HighlightMode, type HighlightSeries } from "../../presentation/presentation/highlight";
import { NOTATIONS, buildComparisonSheet, buildScoreSheet, type Notation, type SheetGame } from "../../presentation/presentation/score_sheet";
import { graphTooltipTargets } from "../../presentation/presentation/tooltip";
import type { ElementSpec } from "../../presentation/render/chart";
import { stylesheet } from "../../styles";
import { createElement, replaceChildren, updateElement } from "../view/dom";
import { VIEW_LAYOUTS, mountShell, type Shell, type ViewLayout } from "../view/shell";
import { TooltipLayer } from "../view/tooltip";
import {
  RENDERER_MARKER,
  copyText,
  preferredLanguages,
  prepareDocument,
  readStored,
  replaceUrl,
  rootProperty,
  urlWithQuery,
  writeStored,
} from "./browser";

const LAYOUT_KEY = "bowling.layout";
const NOTATION_KEY = "bowling.notation";
/** Delay before the URL follows the input, so typing does not flood the history API. */
const URL_SYNC_DELAY_MS = 250;
/** How long the copy button shows its result. */
const COPY_FEEDBACK_MS = 1400;

const COPY_LABEL = { idle: "Copy URL", copied: "Copied", failed: "Copy failed" } as const;

/** Rendered DOM and geometry of one scoring rule's views; created on first use. */
interface ViewSlot {
  readonly graph: ScoreGraph;
  readonly graphGeometry: GraphGeometry;
  readonly framesGeometry: FramesGeometry;
  readonly graphSlot: HTMLElement;
  readonly framesSlot: HTMLElement;
  readonly graphHighlights: Element;
  readonly panelHighlights: readonly Element[];
  readonly graphTooltip: TooltipLayer;
  readonly framesTooltip: TooltipLayer;
}

/** Picks the roll notation for a first visit: figures for Japanese users, text otherwise. */
function defaultNotation(languages: readonly string[]): Notation {
  for (const language of languages) {
    const subtags = language.toLowerCase().split(/[-_]/);
    if (subtags[0] === "ja" || subtags.slice(1).includes("jp")) return "mark";
  }
  return "text";
}

function storedChoice<T extends string>(key: string, choices: readonly T[]): T | null {
  const stored = readStored(key);
  return stored !== null && (choices as readonly string[]).includes(stored) ? (stored as T) : null;
}

/** Collapses line breaks into spaces: single-game input lives on one line. */
function singleLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ");
}

export class Controller {
  private readonly shell: Shell;
  private readonly defaultColor: string;
  private readonly presetColors: ReadonlyMap<PresetColor, string>;
  private readonly slots = new Map<ScoringRule, ViewSlot>();

  private view: ScoringRule;
  private notation: Notation;
  private layout: ViewLayout;
  private comparing: boolean;
  /** Current input text. */
  private text: string;
  /** Single-game input kept while comparison mode is on. */
  private singleText = "";

  /** Query string that still has to reach the address bar. */
  private pendingQuery: string | null = null;
  private urlTimer: number | undefined;
  private copyTimer: number | undefined;
  /** Number of the latest copy request; earlier ones no longer report back. */
  private copyRequest = 0;

  constructor() {
    const root = prepareDocument(stylesheet());
    this.defaultColor = this.requireColor("--chart-highlight");
    this.presetColors = new Map(PRESET_COLORS.map((name) => [name, this.requireColor(name)]));
    this.shell = mountShell(document, root);

    const initial = parseQuery(window.location.search, this.defaultColor);
    this.view = initial.view;
    this.layout = storedChoice(LAYOUT_KEY, VIEW_LAYOUTS) ?? "vertical";
    this.notation = storedChoice(NOTATION_KEY, NOTATIONS) ?? defaultNotation(preferredLanguages());
    this.comparing = initial.comparing;
    this.text = initial.games.join("\n");

    this.shell.input.value = this.text;
    this.bindEvents();
    this.render();
    this.scheduleUrl();
  }

  private requireColor(name: string): string {
    const color = parseHexColor(rootProperty(name));
    if (color === null) throw new Error(`CSS property ${name} must be a six-digit hex color`);
    return color;
  }

  private readonly palette = (name: PresetColor): string => this.presetColors.get(name)!;

  // ---------------------------------------------------------------- events

  private bindEvents(): void {
    const { shell } = this;
    shell.input.addEventListener("input", () => this.onInput());
    shell.input.addEventListener("keydown", (event) => {
      // A single game has no line breaks; Enter would only be collapsed again.
      if (!this.comparing && event.key === "Enter" && !event.isComposing) event.preventDefault();
    });
    shell.clearButton.addEventListener("click", () => {
      this.change({ text: "" });
      shell.input.focus();
    });
    shell.copyButton.addEventListener("click", () => this.copyUrl());
    shell.compareButton.addEventListener("click", () => this.setComparing(true));
    shell.exitCompareButton.addEventListener("click", () => this.setComparing(false));

    for (const [id, button] of shell.sampleButtons) {
      button.addEventListener("click", () => this.applySample(id));
    }
    for (const [id, button] of shell.presetButtons) {
      button.addEventListener("click", () => this.applyPreset(id));
    }
    this.bindChoice(shell.tabs, SCORING_RULES, () => this.view, (value) => this.setView(value));
    this.bindChoice(shell.notationButtons, NOTATIONS, () => this.notation, (value) => this.setNotation(value));
    this.bindChoice(shell.layoutButtons, VIEW_LAYOUTS, () => this.layout, (value) => this.setLayout(value));
  }

  /**
   * Wires a group of mutually exclusive buttons: click selects, left/right arrows
   * cycle. `select` reports whether the choice is now in effect; focus only follows a
   * choice that is.
   */
  private bindChoice<T extends string>(
    buttons: ReadonlyMap<T, HTMLButtonElement>,
    order: readonly T[],
    current: () => T,
    select: (value: T) => boolean,
  ): void {
    for (const [value, button] of buttons) {
      button.addEventListener("click", () => select(value));
      button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const step = event.key === "ArrowRight" ? 1 : order.length - 1;
        const next = order[(order.indexOf(current()) + step) % order.length]!;
        if (select(next)) buttons.get(next)?.focus();
      });
    }
  }

  private onInput(): void {
    const input = this.shell.input;
    let text = input.value;
    if (!this.comparing) {
      const collapsed = singleLine(text);
      if (collapsed !== text) {
        // Keep the caret where it was, measured in the collapsed text.
        const caret = input.selectionStart;
        const position = caret === null ? null : singleLine(text.slice(0, caret)).length;
        input.value = collapsed;
        if (position !== null) input.setSelectionRange(position, position);
        text = collapsed;
      }
    }
    this.change({ text });
  }

  // ---------------------------------------------------------------- state changes

  /**
   * Changes what is shown and shared: the input, the scoring rule or the mode. Returns
   * false when nothing changed, or when the view for a new scoring rule could not be
   * built; the current view then stays as it is.
   */
  private change(next: { text?: string; view?: ScoringRule; comparing?: boolean }): boolean {
    const text = next.text ?? this.text;
    const view = next.view ?? this.view;
    const comparing = next.comparing ?? this.comparing;
    if (text === this.text && view === this.view && comparing === this.comparing) return false;
    if (view !== this.view) {
      try {
        this.slot(view);
      } catch (error) {
        console.error(error);
        return false;
      }
    }
    this.text = text;
    this.view = view;
    this.comparing = comparing;
    if (this.shell.input.value !== text) this.shell.input.value = text;
    this.render();
    this.scheduleUrl();
    return true;
  }

  private setView(view: ScoringRule): boolean {
    this.change({ view });
    return this.view === view;
  }

  private setNotation(notation: Notation): boolean {
    if (notation !== this.notation) {
      this.notation = notation;
      writeStored(NOTATION_KEY, notation);
      this.render();
    }
    return true;
  }

  private setLayout(layout: ViewLayout): boolean {
    if (layout !== this.layout) {
      this.layout = layout;
      writeStored(LAYOUT_KEY, layout);
      this.render();
    }
    return true;
  }

  private setComparing(comparing: boolean): void {
    if (comparing === this.comparing) return;
    const { compareButton, exitCompareButton } = this.shell;
    const [pressed, replacement] = comparing ? [compareButton, exitCompareButton] : [exitCompareButton, compareButton];
    // The pressed button is about to be hidden; focus that rests on it moves along.
    const hadFocus = document.activeElement === pressed;
    if (comparing) {
      this.singleText = this.text;
      this.change({ comparing, text: "" });
    } else {
      // A comparison of exactly one game carries over as the single game.
      const games = this.entries();
      this.change({ comparing, text: games.length === 1 ? games[0]!.text : this.singleText });
    }
    if (hadFocus) replacement.focus();
  }

  private applySample(id: string): void {
    if (this.comparing) return;
    const randoms = Array.from({ length: SAMPLE_RANDOM_COUNT }, () => Math.random());
    this.change({ text: generateSample(id, randoms) });
  }

  private applyPreset(id: string): void {
    const preset = findPreset(id);
    if (!preset || !this.comparing) return;
    this.change({ text: togglePreset(preset, this.text, this.palette) });
  }

  private copyUrl(): void {
    this.syncUrl();
    // A new request starts from a clean slate and is the only one that may report back.
    const request = ++this.copyRequest;
    this.showCopyFeedback(null);
    const isCurrent = (): boolean => request === this.copyRequest;
    void copyText(urlWithQuery(this.currentQuery()), isCurrent).then((copied) => {
      if (copied !== null && isCurrent()) this.showCopyFeedback(copied);
    });
  }

  /** Shows the outcome of a copy for a moment; `null` returns to the idle label. */
  private showCopyFeedback(copied: boolean | null): void {
    const button = this.shell.copyButton;
    window.clearTimeout(this.copyTimer);
    button.textContent = copied === null ? COPY_LABEL.idle : copied ? COPY_LABEL.copied : COPY_LABEL.failed;
    button.classList.toggle("copied", copied === true);
    if (copied !== null) this.copyTimer = window.setTimeout(() => this.showCopyFeedback(null), COPY_FEEDBACK_MS);
  }

  // ---------------------------------------------------------------- rendering

  /** The games currently entered; lines without any roll or error are not games. */
  private entries(): GameEntry[] {
    const entries = this.comparing ? parseComparisonInput(this.text) : [parseGameLine(this.text)];
    return entries.filter(isGame);
  }

  private render(): void {
    const entries = this.entries();
    this.renderControls(entries);
    this.renderStatus(entries);
    this.renderViews(entries);
  }

  private renderControls(entries: readonly GameEntry[]): void {
    const { shell } = this;
    for (const [rule, tab] of shell.tabs) {
      const selected = rule === this.view;
      tab.setAttribute("aria-selected", String(selected));
      tab.setAttribute("tabindex", selected ? "0" : "-1");
    }
    const press = <T extends string>(buttons: ReadonlyMap<T, HTMLButtonElement>, current: T): void => {
      for (const [value, button] of buttons) {
        const pressed = value === current;
        button.setAttribute("aria-pressed", String(pressed));
        button.setAttribute("tabindex", pressed ? "0" : "-1");
      }
    };
    press(shell.notationButtons, this.notation);
    press(shell.layoutButtons, this.layout);

    shell.views.classList.toggle("is-horizontal", this.layout === "horizontal");
    shell.input.classList.toggle("is-comparing", this.comparing);
    shell.sampleRow.toggleAttribute("hidden", this.comparing);
    shell.presetRow.toggleAttribute("hidden", !this.comparing);
    for (const preset of COMPARISON_PRESETS) {
      const active = isPresetActive(preset, entries);
      shell.presetButtons.get(preset.id)?.setAttribute("aria-pressed", String(active));
    }
  }

  private sheetGame(entry: GameEntry): SheetGame {
    return {
      score: scoreGame(this.view, entry.rolls),
      error: entry.error?.message ?? null,
      color: entry.color ?? this.defaultColor,
    };
  }

  private renderStatus(entries: readonly GameEntry[]): void {
    const games = entries.map((entry) => this.sheetGame(entry));
    const sheet = this.comparing
      ? buildComparisonSheet(this.view, games, this.notation)
      : buildScoreSheet(this.view, games[0] ?? null, this.notation);
    // The sheet element is kept between updates, so that it fades when it fills or empties.
    const current = this.shell.status.firstElementChild;
    if (!current || !updateElement(document, current, sheet)) replaceChildren(document, this.shell.status, [sheet]);

    const messages: string[] = [];
    entries.forEach((entry, index) => {
      if (!entry.error) return;
      messages.push(entries.length > 1 ? `Game ${index + 1}: ${entry.error.message}` : entry.error.message);
    });
    this.shell.liveRegion.textContent = messages.join(" ");
  }

  private slot(rule: ScoringRule): ViewSlot {
    const known = this.slots.get(rule);
    if (known) return known;

    const graph = buildGraph(rule);
    const graphGeometry = computeGraphGeometry(graph, createGraphLayout(rule));
    const framesGeometry = computeFramesGeometry(rule);

    const tooltipOptions = {
      hitRadius: Number(rootProperty("--tooltip-hit-radius")),
      margin: Number(rootProperty("--tooltip-margin")),
    };
    // Both scenes are built before either is attached, so a failure leaves no half view behind.
    const build = (marker: string, spec: ElementSpec): { slot: HTMLElement; tooltip: TooltipLayer } => {
      const slot = document.createElement("div");
      const wrap = document.createElement("div");
      wrap.setAttribute("class", "responsive-svg-wrap");
      wrap.setAttribute(marker, RENDERER_MARKER);
      wrap.style.setProperty("--svg-width", String(GRAPH_SVG_WIDTH));
      wrap.style.setProperty("--svg-height", String(GRAPH_SVG_HEIGHT));
      const scene = createElement(document, spec) as SVGElement;
      const tooltip = document.createElement("div");
      tooltip.setAttribute("class", "graph-tooltip");
      wrap.append(scene, tooltip);
      slot.appendChild(wrap);
      const [x = 0, y = 0, width = 0, height = 0] = (scene.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
      return { slot, tooltip: new TooltipLayer(wrap, scene, tooltip, { viewBox: [x, y, width, height], ...tooltipOptions }) };
    };
    const graphView = build("data-bowling-renderer", buildGraphScene(graphGeometry));
    const framesView = build("data-bowling-frame-renderer", buildFramesScene(framesGeometry));
    this.shell.graphHost.appendChild(graphView.slot);
    this.shell.framesHost.appendChild(framesView.slot);

    const created: ViewSlot = {
      graph,
      graphGeometry,
      framesGeometry,
      graphSlot: graphView.slot,
      framesSlot: framesView.slot,
      graphHighlights: graphView.slot.querySelector("g.highlights")!,
      panelHighlights: Array.from(framesView.slot.querySelectorAll("g.highlight")),
      graphTooltip: graphView.tooltip,
      framesTooltip: framesView.tooltip,
    };
    this.slots.set(rule, created);
    return created;
  }

  private renderViews(entries: readonly GameEntry[]): void {
    const active = this.slot(this.view);
    for (const [rule, slot] of this.slots) {
      const hidden = rule !== this.view;
      slot.graphSlot.toggleAttribute("hidden", hidden);
      slot.framesSlot.toggleAttribute("hidden", hidden);
    }

    // Every game is a series, even one without valid rolls: it keeps its number.
    const series: HighlightSeries[] = entries.map((entry) => {
      const trace = traceRolls(active.graph, entry.rolls);
      const visits = entry.rolls.length > 0 ? frameVisits(active.graph, trace) : [];
      return { color: entry.color ?? this.defaultColor, trace, visits };
    });
    // Traces are only drawn in the blended comparison style when there are several of them.
    const mode: HighlightMode = { comparison: entries.filter((entry) => entry.rolls.length > 0).length > 1 };

    active.graphHighlights.setAttribute("class", rootClass("highlights", mode));
    replaceChildren(document, active.graphHighlights, buildGraphHighlights(active.graphGeometry, series, mode));
    const coverages = series.map((item) => coverSeries(active.framesGeometry, item));
    const panels = buildPanelHighlights(active.framesGeometry, series, coverages, mode);
    active.panelHighlights.forEach((element, index) => {
      element.setAttribute("class", rootClass("highlight", mode));
      replaceChildren(document, element, panels[index]!);
    });

    active.graphTooltip.setTargets(graphTooltipTargets(active.graphGeometry, series.map((item) => item.trace)));
    active.framesTooltip.setTargets(panelTooltipTargets(active.framesGeometry, coverages));
  }

  // ---------------------------------------------------------------- URL

  /** Query string for the current input and scoring rule. */
  private currentQuery(): string {
    return buildQuery(
      this.entries().map((entry) => ({ rolls: entry.rolls, color: entry.color })),
      this.view,
      this.defaultColor,
    );
  }

  /** Lets the address bar follow the state once the input has been quiet for a moment. */
  private scheduleUrl(): void {
    this.pendingQuery = this.currentQuery();
    window.clearTimeout(this.urlTimer);
    this.urlTimer = window.setTimeout(() => this.syncUrl(), URL_SYNC_DELAY_MS);
  }

  /**
   * Writes the pending query to the address bar. Where the browser refuses, the query
   * stays pending: the next change replaces it, and copying tries again.
   */
  private syncUrl(): void {
    window.clearTimeout(this.urlTimer);
    if (this.pendingQuery === null) return;
    const url = urlWithQuery(this.pendingQuery);
    if (url !== window.location.href) {
      try {
        replaceUrl(url);
      } catch (error) {
        console.error(error);
        return;
      }
    }
    this.pendingQuery = null;
  }
}
