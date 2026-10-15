import type { Viewport } from "../types/function";
export function viewportAfterHeightResize(
  view: Viewport,
  before: { width: number; height: number },
  after: { width: number; height: number },
): Viewport {
  if (
    before.height <= 0 ||
    Math.abs(before.width - after.width) > 2 ||
    Math.abs(before.height - after.height) < 1
  )
    return view;
  return {
    ...view,
    cy: view.cy - (after.height - before.height) / (2 * view.scale),
  };
}
