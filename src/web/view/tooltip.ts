/**
 * The tooltip of a view: follows the pointer over the SVG and describes the nearest
 * highlighted node.
 */
import { clientToSvg, nearestTarget, placeTooltip } from "../../presentation/presentation/frame_panel/interaction";
import type { Point } from "../../presentation/presentation/graph";
import type { TooltipContent, TooltipTarget } from "../../presentation/presentation/tooltip";

const TOOLTIP_CLASS = "graph-tooltip";
const VISIBLE_CLASS = "is-visible";
const TARGET_CLASS = "has-tooltip-target";

export interface TooltipOptions {
  /** View box of the SVG, to translate pointer positions into SVG coordinates. */
  readonly viewBox: readonly [x: number, y: number, width: number, height: number];
  /** How close (in SVG units) the pointer has to be to a node. */
  readonly hitRadius: number;
  /** Distance (in CSS pixels) between pointer and tooltip. */
  readonly margin: number;
}

function fillTooltip(tooltip: HTMLElement, content: TooltipContent): void {
  const document = tooltip.ownerDocument;
  const title = document.createElement("div");
  title.setAttribute("class", "graph-tooltip-title");
  title.textContent = content.title;
  const rows = content.rows.map(([label, value]) => {
    const row = document.createElement("div");
    const name = document.createElement("span");
    name.setAttribute("class", "graph-tooltip-label");
    name.textContent = `${label}:`;
    const text = document.createElement("span");
    text.textContent = ` ${value}`;
    row.append(name, text);
    return row;
  });
  tooltip.replaceChildren(title, ...rows);
}

export class TooltipLayer {
  private targets: readonly TooltipTarget[] = [];
  /** Last pointer position in client coordinates; `null` once the pointer has left. */
  private pointer: Point | null = null;
  private visible = false;
  /** Index of the target the tooltip currently describes. */
  private shown: number | null = null;
  private readonly svgClass: string;

  constructor(
    private readonly wrap: HTMLElement,
    private readonly svg: SVGElement,
    private readonly tooltip: HTMLElement,
    private readonly options: TooltipOptions,
  ) {
    this.svgClass = svg.getAttribute("class") ?? "";
    const onPointer = (event: Event): void => {
      if (!(event instanceof MouseEvent)) return;
      this.pointer = [Math.trunc(event.clientX), Math.trunc(event.clientY)];
      this.update();
    };
    const onLeave = (event: Event): void => {
      if (!(event instanceof PointerEvent)) return;
      // A finger lifting off the screen should not dismiss what it just tapped.
      if (event.pointerType === "touch") return;
      this.pointer = null;
      this.hide();
    };
    const listenerOptions = { passive: true };
    svg.addEventListener("pointermove", onPointer, listenerOptions);
    svg.addEventListener("pointerdown", onPointer, listenerOptions);
    svg.addEventListener("pointerleave", onLeave, listenerOptions);
    // A tooltip opened by touch stays when the finger lifts; touching anything else closes it.
    svg.ownerDocument.addEventListener(
      "pointerdown",
      (event) => {
        if (event.target instanceof Node && svg.contains(event.target)) return;
        this.pointer = null;
        this.hide();
      },
      { passive: true, capture: true },
    );
  }

  /** Replaces the targets, e.g. after the highlighted games changed. */
  setTargets(targets: readonly TooltipTarget[]): void {
    this.targets = targets;
    this.shown = null;
    if (this.visible && this.pointer) this.update();
    else this.hide();
  }

  private update(): void {
    const pointer = this.pointer;
    if (!pointer) return;
    const svgPoint = clientToSvg(pointer, this.svg.getBoundingClientRect(), this.options.viewBox);
    const index = nearestTarget(this.targets, svgPoint, this.options.hitRadius);
    if (index === null) {
      this.hide();
      return;
    }
    if (this.shown !== index) {
      fillTooltip(this.tooltip, this.targets[index]!.content);
      this.shown = index;
    }
    this.visible = true;
    this.svg.setAttribute("class", `${this.svgClass} ${TARGET_CLASS}`);
    this.tooltip.setAttribute("class", `${TOOLTIP_CLASS} ${VISIBLE_CLASS}`);

    const box = this.wrap.getBoundingClientRect();
    const [left, top] = placeTooltip(
      [pointer[0] - box.left, pointer[1] - box.top],
      { width: this.tooltip.offsetWidth, height: this.tooltip.offsetHeight },
      box,
      this.options.margin,
    );
    this.tooltip.setAttribute("style", `--tooltip-left: ${left}; --tooltip-top: ${top};`);
  }

  private hide(): void {
    this.visible = false;
    this.tooltip.setAttribute("class", TOOLTIP_CLASS);
    this.svg.setAttribute("class", this.svgClass);
  }
}
