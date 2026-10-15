import { colors } from "../services/transformEngine";
import type { FunctionDefinition } from "../types/function";
export function chooseFunctionColor(functions: FunctionDefinition[]): string {
  const used = new Set(functions.map((f) => f.color.toLowerCase()));
  const preset = colors.find((c) => !used.has(c));
  if (preset) return preset;
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const existing = [...used].map(rgb);
  let best = "#4263eb",
    score = -1;
  for (let i = 0; i < 180; i++) {
    const hue = (i * 137.50776405) % 360,
      c = 0.54,
      x = c * (1 - Math.abs(((hue / 60) % 2) - 1)),
      m = 0.2;
    const values =
      hue < 60
        ? [c, x, 0]
        : hue < 120
          ? [x, c, 0]
          : hue < 180
            ? [0, c, x]
            : hue < 240
              ? [0, x, c]
              : hue < 300
                ? [x, 0, c]
                : [c, 0, x];
    const candidate =
      "#" +
      values
        .map((v) =>
          Math.round((v + m) * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
    if (used.has(candidate)) continue;
    const value = rgb(candidate),
      distance = Math.min(
        ...existing.map((v) => Math.hypot(...v.map((n, j) => n - value[j]))),
      );
    if (distance > score) {
      score = distance;
      best = candidate;
    }
  }
  return best;
}
