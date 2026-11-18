import type {
  FunctionDefinition,
  GraphPoint,
  Viewport,
} from "../types/function";
import { evaluateFunction } from "../services/functionSampler";

/** Fit independently sampled study layers, including numerical primitives. */
export function fitSampledViewport(
  curves: GraphPoint[][],
  size: { width: number; height: number },
): Viewport | null {
  if (size.width <= 0 || size.height <= 0) return null;
  const bounds = curves.flatMap((curve) => {
    const points = curve.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    );
    if (!points.length) return [];
    const xs = points.map((p) => p.x).sort((a, b) => a - b),
      ys = points.map((p) => p.y).sort((a, b) => a - b),
      trim = Math.floor(points.length * 0.03);
    return [
      {
        xmin: xs[trim],
        xmax: xs[xs.length - 1 - trim],
        ymin: ys[trim],
        ymax: ys[ys.length - 1 - trim],
      },
    ];
  });
  if (!bounds.length) return null;
  const xmin = Math.min(...bounds.map((b) => b.xmin)),
    xmax = Math.max(...bounds.map((b) => b.xmax)),
    ymin = Math.min(...bounds.map((b) => b.ymin)),
    ymax = Math.max(...bounds.map((b) => b.ymax));
  const result = {
    cx: xmin / 2 + xmax / 2,
    cy: ymin / 2 + ymax / 2,
    scale: Math.max(
      1e-12,
      Math.min(
        100000,
        size.width / Math.max(2, xmax - xmin) / 1.25,
        size.height / Math.max(2, ymax - ymin) / 1.25,
      ),
    ),
  };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

// Uniform samples give each part of the domain equal weight. Adaptive drawing
// samples cluster near poles and must not determine the camera's extent.
function pointAt(fn: FunctionDefinition, x: number, depth = 0): GraphPoint {
  if (depth > 20 || fn.calculusLink?.error) return { x: NaN, y: NaN };
  if (fn.kind === "relation" && fn.source && fn.reflection) {
    const source = fn.inputAxis
      ? {
          ...fn.source,
          parameters: fn.parameters,
          bindings: fn.bindings,
          liveBindings: fn.liveBindings,
          domain: fn.domain,
        }
      : fn.source;
    const point = pointAt(source, x, depth + 1);
    const { a, b, c } = fn.reflection;
    const distance = (a * point.x + b * point.y + c) / (a * a + b * b);
    return { x: point.x - 2 * a * distance, y: point.y - 2 * b * distance };
  }
  return { x, y: evaluateFunction(fn, x) };
}

export function fitGraphViewport(
  functions: FunctionDefinition[],
  size: { width: number; height: number },
  center = 0,
): Viewport | null {
  const visible = functions.filter((fn) => fn.visible);
  if (!visible.length || size.width <= 0 || size.height <= 0) return null;
  const targetScale = Math.min(45, size.width / 8, size.height / 6);
  let best: Viewport | null = null;
  for (let half = 5, attempt = 0; attempt < 16; half *= 0.7, attempt++) {
    const bounds = visible.flatMap((fn) => {
      const points = Array.from({ length: 401 }, (_, index) =>
        pointAt(fn, center - half + (2 * half * index) / 400),
      ).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!points.length) return [];
      const xs = points.map((p) => p.x).sort((a, b) => a - b);
      const ys = points.map((p) => p.y).sort((a, b) => a - b);
      // Trim each curve independently, so a pole cannot flatten every other
      // curve and a small-amplitude function still contributes to the bounds.
      const trim = Math.floor(points.length * 0.05);
      return [
        {
          xmin: xs[trim],
          xmax: xs[xs.length - 1 - trim],
          ymin: ys[trim],
          ymax: ys[ys.length - 1 - trim],
        },
      ];
    });
    if (!bounds.length) continue;
    const xmin = Math.min(...bounds.map((b) => b.xmin));
    const xmax = Math.max(...bounds.map((b) => b.xmax));
    const ymin = Math.min(...bounds.map((b) => b.ymin));
    const ymax = Math.max(...bounds.map((b) => b.ymax));
    const scale = Math.min(
      size.width / Math.max(2, xmax - xmin) / 1.2,
      size.height / Math.max(2, ymax - ymin) / 1.2,
      100000,
    );
    const candidate = {
      cx: xmin / 2 + xmax / 2,
      cy: ymin / 2 + ymax / 2,
      scale: Math.max(1e-12, scale),
    };
    if (!Object.values(candidate).every(Number.isFinite)) continue;
    // A narrower probe can approach a pole; never replace a better camera.
    if (!best || candidate.scale > best.scale) best = candidate;
    if (candidate.scale >= targetScale * 0.8) break;
  }
  return best;
}
