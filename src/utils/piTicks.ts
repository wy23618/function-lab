import type { FunctionDefinition } from "../types/function";
export type AxisLabelMode = "auto" | "numeric" | "pi";
export type PiStep = { step: number; numerator: number; denominator: number };
export function piTickStep(scale: number): PiStep {
  const target = Math.max(70 / scale, scale < 100 ? Math.PI : 0);
  const candidates: PiStep[] = [];
  for (let power = 0; power <= 7; power++)
    for (const d of [1, 2, 4, 6, 12]) {
      const denominator = d * 10 ** power;
      candidates.push({
        step: Math.PI / denominator,
        numerator: 1,
        denominator,
      });
    }
  for (let power = 0; power <= 15; power++)
    for (const n of [1, 2, 4, 5, 6, 10]) {
      const numerator = n * 10 ** power;
      candidates.push({ step: Math.PI * numerator, numerator, denominator: 1 });
    }
  return (
    candidates
      .filter((item) => item.step >= target * (1 - 1e-12))
      .sort((a, b) => a.step - b.step)[0] || candidates.at(-1)!
  );
}
export function formatPiTick(index: number, step: PiStep): string {
  let numerator = Math.round(index) * step.numerator,
    denominator = step.denominator;
  if (numerator === 0) return "0";
  const negative = numerator < 0;
  numerator = Math.abs(numerator);
  let a = numerator,
    b = denominator;
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  numerator /= a;
  denominator /= a;
  return `${negative ? "−" : ""}${numerator === 1 ? "" : numerator}π${denominator === 1 ? "" : `/${denominator}`}`;
}
export function piAxisUsage(
  functions: FunctionDefinition[],
  mode: AxisLabelMode,
): { x: boolean; y: boolean } {
  if (mode === "pi") return { x: true, y: true };
  if (mode === "numeric") return { x: false, y: false };
  const visited = new Set<FunctionDefinition>();
  let x = false,
    y = false;
  const inspect = (fn: FunctionDefinition, depth = 0) => {
    if (visited.has(fn) || depth > 20) return;
    visited.add(fn);
    const expression = fn.currentExpression + " " + fn.originalExpression;
    if (/\bpi\b|π|\b(?:sin|cos|tan|asin|acos|atan)\s*\(/i.test(expression))
      x = true;
    if (/\b(?:asin|acos|atan)\s*\(/i.test(expression)) y = true;
    Object.values(fn.bindings || {}).forEach((source) =>
      inspect(source, depth + 1),
    );
    if (fn.source) inspect(fn.source, depth + 1);
  };
  functions.filter((fn) => fn.visible).forEach((fn) => inspect(fn));
  return { x, y };
}
