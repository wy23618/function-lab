import type { GraphPoint, Viewport } from "../types/function";

export interface PinchAnchor {
  distance: number;
  scale: number;
  anchor: GraphPoint;
}

export function beginPinch(
  view: Viewport,
  first: GraphPoint,
  second: GraphPoint,
  width: number,
  height: number,
): PinchAnchor {
  const x = (first.x + second.x) / 2,
    y = (first.y + second.y) / 2;
  return {
    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
    scale: view.scale,
    anchor: {
      x: view.cx + (x - width / 2) / view.scale,
      y: view.cy - (y - height / 2) / view.scale,
    },
  };
}

export function movePinch(
  start: PinchAnchor,
  first: GraphPoint,
  second: GraphPoint,
  width: number,
  height: number,
): Viewport {
  const distance = Math.hypot(second.x - first.x, second.y - first.y);
  const scale = Math.max(
    1e-12,
    Math.min(100000, (start.scale * distance) / start.distance),
  );
  return {
    scale,
    cx: start.anchor.x - ((first.x + second.x) / 2 - width / 2) / scale,
    cy: start.anchor.y + ((first.y + second.y) / 2 - height / 2) / scale,
  };
}
