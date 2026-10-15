import { prepareExpression } from "./expressionParser";
import type {
  FunctionDefinition,
  TransformOperation,
  Domain,
} from "../types/function";
import { ALL_DOMAIN } from "../types/function";
import { formatExpression } from "../utils/formatExpression";
export const colors = [
  "#4263eb",
  "#d86746",
  "#169b86",
  "#a36cce",
  "#cb9b25",
  "#d24c87",
  "#54899a",
];
export function makeFunction(
  expression: string,
  index = 0,
): FunctionDefinition {
  const prepared = prepareExpression(expression);
  return {
    variable: prepared.variable,
    parameters: prepared.parameters,
    alias: prepared.name ?? String.fromCharCode(102 + (index % 15)),
    id: crypto.randomUUID(),
    name: `${prepared.name ?? String.fromCharCode(102 + (index % 15))}(${prepared.variable})`,
    originalExpression: prepared.expression,
    currentExpression: prepared.expression,
    color: colors[index % colors.length],
    visible: true,
    locked: false,
    domain: { ...ALL_DOMAIN },
    lineStyle: "solid",
    kind: "function",
    transformHistory: [],
  };
}
export function derived(
  fn: FunctionDefinition,
  expression: string,
  label: string,
  rule: string,
  explanation: string,
  domain: Domain = fn.domain,
): FunctionDefinition {
  const formattedExpression = formatExpression(expression);
  const operation: TransformOperation = {
    label,
    rule,
    explanation,
    from: fn.currentExpression,
    to: formattedExpression,
  };
  return {
    ...fn,
    id: crypto.randomUUID(),
    currentExpression: formattedExpression,
    visible: true,
    locked: false,
    kind: "function",
    source: undefined,
    reflection: undefined,
    alias: undefined,
    originalExpression: fn.originalExpression,
    name: label,
    parentFunctionId: fn.id,
    domain: { ...domain },
    domainConstraints: fn.domainConstraints?.map((c) => ({
      ...c,
      domain: { ...c.domain },
    })),
    differentiabilityChecks: fn.differentiabilityChecks?.map((c) => ({ ...c })),
    transformHistory: [...fn.transformHistory, operation],
  };
}
function mapDomain(d: Domain, a: number, b: number): Domain {
  if (a > 0)
    return { ...d, min: (d.min - b) / a + 0, max: (d.max - b) / a + 0 };
  return {
    min: (d.max - b) / a + 0,
    max: (d.min - b) / a + 0,
    minInclusive: d.maxInclusive,
    maxInclusive: d.minInclusive,
  };
}
function substitute(e: string, x: string, variable: string) {
  return e.replace(new RegExp(`\\b${variable}\\b`, "g"), `(${x})`);
}
export function transform(
  fn: FunctionDefinition,
  kind: string,
  a = 0,
  b = 0,
): FunctionDefinition {
  if (![a, b].every(Number.isFinite))
    throw new Error("变换参数必须是有限实数。");
  if (fn.kind === "relation")
    throw new Error("镜像关系请使用直线对称工具；显函数变换需要选择一个函数。");
  const e = fn.currentExpression;
  const variable = fn.variable ?? "x";
  const sub = (expression: string, argument: string) =>
    substitute(expression, argument.replace(/\bx\b/g, variable), variable);
  const withMap = (out: FunctionDefinition, map: string) => ({
    ...out,
    domainConstraints: fn.domainConstraints?.map((c) => ({
      ...c,
      expression: sub(c.expression, map),
    })),
    differentiabilityChecks: fn.differentiabilityChecks?.map((c) => ({
      ...c,
      argument: sub(c.argument, map),
    })),
  });
  switch (kind) {
    case "y":
      return withMap(
        derived(
          fn,
          sub(e, "-x"),
          "关于 Y 轴对称",
          "x → -x",
          "左右翻折；偶函数的图像保持不变。",
          mapDomain(fn.domain, -1, 0),
        ),
        "-x",
      );
    case "x":
      return derived(fn, `-(${e})`, "关于 X 轴对称", "y → -y", "上下翻折。");
    case "origin":
      return withMap(
        derived(
          fn,
          `-(${sub(e, "-x")})`,
          "关于原点对称",
          "(x,y) → (-x,-y)",
          "旋转 180°；奇函数的图像保持不变。",
          mapDomain(fn.domain, -1, 0),
        ),
        "-x",
      );
    case "translate":
      return withMap(
        derived(
          fn,
          `(${sub(e, `x-(${a})`)})+(${b})`,
          "平移",
          `f(x-(${a}))+(${b})`,
          `横向${a >= 0 ? "右" : "左"}移 ${Math.abs(a)}，纵向${b >= 0 ? "上" : "下"}移 ${Math.abs(b)}。`,
          mapDomain(fn.domain, 1, -a),
        ),
        `x-(${a})`,
      );
    case "scale":
      if (b === 0) throw new Error("横向系数 B 不能为 0。");
      return withMap(
        derived(
          fn,
          `(${a})*(${sub(e, `${b}*x`)})`,
          "伸缩",
          `${a}·f(${b}x)`,
          `纵向乘 ${a}，横向长度乘 ${1 / Math.abs(b)}${a < 0 ? "，上下翻折" : ""}${b < 0 ? "，左右翻折" : ""}。`,
          mapDomain(fn.domain, b, 0),
        ),
        `${b}*x`,
      );
    case "absY":
      return derived(
        fn,
        `abs(${e})`,
        "|f(x)|",
        "y → |y|",
        "X 轴下方部分翻折到上方。",
      );
    case "negAbs":
      return derived(
        fn,
        `-abs(${e})`,
        "−|f(x)|",
        "y → −|y|",
        "图像全部位于 X 轴下方。",
      );
    case "absX":
    case "absBoth": {
      if (fn.domain.max < 0 || (fn.domain.max === 0 && !fn.domain.maxInclusive))
        throw new Error("原函数定义域没有非负部分，无法构造 f(|x|)。");
      const r = Math.max(0, fn.domain.max);
      const expr = sub(e, "abs(x)");
      const out = withMap(
        derived(
          fn,
          kind === "absBoth" ? `abs(${expr})` : expr,
          kind === "absBoth" ? "|f(|x|)|" : "f(|x|)",
          "x → |x|",
          "保留右半部分，关于 Y 轴复制到左侧。",
          {
            min: -r,
            max: r,
            minInclusive: fn.domain.maxInclusive,
            maxInclusive: fn.domain.maxInclusive,
          },
        ),
        "abs(x)",
      );
      out.domainConstraints = [
        ...(out.domainConstraints || []),
        { expression: `abs(${variable})`, domain: { ...fn.domain } },
      ];
      return out;
    }
    default:
      throw new Error("未知变换");
  }
}
export function reflect(
  fn: FunctionDefinition,
  a: number,
  b: number,
  c: number,
): FunctionDefinition {
  if (![a, b, c].every(Number.isFinite) || a * a + b * b === 0)
    throw new Error("直线系数 A、B 不能同时为 0。");
  const out = derived(
    fn,
    `镜像关系：${a}x + ${b}y + ${c} = 0`,
    "直线镜像",
    `关于 ${a}x + ${b}y + ${c} = 0 对称`,
    "每个点沿直线的法向等距反射；镜像未必是显函数。",
  );
  return { ...out, kind: "relation", source: fn, reflection: { a, b, c } };
}
