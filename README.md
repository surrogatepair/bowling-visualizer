# Bowling Score State Visualizer

Draws ten-pin bowling scoring as a state graph. Each scoring state is a node and each
roll is an edge. Enter a game to see the path it takes.

https://surrogatepair.github.io/bowling-visualizer/

## Input

| Input            | Meaning                      |
| ---------------- | ---------------------------- |
| `X`              | strike                       |
| `/`              | spare                        |
| `0`-`9`          | pins knocked down            |
| `-`, `G`, `F`    | no pins (miss, gutter, foul) |
| space, tab, `\|` | separators (optional)        |

Case does not matter. Example: `X 9/ 81 -5 X X 72 9/ X XX9`

Full-width characters (`Ｘ`, `／`, `９`, `－`, `ー`) are read as their plain counterparts.
Dashes (`–`, `—`) are not accepted.

In comparison mode each line is one game. End a line with `#rrggbb` to set its color.

## URL parameters

| Parameter | Value                                                    |
| --------- | -------------------------------------------------------- |
| `rolls`   | one character per roll, e.g. `x9181`. Repeat to compare. |
| `color`   | six hex digits, matched to `rolls` by position           |
| `view`    | `current-frame` (default is standard scoring)            |

## Development

Node.js 22.12 or later.

```sh
npm ci
npm run dev      # dev server
npm test         # unit tests
npm run build    # writes dist/index.html
```

The build output is a single self-contained `dist/index.html`.

Source layout:

- `src/core`: notation parser, scoring rules, state graph
- `src/presentation`: geometry, SVG scenes, score sheet, URL format
- `src/web`: DOM and event handling
- `src/styles`: CSS

Pushes to `main` are built and deployed to GitHub Pages by `.github/workflows/ci.yml`.
