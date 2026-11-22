# Bowling Score State Visualizer

An interactive, single-page visualizer for the state space of ten-pin bowling scoring.
Every reachable scoring state is a node, every roll an edge; type a game and watch its
route through the graph.

Live site: <https://surrogatepair.github.io/bowling-visualizer/>

## Features

- **State graph** of a whole game: 27,695 states under standard scoring, 14,261 under
  current-frame scoring, laid out by frame and score.
- **Frame Scoring Flow**: one panel per bonus state a frame can start in (no bonus,
  spare, strike, double strike), plus summary panels that relate entry states to
  outcomes.
- **Score sheet** for the entered game, with strikes and spares either as text
  (`X`, `/`) or as the figures used on Japanese score sheets.
- **Comparison mode**: several games at once, one per line, each optionally coloured
  with a trailing `#rrggbb`, and preset families of games (Perfect 300, Tap 299,
  Dutch 200, ...).
- **Tooltips** on the highlighted nodes, sample games, a shareable URL and persistent
  layout/notation preferences.

### Roll notation

| Input                | Meaning                                         |
| -------------------- | ----------------------------------------------- |
| `X`                  | strike                                          |
| `/`                  | spare (the rest of the pins)                    |
| `0`-`9`              | pins knocked down                               |
| `-`, `G`, `F`        | no pins (miss, gutter, foul)                    |
| space, tab, `\|`     | separators, optional                            |
| `#rrggbb` at the end | colour of the game (comparison mode)            |

Letters may be upper or lower case. Example: `X 9/ 81 -5 X X 72 9/ X XX9`.

### URL parameters

| Parameter | Meaning                                                                        |
| --------- | ------------------------------------------------------------------------------ |
| `rolls`   | one game, one character per roll (`x91810...`); repeat it to compare games     |
| `color`   | colour of the game at the same position, as six hex digits                     |
| `view`    | `current-frame` for current-frame scoring; standard scoring is the default     |

The address bar follows the input, so the current state can be shared with **Copy URL**.

## Development

Requires Node.js 22.12 or newer.

```sh
npm ci           # install dependencies
npm run dev      # start a dev server with hot reload
npm test         # run the unit tests
npm run build    # type-check and build dist/index.html
npm run preview  # serve the production build
```

The build produces a single self-contained `dist/index.html` (markup, styles and script
in one file), which also works when opened directly from disk.

### Project layout

```
src/
  index.html, main.ts   entry point
  core/                 notation parser, scoring rules, state graph, game tracing
  presentation/         geometry, SVG scene descriptions, score sheet, tooltips, URL format
  web/                  DOM shell, event handling, browser APIs
  styles/               stylesheet, split by area
tests/                  unit tests (Vitest)
```

`core` and `presentation` are free of DOM access: scenes are described as plain data
(`ElementSpec`) and only `presentation/render` and `web` touch the document.

### Continuous integration

`.github/workflows/ci.yml` type-checks, tests and builds every push and pull request.
Pushes to `main` are additionally deployed to GitHub Pages.

## About this source

This repository originally contained only the built application: one `index.html` with
an embedded WebAssembly module compiled from Rust (the first commit). The original
source was not available, so the code here is a **reconstruction in TypeScript** made
from that build:

- Behaviour was re-implemented from the build's observable behaviour and its
  decompiled logic. Texts, styles, geometry and DOM structure are the same; names,
  comments and the module boundaries are new, and the layout of `src/` follows the
  crate and file names recovered from the binary (`bowling-core`,
  `bowling-presentation`, `bowling-web`).
- Equivalence was checked by driving both builds through the same 188 scripted
  scenarios (typing, samples, comparison mode and presets, URL loading and syncing,
  copy, keyboard and pointer interaction, stored preferences) and comparing the
  resulting DOM and state after each of 1,800+ steps, and by comparing full-page
  screenshots.
- `tests/fixtures/` holds inputs and results recorded from the original build; the
  unit tests replay them against this code.

The only intended difference in the output is the value of the `data-bowling-*` marker
attributes, which say `ts` where the original said `rust`.
