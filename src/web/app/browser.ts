/**
 * Thin wrappers around browser facilities, so the controller does not have to deal
 * with missing APIs or storage that throws.
 */
import { el, type ElementSpec } from "../../presentation/render/chart";
import { createElement } from "../view/dom";

export const APP_TITLE = "Bowling Score State Visualizer";

/** Reads a value from local storage; unavailable storage reads as empty. */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be disabled; the preference then simply does not persist.
  }
}

/** The user's preferred languages, most preferred first. */
export function preferredLanguages(): string[] {
  const listed: readonly unknown[] = Array.isArray(navigator.languages) ? navigator.languages : [];
  const languages = listed.filter((language): language is string => typeof language === "string");
  if (languages.length === 0 && typeof navigator.language === "string") languages.push(navigator.language);
  return languages;
}

/** Reads a custom property from the document's computed style. */
export function rootProperty(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value === "") throw new Error(`missing CSS property ${name}`);
  return value;
}

/**
 * Value of the `data-bowling-*` attributes that mark what this build generated: the
 * stylesheet and the two rendered views.
 */
export const RENDERER_MARKER = "ts";

/** Elements the app needs in `<head>`; existing ones with the same id are updated in place. */
function headElements(css: string): { id: string | null; spec: ElementSpec }[] {
  return [
    { id: "bowling-charset", spec: el("meta", [["id", "bowling-charset"], ["charset", "UTF-8"]]) },
    {
      id: "bowling-viewport",
      spec: el("meta", [["id", "bowling-viewport"], ["name", "viewport"], ["content", "width=device-width, initial-scale=1.0"]]),
    },
    { id: null, spec: el("link", [["rel", "icon"], ["href", "data:,"]]) },
    { id: null, spec: el("style", [["data-bowling-style", RENDERER_MARKER]], [css]) },
  ];
}

/**
 * Prepares the document (language, title, head elements, stylesheet) and returns the
 * root element the shell is mounted into.
 */
export function prepareDocument(css: string): HTMLElement {
  const root = document.documentElement;
  root.setAttribute("lang", "en");
  document.title = APP_TITLE;
  for (const { id, spec } of headElements(css)) {
    const existing = id === null ? null : document.getElementById(id);
    if (existing) {
      for (const [name, value] of spec.attrs) {
        if (value !== null) existing.setAttribute(name, String(value));
      }
    } else {
      document.head.appendChild(createElement(document, spec));
    }
  }
  const main = document.createElement("main");
  main.setAttribute("id", "app");
  main.setAttribute("class", "app-shell");
  document.body.appendChild(main);
  return main;
}

/** The current URL with its query string replaced; path and fragment are kept. */
export function urlWithQuery(query: string): string {
  const url = new URL(window.location.href);
  url.search = query;
  return url.href;
}

/** Puts `url` in the address bar without adding a history entry. Throws where the browser refuses. */
export function replaceUrl(url: string): void {
  window.history.replaceState(null, "", url);
}

/** Legacy copy path for browsers without (or refusing) the asynchronous clipboard API. */
function copyWithSelection(text: string): boolean {
  const previous = document.activeElement;
  const buffer = document.createElement("textarea");
  buffer.className = "clipboard-buffer";
  buffer.value = text;
  document.body.appendChild(buffer);
  buffer.focus();
  buffer.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  buffer.remove();
  if (previous instanceof HTMLElement) previous.focus();
  return copied;
}

/**
 * Copies text to the clipboard and resolves to whether it worked.
 *
 * The asynchronous clipboard API can take a while (a permission prompt, for example).
 * `isCurrent` is asked once it settles: a request that has been superseded resolves to
 * `null` and does nothing further, so it cannot overwrite what a newer request copied.
 */
export async function copyText(text: string, isCurrent: () => boolean): Promise<boolean | null> {
  let clipboard: Clipboard | undefined;
  try {
    clipboard = navigator.clipboard;
  } catch {
    clipboard = undefined;
  }
  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return isCurrent() ? true : null;
    } catch {
      if (!isCurrent()) return null;
      // Fall through to the selection-based path.
    }
  }
  return copyWithSelection(text);
}
