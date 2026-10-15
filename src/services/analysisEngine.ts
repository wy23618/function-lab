import { canonicalExpression } from "./functionContext";
import { estimateSlope } from "./numericalDerivative";
import type { FunctionDefinition, GraphPoint } from "../types/function";
import { evaluateFunction } from "./functionSampler";
import { derivative, parse, simplify } from "mathjs";
import type { MathNode } from "mathjs";
import { compileExpression } from "./expressionParser";

function zeros(
  evaluate: (x: number) => number,
  min: number,
  max: number,
): GraphPoint[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return [];
  const probes = Array.from({ length: 19 }, (_, i) =>
    evaluate(min + ((max - min) * (i + 0.38196601125)) / 19),
  );
  if (
    probes.filter(Number.isFinite).length >= 3 &&
    probes.every((v) => !Number.isFinite(v) || v === 0)
  )
    return [];
  const result: GraphPoint[] = [];
  const count = 2400,
    step = (max - min) / count;
  const add = (x: number) => {
    const y = evaluate(x);
    if (
      y === 0 &&
      (evaluate(x - step / 100) === 0 || evaluate(x + step / 100) === 0)
    )
      return;
    if (
      Number.isFinite(y) &&
      Math.abs(y) < 1e-7 &&
      !result.some((p) => Math.abs(p.x - x) < 1e-5)
    )
      result.push({ x, y: 0 });
  };
  let px = min,
    py = evaluate(min);
  for (let i = 1; i <= count; i++) {
    const x = min + i * step,
      y = evaluate(x);
    if (
      Math.abs(py) < 1e-9 &&
      !(py === 0 && y === 0 && evaluate(px - step) === 0)
    )
      add(px);
    if (Number.isFinite(py) && Number.isFinite(y) && py * y < 0) {
      let lo = px,
        hi = x,
        flo = py;
      for (let j = 0; j < 55; j++) {
        const mid = (lo + hi) / 2,
          fm = evaluate(mid);
        if (!Number.isFinite(fm)) break;
        if (flo * fm <= 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      add((lo + hi) / 2);
    }
    // Even-multiplicity zeros do not change sign: minimize |f| around local minima.
    if (i > 1 && Number.isFinite(y) && Number.isFinite(py)) {
      const left = evaluate(px - step);
      if (Math.abs(py) < Math.abs(left) && Math.abs(py) < Math.abs(y)) {
        let lo = px - step,
          hi = x;
        for (let j = 0; j < 45; j++) {
          const a = lo + (hi - lo) / 3,
            b = hi - (hi - lo) / 3;
          if (Math.abs(evaluate(a)) < Math.abs(evaluate(b))) hi = b;
          else lo = a;
        }
        add((lo + hi) / 2);
      }
    }
    px = x;
    py = y;
  }
  add(max);
  return result.sort((a, b) => a.x - b.x);
}
export function roots(
  fn: FunctionDefinition,
  min: number,
  max: number,
): GraphPoint[] {
  return zeros((x) => evaluateFunction(fn, x), min, max);
}
export function coincidentFunctions(
  a: FunctionDefinition,
  b: FunctionDefinition,
): boolean {
  try {
    return (
      simplify(
        `(${canonicalExpression(a)})-(${canonicalExpression(b)})`,
      ).toString() === "0"
    );
  } catch {
    return false;
  }
}
export function intersections(
  a: FunctionDefinition,
  b: FunctionDefinition,
  min: number,
  max: number,
): GraphPoint[] {
  if (coincidentFunctions(a, b)) return [];
  return zeros(
    (x) => evaluateFunction(a, x) - evaluateFunction(b, x),
    min,
    max,
  ).map((p) => ({ x: p.x, y: evaluateFunction(a, p.x) }));
}
export function derivativeExpression(fn: FunctionDefinition): string {
  if (fn.kind !== "function") throw new Error("关系不能直接求显函数导数。");
  try {
    const expression = derivative(
      canonicalExpression(fn, 0, false, fn.variable ?? "x"),
      fn.variable ?? "x",
    ).toString();
    compileExpression(expression, {
      variable: fn.variable ?? "x",
      parameters: fn.parameters,
    });
    return expression;
  } catch {
    throw new Error(
      "暂无法生成此表达式的符号导数；可通过切点斜率进行局部数值分析。",
    );
  }
}
type Parity = "even" | "odd" | "both" | "unknown";
function symbolicParity(node: MathNode): Parity {
  const n = node as MathNode & {
    content?: MathNode;
    name?: string;
    value?: number;
    op?: string;
    fn?: MathNode & { name?: string };
    args?: MathNode[];
  };
  if (n.type === "ParenthesisNode" && n.content)
    return symbolicParity(n.content);
  if (n.type === "ConstantNode") return n.value === 0 ? "both" : "even";
  if (n.type === "SymbolNode")
    return n.name === "x"
      ? "odd"
      : ["e", "pi"].includes(n.name ?? "")
        ? "even"
        : "unknown";
  if (!n.args) return "unknown";
  const a = symbolicParity(n.args[0]),
    b = n.args[1] ? symbolicParity(n.args[1]) : undefined;
  if (n.type === "OperatorNode") {
    if (n.args.length === 1) return a;
    if (n.op === "+" || n.op === "-")
      return a === "both"
        ? (b ?? "unknown")
        : b === "both"
          ? a
          : a === b
            ? a
            : "unknown";
    if (n.op === "*" || n.op === "/") {
      if (a === "both" || b === "both") return "both";
      if (a === "unknown" || b === "unknown") return "unknown";
      return a === b ? "even" : "odd";
    }
    if (n.op === "^") {
      try {
        if (b !== "even") return "unknown";
        if (a === "even" || a === "both") return a;
        if (/\bx\b/.test(n.args[1].toString())) return "unknown";
        const exponent = compileExpression(n.args[1].toString())(0);
        if (a === "odd" && Number.isInteger(exponent))
          return exponent % 2 === 0 ? "even" : "odd";
      } catch {
        return "unknown";
      }
    }
  }
  if (n.type === "FunctionNode") {
    if (a === "even" || a === "both") return "even";
    const name = n.fn?.name ?? "";
    if (a === "odd" && ["cos", "cosh", "abs"].includes(name)) return "even";
    if (
      a === "odd" &&
      ["sin", "tan", "sinh", "tanh", "asin", "atan", "asinh", "sign"].includes(
        name,
      )
    )
      return "odd";
  }
  return "unknown";
}
export function slope(fn: FunctionDefinition, x: number): number {
  return estimateSlope((z) => evaluateFunction(fn, z), x);
}
export function parity(fn: FunctionDefinition): {
  kind: string;
  explanation: string;
} {
  const d = fn.domain;
  if (d.min !== -d.max || d.minInclusive !== d.maxInclusive)
    return {
      kind: "非奇非偶",
      explanation: "定义域不关于原点对称，因此既不是奇函数也不是偶函数。",
    };
  let even = true,
    odd = true,
    checked = 0;
  const span = Number.isFinite(d.max) ? d.max : 16;
  for (let i = 0; i <= 80; i++) {
    const x = span * (i === 0 ? 0 : (i - 0.38196601125) / 80),
      a = evaluateFunction(fn, x),
      b = evaluateFunction(fn, -x);
    if (Number.isFinite(a) !== Number.isFinite(b))
      return { kind: "非奇非偶", explanation: "实数定义域不关于原点对称。" };
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    checked++;
    const tolerance = 1e-7 * (1 + Math.abs(a) + Math.abs(b));
    even &&= Math.abs(a - b) <= tolerance;
    odd &&= Math.abs(a + b) <= tolerance;
  }
  if (checked < 3)
    return { kind: "无法判断", explanation: "有效采样不足，无法判断奇偶性。" };
  let symbolic: Parity = "unknown";
  try {
    symbolic = symbolicParity(simplify(parse(canonicalExpression(fn))));
  } catch {
    /* sampling fallback */
  }
  const kind =
    symbolic === "both"
      ? "既奇又偶"
      : symbolic === "even" && even
        ? "偶函数"
        : symbolic === "odd" && odd
          ? "奇函数"
          : even && odd
            ? "数值上既奇又偶"
            : even
              ? "数值上为偶函数"
              : odd
                ? "数值上为奇函数"
                : "非奇非偶";
  return {
    kind,
    explanation:
      symbolic !== "unknown"
        ? "表达式结构符合奇偶性规则；已用对称采样检查有效实数定义域，复杂隐含定义域仍需人工核对。"
        : "根据对称采样进行数值判断；结果不是全定义域上的符号证明。",
  };
}
