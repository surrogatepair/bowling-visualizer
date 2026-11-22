/** Six-digit hexadecimal colours as used for highlight series (`#rrggbb`). */

const HEX_COLOR = /^[0-9a-fA-F]{6}$/;

/** Parses six hex digits (without `#`) into a normalised `#rrggbb` colour. */
export function parseHexDigits(digits: string): string | null {
  return HEX_COLOR.test(digits) ? `#${digits.toLowerCase()}` : null;
}

/** Parses a CSS value that must be a six-digit hex colour. */
export function parseHexColor(value: string): string | null {
  const text = value.trim();
  return text.startsWith("#") ? parseHexDigits(text.slice(1)) : null;
}

/** The digits of a `#rrggbb` colour, as used in URLs. */
export function hexDigits(color: string): string {
  return color.slice(1);
}
