import type { GraphPoint } from "../types/function";
export function pointLabel(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
export function nextPointLabel(points: GraphPoint[]): string {
  const used = new Set(
    points.map((p, i) => (p.label || pointLabel(i)).replace(/′+$/, "")),
  );
  for (let i = 0; i <= points.length; i++) {
    const name = pointLabel(i);
    if (!used.has(name)) return name;
  }
  return pointLabel(points.length);
}
