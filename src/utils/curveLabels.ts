import type { GraphPoint } from "../types/function";
export type LabelBox = { x: number; y: number; width: number; height: number };
export type LabelCurve = {
  id: string;
  segments: GraphPoint[][];
  width: number;
  height: number;
  preferred?: { anchor: GraphPoint; dx: number; dy: number };
};
export type CurveLabelPlacement = LabelBox & {
  id: string;
  anchor: GraphPoint;
  dx: number;
  dy: number;
};

export function segmentDistance(
  point: GraphPoint,
  a: GraphPoint,
  b: GraphPoint,
): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
export function segmentHitsBox(
  a: GraphPoint,
  b: GraphPoint,
  box: LabelBox,
): boolean {
  if (
    Math.max(a.x, b.x) < box.x ||
    Math.min(a.x, b.x) > box.x + box.width ||
    Math.max(a.y, b.y) < box.y ||
    Math.min(a.y, b.y) > box.y + box.height
  )
    return false;
  let low = 0,
    high = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [
    a.x - box.x,
    box.x + box.width - a.x,
    a.y - box.y,
    box.y + box.height - a.y,
  ];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
      continue;
    }
    const ratio = q[i] / p[i];
    if (p[i] < 0) low = Math.max(low, ratio);
    else high = Math.min(high, ratio);
    if (low > high) return false;
  }
  return true;
}
const expand = (box: LabelBox, gap: number): LabelBox => ({
  x: box.x - gap,
  y: box.y - gap,
  width: box.width + 2 * gap,
  height: box.height + 2 * gap,
});
const overlaps = (a: LabelBox, b: LabelBox) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;
function boxSegmentDistance(box: LabelBox, a: GraphPoint, b: GraphPoint) {
  if (segmentHitsBox(a, b, box)) return 0;
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ];
  const pointDistance = (p: GraphPoint) =>
    Math.hypot(
      Math.max(box.x - p.x, 0, p.x - box.x - box.width),
      Math.max(box.y - p.y, 0, p.y - box.y - box.height),
    );
  return Math.min(
    pointDistance(a),
    pointDistance(b),
    ...corners.map((p) => segmentDistance(p, a, b)),
  );
}
export function placeCurveLabels(
  curves: LabelCurve[],
  width: number,
  height: number,
  obstacles: LabelBox[],
): CurveLabelPlacement[] {
  const lines = curves.map((curve) => ({
    id: curve.id,
    edges: curve.segments.flatMap((segment) =>
      segment.slice(1).map((b, i) => [segment[i], b] as const),
    ),
  }));
  const placed: CurveLabelPlacement[] = [];
  for (const curve of curves) {
    if (
      curve.width <= 0 ||
      !curve.segments.some((segment) => segment.length > 1)
    )
      continue;
    const own = lines.find((line) => line.id === curve.id)!;
    const valid = (box: LabelBox) => {
      if (
        box.x < 8 ||
        box.y < 8 ||
        box.x + box.width > width - 8 ||
        box.y + box.height > height - 8
      )
        return false;
      if (
        [...obstacles, ...placed].some((other) =>
          overlaps(expand(box, 5), other),
        )
      )
        return false;
      const safe = expand(box, 4);
      if (
        lines.some((line) =>
          line.edges.some(([a, b]) => segmentHitsBox(a, b, safe)),
        )
      )
        return false;
      const ownDistance = Math.min(
        ...own.edges.map(([a, b]) => boxSegmentDistance(box, a, b)),
      );
      if (ownDistance > 24) return false;
      // A name must clearly belong to its own curve, including near intersections.
      return !lines.some(
        (line) =>
          line.id !== curve.id &&
          line.edges.some(
            ([a, b]) => boxSegmentDistance(box, a, b) < ownDistance + 9,
          ),
      );
    };
    const preferred = curve.preferred;
    if (preferred) {
      const box = {
        x: preferred.anchor.x + preferred.dx,
        y: preferred.anchor.y + preferred.dy,
        width: curve.width,
        height: curve.height,
      };
      if (valid(box)) {
        placed.push({ ...box, ...preferred, id: curve.id });
        continue;
      }
    }
    const points = curve.segments
      .flat()
      .filter(
        (point) =>
          point.x > 12 &&
          point.x < width - 12 &&
          point.y > 12 &&
          point.y < height - 12,
      );
    const anchors = points.filter(
      (_, i) => i % Math.max(1, Math.ceil(points.length / 50)) === 0,
    );
    let best: CurveLabelPlacement | undefined,
      score = Infinity;
    for (const anchor of anchors) {
      const offsets = [
        { dx: 10, dy: -curve.height / 2 },
        { dx: -curve.width - 10, dy: -curve.height / 2 },
        { dx: -curve.width / 2, dy: -curve.height - 10 },
        { dx: -curve.width / 2, dy: 10 },
        { dx: 10, dy: -curve.height - 8 },
        { dx: 10, dy: 8 },
        { dx: -curve.width - 10, dy: -curve.height - 8 },
        { dx: -curve.width - 10, dy: 8 },
      ];
      for (const offset of offsets) {
        const box = {
          x: anchor.x + offset.dx,
          y: anchor.y + offset.dy,
          width: curve.width,
          height: curve.height,
        };
        if (!valid(box)) continue;
        const candidateScore =
          Math.abs(anchor.x - width * 0.52) * 0.16 +
          Math.abs(anchor.y - height * 0.45) * 0.1 +
          Math.hypot(
            offset.dx + curve.width / 2,
            offset.dy + curve.height / 2,
          ) *
            0.3;
        if (candidateScore < score) {
          score = candidateScore;
          best = { ...box, ...offset, anchor, id: curve.id };
        }
      }
    }
    if (best) placed.push(best);
  }
  return placed;
}
