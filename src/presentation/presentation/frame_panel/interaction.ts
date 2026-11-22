/**
 * Pointer interaction shared by the views: which tooltip target, if any, a pointer
 * position selects.
 */
import type { Point } from "../graph";
import type { TooltipTarget } from "../tooltip";

/**
 * Index of the target closest to `pointer`, provided it lies within `radius`. When
 * several targets are equally close the last one wins.
 */
export function nearestTarget(targets: readonly TooltipTarget[], pointer: Point, radius: number): number | null {
  let best = radius * radius;
  let found: number | null = null;
  targets.forEach((target, index) => {
    const dx = target.point[0] - pointer[0];
    const dy = target.point[1] - pointer[1];
    const distance = dx * dx + dy * dy;
    if (distance <= best) {
      best = distance;
      found = index;
    }
  });
  return found;
}

/** Maps a client position to SVG user coordinates, given the SVG's box and view box. */
export function clientToSvg(
  client: Point,
  box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  viewBox: readonly [x: number, y: number, width: number, height: number],
): Point {
  const scaleX = viewBox[2] > 0 && box.width > 0 ? viewBox[2] / box.width : 1;
  const scaleY = viewBox[3] > 0 && box.height > 0 ? viewBox[3] / box.height : 1;
  return [viewBox[0] + scaleX * (client[0] - box.left), viewBox[1] + scaleY * (client[1] - box.top)];
}

/**
 * Where to put a tooltip of the given size next to the pointer, inside a container:
 * right of and below the pointer by `margin`, flipped to the other side when it would
 * overflow, and never outside the container's top-left corner.
 */
export function placeTooltip(
  pointer: Point,
  size: { readonly width: number; readonly height: number },
  container: { readonly width: number; readonly height: number },
  margin: number,
): Point {
  const fallback = (value: number): number => (value > 0 ? value : 0);
  let left = pointer[0] + margin;
  if (container.width < size.width + left) left = fallback(pointer[0] - size.width - margin);
  let top = pointer[1] + margin;
  if (size.height + top > container.height) top = fallback(pointer[1] - size.height - margin);
  return [left, top];
}
