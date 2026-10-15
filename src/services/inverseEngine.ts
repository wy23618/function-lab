import { parse } from "mathjs";
import type { MathNode } from "mathjs";
import { ALL_DOMAIN } from "../types/function";
import type { Domain, FunctionDefinition } from "../types/function";
import { canonicalExpression } from "./functionContext";
import { evaluateFunction } from "./functionSampler";
import { formatExpression } from "../utils/formatExpression";

export interface InverseResult {
  expression?: string;
  domain?: Domain;
  reason: string;
  valid: boolean;
}
function affine(node: MathNode): [number, number] | null {
  const n = node as MathNode & {
    content?: MathNode;
    name?: string;
    value?: number;
    op?: string;
    args?: MathNode[];
  };
  if (n.type === "ParenthesisNode" && n.content) return affine(n.content);
  if (n.type === "SymbolNode")
    return n.name === "x"
      ? [1, 0]
      : n.name === "pi"
        ? [0, Math.PI]
        : n.name === "e"
          ? [0, Math.E]
          : null;
  if (n.type === "ConstantNode")
    return typeof n.value === "number" ? [0, n.value] : null;
  if (n.type !== "OperatorNode" || !n.args) return null;
  const a = affine(n.args[0]),
    b = n.args[1] ? affine(n.args[1]) : null;
  if (!a) return null;
  if (n.args.length === 1)
    return n.op === "-" ? [-a[0], -a[1]] : n.op === "+" ? a : null;
  if (!b) return null;
  if (n.op === "+") return [a[0] + b[0], a[1] + b[1]];
  if (n.op === "-") return [a[0] - b[0], a[1] - b[1]];
  if (n.op === "*" && (a[0] === 0 || b[0] === 0))
    return [a[0] * b[1] + b[0] * a[1], a[1] * b[1]];
  if (n.op === "/" && b[0] === 0 && b[1] !== 0)
    return [a[0] / b[1], a[1] / b[1]];
  return null;
}
interface BaseForm {
  base: string;
  input: [number, number];
  output: [number, number];
}
function baseForm(node: MathNode): BaseForm | null {
  const n = node as MathNode & {
    content?: MathNode;
    fn?: MathNode & { name?: string };
    op?: string;
    args?: MathNode[];
  };
  if (n.type === "ParenthesisNode" && n.content) return baseForm(n.content);
  if (
    n.type === "FunctionNode" &&
    n.args?.length === 1 &&
    [
      "exp",
      "log",
      "sqrt",
      "sinh",
      "atan",
      "sin",
      "cos",
      "tan",
      "asin",
      "acos",
    ].includes(n.fn?.name ?? "")
  ) {
    const input = affine(n.args[0]);
    return input ? { base: `${n.fn?.name}(x)`, input, output: [1, 0] } : null;
  }
  if (n.type === "OperatorNode" && n.op === "^" && n.args) {
    const input = affine(n.args[0]),
      exponent = affine(n.args[1]);
    if (input && exponent?.[0] === 0 && [2, 3].includes(exponent[1]))
      return { base: `x^${exponent[1]}`, input, output: [1, 0] };
    const base = affine(n.args[0]),
      argument = affine(n.args[1]);
    if (base?.[0] === 0 && base[1] === Math.E && argument)
      return { base: "exp(x)", input: argument, output: [1, 0] };
  }
  if (n.type !== "OperatorNode" || !n.args) return null;
  if (n.args.length === 1) {
    const form = baseForm(n.args[0]);
    if (form && n.op === "-")
      return { ...form, output: [-form.output[0], -form.output[1]] };
    return n.op === "+" ? form : null;
  }
  const left = baseForm(n.args[0]),
    right = baseForm(n.args[1]),
    lc = affine(n.args[0]),
    rc = affine(n.args[1]);
  const constantLeft = lc?.[0] === 0 ? lc[1] : undefined,
    constantRight = rc?.[0] === 0 ? rc[1] : undefined;
  if (left && constantRight !== undefined) {
    const [a, d] = left.output;
    if (n.op === "+") return { ...left, output: [a, d + constantRight] };
    if (n.op === "-") return { ...left, output: [a, d - constantRight] };
    if (n.op === "*")
      return { ...left, output: [a * constantRight, d * constantRight] };
    if (n.op === "/" && constantRight !== 0)
      return { ...left, output: [a / constantRight, d / constantRight] };
  }
  if (right && constantLeft !== undefined) {
    const [a, d] = right.output;
    if (n.op === "+") return { ...right, output: [a, d + constantLeft] };
    if (n.op === "-") return { ...right, output: [-a, constantLeft - d] };
    if (n.op === "*")
      return { ...right, output: [a * constantLeft, d * constantLeft] };
  }
  return null;
}
function mapDomain(domain: Domain, a: number, b: number): Domain {
  return a > 0
    ? {
        min: a * domain.min + b,
        max: a * domain.max + b,
        minInclusive: domain.minInclusive,
        maxInclusive: domain.maxInclusive,
      }
    : {
        min: a * domain.max + b,
        max: a * domain.min + b,
        minInclusive: domain.maxInclusive,
        maxInclusive: domain.minInclusive,
      };
}
export function createInverse(original: FunctionDefinition): InverseResult {
  const restricted = (f: FunctionDefinition, depth = 0): boolean =>
    depth > 20 ||
    !!f.domainConstraints?.length ||
    !!f.differentiabilityChecks?.length ||
    f.domain.min !== -Infinity ||
    f.domain.max !== Infinity ||
    Object.values(f.bindings ?? {}).some((binding) =>
      restricted(binding, depth + 1),
    );
  if (
    Object.values(original.bindings ?? {}).some((binding) =>
      restricted(binding),
    )
  )
    return {
      valid: false,
      reason:
        "复合函数引用了受限定义域；暂无法完整证明反函数定义域，请查看关于 y=x 的对称关系。",
    };
  try {
    const fn = {
      ...original,
      currentExpression: canonicalExpression(original),
      variable: "x",
      parameters: {},
      bindings: {},
    };
    const result = canonicalInverse(fn);
    return {
      ...result,
      expression: result.expression
        ? formatExpression(
            result.expression.replace(/\bx\b/g, original.variable ?? "x"),
          )
        : undefined,
    };
  } catch {
    return { valid: false, reason: "表达式无效。" };
  }
}
function canonicalInverse(fn: FunctionDefinition): InverseResult {
  if (fn.kind !== "function")
    return {
      valid: false,
      reason: "当前对象是关系，无法作为单值函数求反函数。",
    };
  if (fn.domainConstraints?.length || fn.differentiabilityChecks?.length)
    return {
      valid: false,
      reason:
        "该函数包含变换后的隐含定义域约束，暂无法用单一区间准确表达反函数定义域；请查看关于 y=x 的对称关系。",
    };
  let normalized: string;
  try {
    normalized = fn.currentExpression;
  } catch {
    return { valid: false, reason: "表达式无效。" };
  }
  let compact = normalized.replace(/\s/g, "").replace(/\^\((\d+)\)/g, "^$1");
  let expression: string | undefined,
    increasing = true;
  let natural: Domain = { ...ALL_DOMAIN };
  try {
    const form = baseForm(parse(normalized));
    if (
      form &&
      form.input[0] === 1 &&
      form.input[1] === 0 &&
      form.output[0] === 1 &&
      form.output[1] === 0
    )
      compact = form.base;
    if (
      form &&
      (form.input[0] !== 1 ||
        form.input[1] !== 0 ||
        form.output[0] !== 1 ||
        form.output[1] !== 0)
    ) {
      const [b, c] = form.input,
        [a, d] = form.output;
      if (!a || !b) return { valid: false, reason: "常函数不是一一对应函数。" };
      const baseInverse = canonicalInverse({
        ...fn,
        currentExpression: form.base,
        domain: mapDomain(fn.domain, b, c),
      });
      if (!baseInverse.valid || !baseInverse.expression || !baseInverse.domain)
        return baseInverse;
      return {
        valid: true,
        expression: `((${baseInverse.expression.replace(/\bx\b/g, `((x-(${d}))/(${a}))`)})-(${c}))/(${b})`,
        domain: mapDomain(baseInverse.domain, a, d),
        reason: "已依据基函数及线性变换的完整定义域生成反函数。",
      };
    }
    const linear = affine(parse(normalized));
    if (linear) {
      if (Math.abs(linear[0]) < 1e-14)
        return { valid: false, reason: "常函数不是一一对应函数。" };
      expression = `(x-(${linear[1]}))/(${linear[0]})`;
      increasing = linear[0] > 0;
    } else if (compact === "x^2") {
      if (fn.domain.min >= 0) expression = "sqrt(x)";
      else if (fn.domain.max <= 0) {
        expression = "-sqrt(x)";
        increasing = false;
      } else
        return {
          valid: false,
          reason:
            "x² 在跨越 0 的定义域上不是一一对应；请限制为非负或非正区间。",
        };
    } else if (compact === "x^3") {
      expression = "sign(x)*abs(x)^(1/3)";
    } else if (compact === "exp(x)" || compact === "e^x") {
      expression = "log(x)";
    } else if (compact === "log(x)") {
      expression = "exp(x)";
      natural = {
        min: 0,
        max: Infinity,
        minInclusive: false,
        maxInclusive: false,
      };
    } else if (compact === "sqrt(x)") {
      expression = "x^2";
      natural = {
        min: 0,
        max: Infinity,
        minInclusive: true,
        maxInclusive: false,
      };
    } else if (compact === "sinh(x)") {
      expression = "asinh(x)";
    } else if (compact === "atan(x)") {
      expression = "tan(x)";
    } else if (compact === "asin(x)") {
      expression = "sin(x)";
      natural = { min: -1, max: 1, minInclusive: true, maxInclusive: true };
    } else if (compact === "acos(x)") {
      expression = "cos(x)";
      increasing = false;
      natural = { min: -1, max: 1, minInclusive: true, maxInclusive: true };
    } else if (
      compact === "sin(x)" ||
      compact === "cos(x)" ||
      compact === "tan(x)"
    ) {
      if (!Number.isFinite(fn.domain.min) || !Number.isFinite(fn.domain.max))
        return {
          valid: false,
          reason:
            "周期三角函数在无界定义域上不是一一对应；请限制到一个单调分支。",
        };
      if (fn.domain.min >= fn.domain.max)
        return { valid: false, reason: "当前定义域没有可逆的有效区间。" };
      let branch:
        | { min: number; max: number; increasing: boolean; expression: string }
        | undefined;
      const period = compact === "tan(x)" ? Math.PI : 2 * Math.PI;
      const center = Math.floor(fn.domain.min / period);
      for (let k = center - 1; k <= center + 1 && !branch; k++) {
        const offset = k * period;
        const candidates =
          compact === "sin(x)"
            ? [
                {
                  min: -Math.PI / 2 + offset,
                  max: Math.PI / 2 + offset,
                  increasing: true,
                  expression: `asin(x)+(${offset})`,
                },
                {
                  min: Math.PI / 2 + offset,
                  max: (3 * Math.PI) / 2 + offset,
                  increasing: false,
                  expression: `pi-asin(x)+(${offset})`,
                },
              ]
            : compact === "cos(x)"
              ? [
                  {
                    min: offset,
                    max: Math.PI + offset,
                    increasing: false,
                    expression: `acos(x)+(${offset})`,
                  },
                  {
                    min: -Math.PI + offset,
                    max: offset,
                    increasing: true,
                    expression: `-acos(x)+(${offset})`,
                  },
                ]
              : [
                  {
                    min: -Math.PI / 2 + offset,
                    max: Math.PI / 2 + offset,
                    increasing: true,
                    expression: `atan(x)+(${offset})`,
                  },
                ];
        // Do not absorb a genuine crossing of an extremum into a tolerance.
        branch = candidates.find(
          (candidate) =>
            fn.domain.min >= candidate.min && fn.domain.max <= candidate.max,
        );
      }
      if (!branch)
        return {
          valid: false,
          reason:
            compact === "tan(x)"
              ? "当前区间跨越正切极点，值域可能不连续；暂不能用单一区间准确表达完整反函数，请限制到一个正切分支或查看镜像关系。"
              : "当前定义域跨越三角函数极值，不是一一对应；请限制到一个完整单调分支或其子区间。",
        };
      expression = branch.expression;
      increasing = branch.increasing;
      natural = {
        min: branch.min,
        max: branch.max,
        minInclusive: compact !== "tan(x)",
        maxInclusive: compact !== "tan(x)",
      };
    } else
      return {
        valid: false,
        reason:
          "暂不支持此表达式的符号反函数；可查看关于 y=x 的对称关系。有限视口内的单调采样不能证明全定义域可逆。",
      };
  } catch {
    return { valid: false, reason: "无法解析反函数。" };
  }
  const d: Domain = {
    min: Math.max(fn.domain.min, natural.min),
    max: Math.min(fn.domain.max, natural.max),
    minInclusive:
      fn.domain.min === natural.min
        ? fn.domain.minInclusive && natural.minInclusive
        : fn.domain.min > natural.min
          ? fn.domain.minInclusive
          : natural.minInclusive,
    maxInclusive:
      fn.domain.max === natural.max
        ? fn.domain.maxInclusive && natural.maxInclusive
        : fn.domain.max < natural.max
          ? fn.domain.maxInclusive
          : natural.maxInclusive,
  };
  if (d.min >= d.max)
    return { valid: false, reason: "当前定义域没有可逆的有效区间。" };
  const limit = (x: number, side: "min" | "max"): number => {
    if (Number.isFinite(x)) {
      if (compact === "tan(x)" && x === natural.min) return -Infinity;
      if (compact === "tan(x)" && x === natural.max) return Infinity;
      const evaluated = evaluateFunction(
        { ...fn, domain: { ...d, minInclusive: true, maxInclusive: true } },
        x,
      );
      if (Number.isFinite(evaluated)) return evaluated;
      if (compact === "log(x)" && x === 0) return -Infinity;
      return NaN;
    }
    if (compact === "exp(x)" || compact === "e^x")
      return side === "min" ? 0 : Infinity;
    if (compact === "atan(x)")
      return side === "min" ? -Math.PI / 2 : Math.PI / 2;
    return increasing ? x : -x;
  };
  const low = limit(d.min, "min"),
    high = limit(d.max, "max");
  const domain: Domain = increasing
    ? {
        min: low,
        max: high,
        minInclusive: d.minInclusive && Number.isFinite(low),
        maxInclusive: d.maxInclusive && Number.isFinite(high),
      }
    : {
        min: high,
        max: low,
        minInclusive: d.maxInclusive && Number.isFinite(high),
        maxInclusive: d.minInclusive && Number.isFinite(low),
      };
  if (Number.isNaN(low) || Number.isNaN(high))
    return { valid: false, reason: "定义域端点无法确认，未生成反函数。" };
  return {
    valid: true,
    expression,
    domain,
    reason:
      "已根据函数形式与完整定义域确认一一对应，反函数定义域等于原函数值域。",
  };
}
