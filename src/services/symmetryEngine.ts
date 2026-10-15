import { parse } from "mathjs";
import type { MathNode } from "mathjs";
import type { GraphPoint } from "../types/function";
type Coefficients = [number, number, number];
function coefficients(node: MathNode): Coefficients {
  const n = node as MathNode & {
    content?: MathNode;
    value?: number;
    name?: string;
    args?: MathNode[];
    op?: string;
  };
  if (n.type === "ParenthesisNode" && n.content) return coefficients(n.content);
  if (n.type === "ConstantNode" && typeof n.value === "number")
    return [0, 0, n.value];
  if (n.type === "SymbolNode") {
    if (n.name === "x") return [1, 0, 0];
    if (n.name === "y") return [0, 1, 0];
    if (n.name === "pi") return [0, 0, Math.PI];
    if (n.name === "e") return [0, 0, Math.E];
  }
  if (n.type === "OperatorNode" && n.args) {
    const a = coefficients(n.args[0]);
    if (n.args.length === 1) {
      if (n.op === "-") return a.map((v) => -v) as Coefficients;
      if (n.op === "+") return a;
    }
    const b = n.args[1] ? coefficients(n.args[1]) : null;
    if (b) {
      if (n.op === "+") return a.map((v, i) => v + b[i]) as Coefficients;
      if (n.op === "-") return a.map((v, i) => v - b[i]) as Coefficients;
      if (n.op === "*") {
        if (a[0] === 0 && a[1] === 0)
          return b.map((v) => v * a[2]) as Coefficients;
        if (b[0] === 0 && b[1] === 0)
          return a.map((v) => v * b[2]) as Coefficients;
      }
      if (n.op === "/" && b[0] === 0 && b[1] === 0 && b[2] !== 0)
        return a.map((v) => v / b[2]) as Coefficients;
    }
  }
  throw new Error("请输入直线方程，例如 x=2、y=3、y=2x+1 或 2x+y-3=0。");
}
export function parseReflectionLine(input: string): {
  a: number;
  b: number;
  c: number;
} {
  const parts = input
    .replace(/π/g, "pi")
    .replace(/[−–]/g, "-")
    .replace(/[×·]/g, "*")
    .split("=");
  if (parts.length !== 2) throw new Error("直线方程应包含一个等号。");
  try {
    const [a, b, c] = coefficients(parse(`(${parts[0]})-(${parts[1]})`));
    if (![a, b, c].every(Number.isFinite) || a * a + b * b === 0)
      throw new Error();
    return { a, b, c };
  } catch {
    throw new Error("请输入有效直线：x=2、y=3、y=2x+1 或 2x+y-3=0。");
  }
}
export function reflectPoint(
  point: GraphPoint,
  line: { a: number; b: number; c: number },
): GraphPoint {
  const { a, b, c } = line,
    n = a * a + b * b;
  if (![a, b, c].every(Number.isFinite) || !n)
    throw new Error("直线系数无效。");
  const d = (a * point.x + b * point.y + c) / n;
  return { x: point.x - 2 * a * d, y: point.y - 2 * b * d };
}
