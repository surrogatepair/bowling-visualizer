/**
 * Turns element descriptions into DOM nodes. This is the only place where
 * {@link ElementSpec} trees meet a document.
 */
import type { ChildSpec, ElementSpec } from "../../presentation/render/chart";

const SVG_NS = "http://www.w3.org/2000/svg";

const SVG_TAGS = new Set(["svg", "g", "path", "rect", "circle", "text", "tspan"]);

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
