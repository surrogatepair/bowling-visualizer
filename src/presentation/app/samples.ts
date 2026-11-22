/**
 * Sample games for the buttons under the input. Apart from the perfect game they are
 * randomised, so every click gives a different game of the same kind.
 */

export interface Sample {
  readonly id: string;
  readonly label: string;
}

export const SAMPLES: readonly Sample[] = [
  { id: "perfect", label: "Perfect 300" },
  { id: "dutch", label: "Dutch 200" },
  { id: "clean", label: "Clean Game" },
  { id: "all-spare", label: "All Spare" },
  { id: "all-open", label: "All Open" },
  { id: "random", label: "Random" },
];

/** Random numbers drawn per sample; enough for the longest possible game. */
export const SAMPLE_RANDOM_COUNT = 30;

/** Chance of a strike, and of a strike or spare, in a random frame. */
const STRIKE_CHANCE = 0.18;
const MARK_CHANCE = 0.42;

const PERFECT_GAME = "X X X X X X X X X XXX";

/** A fixed supply of uniform random numbers in [0, 1). */
class RandomSource {
  private index = 0;

  constructor(private readonly values: readonly number[]) {}

  /** The next number, or undefined once the supply is used up. */
  next(): number | undefined {
    const value = this.index < this.values.length ? this.values[this.index] : undefined;
    this.index += 1;
    return value;
  }
}

/** A uniformly random integer in `0..=max`. */
function pick(value: number | undefined, choices: number, max: number): number {
  if (value === undefined) return 0;
  return Math.min(Math.max(Math.floor(value * choices), 0), max);
}

function pinsText(pins: number): string {
  if (pins === 10) return "X";
  return pins === 0 ? "-" : String(pins);
}

/** A spare frame such as `7/`. */
function spareFrame(random: RandomSource): string {
  return `${pinsText(pick(random.next(), 10, 9))}/`;
}

/** An open frame such as `72`. */
function openFrame(random: RandomSource): string {
  const first = pick(random.next(), 10, 9);
  const second = pick(random.next(), 10 - first, 9 - first);
  return `${pinsText(first)}${pinsText(second)}`;
}

/** A tenth frame that starts with a spare, such as `7/X`. */
function spareTenth(random: RandomSource): string {
  const first = pick(random.next(), 10, 9);
  const bonus = pick(random.next(), 11, 10);
  return `${pinsText(first)}/${pinsText(bonus)}`;
}

/** A tenth frame that starts with a strike, such as `X7/` or `XX9`. */
function strikeTenth(random: RandomSource): string {
  const second = pick(random.next(), 11, 10);
  if (second === 10) return `XX${pinsText(pick(random.next(), 11, 10))}`;
  const third = pick(random.next(), 11 - second, 10 - second);
  const thirdText = second + third === 10 ? "/" : pinsText(third);
  return `X${pinsText(second)}${thirdText}`;
}

/** Alternating strikes and spares; scores exactly 200. */
function dutchGame(random: RandomSource): string {
  const strikeFirst = (random.next() ?? 0) < 0.5;
  const frames: string[] = [];
  for (let pair = 0; pair < 4; pair++) {
    if (strikeFirst) frames.push("X", spareFrame(random));
    else frames.push(spareFrame(random), "X");
  }
  if (strikeFirst) frames.push("X", `${spareFrame(random)}X`);
  else frames.push(spareFrame(random), `X${spareFrame(random)}`);
  return frames.join(" ");
}

/** A game of strikes, spares and (unless `clean`) open frames. */
function mixedGame(random: RandomSource, clean: boolean): string {
  const frames: string[] = [];
  for (let frame = 1; frame <= 10; frame++) {
    const tenth = frame === 10;
    const roll = random.next();
    const strike = roll === undefined || roll < (clean ? MARK_CHANCE : STRIKE_CHANCE);
    if (strike) frames.push(tenth ? strikeTenth(random) : "X");
    else if (clean || roll < MARK_CHANCE) frames.push(tenth ? spareTenth(random) : spareFrame(random));
    else frames.push(openFrame(random));
  }
  return frames.join(" ");
}

function allSpareGame(random: RandomSource): string {
  const frames: string[] = [];
  for (let frame = 1; frame <= 9; frame++) frames.push(spareFrame(random));
  frames.push(spareTenth(random));
  return frames.join(" ");
}

function allOpenGame(random: RandomSource): string {
  const frames: string[] = [];
  for (let frame = 1; frame <= 10; frame++) frames.push(openFrame(random));
  return frames.join(" ");
}

/**
 * Builds the roll notation of a sample game from {@link SAMPLE_RANDOM_COUNT}
 * uniform random numbers.
 */
export function generateSample(id: string, randoms: readonly number[]): string {
  const random = new RandomSource(randoms);
  switch (id) {
    case "dutch":
      return dutchGame(random);
    case "clean":
      return mixedGame(random, true);
    case "all-spare":
      return allSpareGame(random);
    case "all-open":
      return allOpenGame(random);
    case "random":
      return mixedGame(random, false);
    default:
      return PERFECT_GAME;
  }
}
