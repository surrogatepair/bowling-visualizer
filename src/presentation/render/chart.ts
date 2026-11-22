/**
 * Minimal declarative description of DOM/SVG output.
 *
 * Presentation code builds plain {@link ElementSpec} trees and never touches a
 * document; the web layer turns them into nodes (`web/view/dom.ts`). This keeps
 * geometry code testable without a browser.
 */

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
