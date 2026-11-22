/**
 * Minimal declarative description of DOM/SVG output plus the code that realizes it.
 *
 * Presentation code builds plain {@link ElementSpec} trees; only {@link createElement}
 * touches the document. This keeps geometry code testable without a browser.
 */

export const SVG_NS = "http://www.w3.org/2000/svg";

/** Attribute list in insertion order; `null` values are skipped. */
export type Attrs = ReadonlyArray<readonly [name: string, value: string | number | null]>;

export interface ElementSpec {
  readonly tag: string;
  readonly attrs: Attrs;
  readonly children: readonly ChildSpec[];
  /** Inline custom properties, applied through `style.setProperty`. */
  readonly style?: ReadonlyArray<readonly [name: string, value: string]>;
}

export type ChildSpec = ElementSpec | string;

const SVG_TAGS = new Set(["svg", "g", "path", "rect", "circle", "text", "tspan"]);

/** Shorthand constructor for an {@link ElementSpec}. */
export function el(
  tag: string,
  attrs: Attrs = [],
  children: readonly ChildSpec[] = [],
  style?: ReadonlyArray<readonly [string, string]>,
): ElementSpec {
  return style ? { tag, attrs, children, style } : { tag, attrs, children };
}

/** A group element carrying only a class. */
export function group(className: string, children: readonly ChildSpec[] = []): ElementSpec {
  return el("g", [["class", className]], children);
}

/** A path element with a class and path data. */
export function path(className: string, d: string): ElementSpec {
  return el("path", [["class", className], ["d", d]]);
}

/** Creates the DOM node (and its subtree) described by `spec`. */
export function createElement(doc: Document, spec: ElementSpec): Element {
  const node = SVG_TAGS.has(spec.tag) ? doc.createElementNS(SVG_NS, spec.tag) : doc.createElement(spec.tag);
  for (const [name, value] of spec.attrs) {
    if (value !== null) node.setAttribute(name, String(value));
  }
  if (spec.style) {
    const style = (node as HTMLElement | SVGElement).style;
    for (const [name, value] of spec.style) style.setProperty(name, value);
  }
  for (const child of spec.children) {
    node.appendChild(typeof child === "string" ? doc.createTextNode(child) : createElement(doc, child));
  }
  return node;
}

/** Replaces all children of `parent` with freshly created nodes. */
export function replaceChildren(doc: Document, parent: Element, children: readonly ChildSpec[]): void {
  const nodes = children.map((child) => (typeof child === "string" ? doc.createTextNode(child) : createElement(doc, child)));
  parent.replaceChildren(...nodes);
}

/**
 * Brings `element` in line with `spec` without replacing the element itself: its
 * attributes are updated and its children rebuilt. Keeping the element lets CSS
 * transitions on it run when its state changes. Returns false when the element is of
 * another kind and has to be replaced instead.
 */
export function updateElement(doc: Document, element: Element, spec: ElementSpec): boolean {
  if (element.localName !== spec.tag) return false;
  const wanted = new Map<string, string>();
  for (const [name, value] of spec.attrs) {
    if (value !== null) wanted.set(name, String(value));
  }
  for (const name of element.getAttributeNames()) {
    if (!wanted.has(name)) element.removeAttribute(name);
  }
  for (const [name, value] of wanted) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }
  if (spec.style) {
    const style = (element as HTMLElement | SVGElement).style;
    for (const [name, value] of spec.style) style.setProperty(name, value);
  }
  replaceChildren(doc, element, spec.children);
  return true;
}
