/** Two-sided, convergent numerical slope. Rejects cusps and vertical tangents. */
export function estimateSlope(
  evaluate: (x: number) => number,
  x: number,
): number {
  const center = evaluate(x);
  if (!Number.isFinite(center)) return NaN;
  let h = Math.max(1, Math.abs(x)) * 1e-5,
    previous = NaN;
  const minStep = Number.EPSILON * Math.max(1, Math.abs(x)) * 16;
  for (let attempt = 0; attempt < 32 && h >= minStep; attempt++, h /= 2) {
    const left = evaluate(x - h),
      right = evaluate(x + h);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      previous = NaN;
      continue;
    }
    const ls = (center - left) / h,
      rs = (right - center) / h,
      central = (right - left) / (2 * h);
    const symmetric =
      Math.abs(ls - rs) <= 1e-4 * (1 + Math.abs(ls) + Math.abs(rs));
    const converged =
      Number.isFinite(previous) &&
      Math.abs(central - previous) <= 1e-6 * (1 + Math.abs(central));
    if (symmetric && converged && Number.isFinite(central)) return central;
    previous = central;
  }
  return NaN;
}
