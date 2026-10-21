import type { FunctionDefinition } from "../types/function";

export function curveLabelText(fn: FunctionDefinition): string {
  const name =
    fn.kind === "function"
      ? `${fn.alias || "f"}(${fn.variable || "x"})`
      : fn.alias || fn.name;
  if (fn.kind !== "function" || fn.currentExpression.length > 24) return name;
  const formula = fn.currentExpression
    .replace(/\^([23])\b(?!\.)/g, (_, power: string) =>
      power === "2" ? "²" : "³",
    )
    .replace(/\bpi\b/g, "π")
    .replaceAll("*", "·");
  return `${name} = ${formula}`;
}
