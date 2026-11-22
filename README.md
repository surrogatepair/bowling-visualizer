# Bowling Score State Visualizer

Draws ten-pin bowling scoring as a state graph. Each scoring state is a node and each
roll is an edge. Enter a game to see the path it takes.

https://surrogatepair.github.io/bowling-visualizer/

## Background

A roll can count more than once. A strike adds the next two rolls to its frame and a
spare adds the next one, so what a roll is worth depends on the two rolls before it.
After two strikes in a row the next roll counts three times: once for each strike and
once for its own frame.

The running total is therefore not enough to continue a game. You also need to know
which bonuses are still open: none, a spare, a strike, or two strikes. Together with
the frame and the total, that is the whole state between frames. Inside a frame the
state also holds the pins of the first roll.

The totals in the graph are provisional. A roll is added as soon as it is thrown, once
for every frame it counts for, so `X X X` reads 10, 30, 60. The total never goes down
along the way, and at the end of the game it is the ordinary score.

A tree with one branch per roll would have 66<sup>9</sup> × 241 leaves, one for each
possible game [1]. But many games pass through the same states: `9- 81` and `81 9-`
both reach frame 3 with 18 and nothing open. Merging equal states turns the tree into
a directed acyclic graph that is small enough to draw.

| Scoring       | Nodes  | Edges   | Games                                      |
| ------------- | ------ | ------- | ------------------------------------------ |
| Standard      | 27,695 | 196,319 | 66<sup>9</sup> × 241 ≈ 5.7 × 10<sup>18</sup> |
| Current-frame | 14,261 | 96,520  | 66<sup>10</sup> ≈ 1.6 × 10<sup>18</sup>      |

Every node is a state, every edge is a roll, and every game is a path from the start to
an end node. The standard graph has 301 end nodes, one for each total from 0 to 300.

Current-frame scoring is the World Bowling variant: a strike scores 30, a spare 10 plus
its first roll, and nothing carries into later frames.

The first view is the graph itself, with frames from left to right and the total going
up. Under standard scoring, frames 1 to 9 all follow the same rules, so the second view
draws one frame, once for each of the four states it can start in, and the tenth frame
separately.

The four bonus states are not new. MathWorld uses the same four to count the games for
every final score, and credits the count to Cooper and Kennedy (1990) [1]. What this
project adds is the picture: the whole state space as one graph, and a game as a path
through it. I have not found that drawn anywhere else.

[1] Eric W. Weisstein, "Bowling", MathWorld. https://mathworld.wolfram.com/Bowling.html

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
