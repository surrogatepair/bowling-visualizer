import { describe, expect, it } from "vitest";
import {
  COMPARISON_PRESETS,
  findPreset,
  isPresetActive,
  parseComparisonInput,
  parseGameLine,
  togglePreset,
  type PresetColor,
} from "../src/presentation/app/comparison";
import { formatRolls } from "../src/presentation/app/notation_text";

const palette = (name: PresetColor): string => `#${name.length.toString(16).padStart(6, "0")}`;

describe("parseGameLine", () => {
  it("takes a trailing #rrggbb as the colour of the game", () => {
    const entry = parseGameLine("  X 9/ 81 #A1B2C3  ");
    expect(entry.rolls).toEqual([10, 9, 1, 8, 1]);
    expect(entry.color).toBe("#a1b2c3");
    expect(entry.text).toBe("X 9/ 81");
    expect(entry.error).toBeNull();
  });

  it("treats anything else after # as notation", () => {
    const entry = parseGameLine("X X #zz0000");
    expect(entry.color).toBeNull();
    expect(entry.error?.message).toBe('unexpected character "#"');
    expect(entry.rolls).toEqual([10, 10]);
  });
});

describe("parseComparisonInput", () => {
  it("reads one game per non-blank line", () => {
    const entries = parseComparisonInput("X X\n\n  \n9/ #00ff00\n");
    expect(entries.map((entry) => [entry.rolls.length, entry.color])).toEqual([
      [2, null],
      [2, "#00ff00"],
    ]);
  });
});

describe("presets", () => {
  const perfect = findPreset("perfect")!;

  it("have unique ids and valid, complete games", () => {
    expect(new Set(COMPARISON_PRESETS.map((preset) => preset.id)).size).toBe(COMPARISON_PRESETS.length);
    for (const preset of COMPARISON_PRESETS) {
      for (const game of preset.games) {
        const entry = parseGameLine(game.notation);
        expect(entry.error).toBeNull();
        expect(formatRolls(entry.rolls)).toBe(game.notation);
      }
      for (const companion of preset.companions) expect(findPreset(companion)).toBeDefined();
    }
  });

  it("are added to the input and removed again", () => {
    const added = togglePreset(perfect, "9/", palette);
    expect(added).toBe(`9/\nX X X X X X X X X XXX ${palette("--preset-perfect")}`);
    expect(isPresetActive(perfect, parseComparisonInput(added))).toBe(true);
    expect(togglePreset(perfect, added, palette)).toBe("9/");
  });

  it("recognise their games regardless of spelling and colour", () => {
    const entries = parseComparisonInput("xxxxxxxxxxxx #123456");
    expect(isPresetActive(perfect, entries)).toBe(true);
    expect(togglePreset(perfect, "xxxxxxxxxxxx #123456\n 9/ ", palette)).toBe("9/");
  });

  it("tidy the lines they keep", () => {
    const text = togglePreset(perfect, "  X   #FF0000  \n\n#123456\n\tabc", palette);
    expect(text.split("\n").slice(0, 2)).toEqual(["X   #FF0000", "abc"]);
  });

  it("bring their companions along", () => {
    const tapSave = findPreset("tap-save")!;
    const entries = parseComparisonInput(togglePreset(tapSave, "", palette));
    for (const id of [tapSave.id, ...tapSave.companions]) expect(isPresetActive(findPreset(id)!, entries)).toBe(true);
  });
});
