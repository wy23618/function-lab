import type { FunctionDefinition, GraphPoint } from "../types/function";
import { derivativeExpression } from "./analysisEngine";
import { derived } from "./transformEngine";
import { evaluateFunction } from "./functionSampler";
import { compileExpression, prepareExpression } from "./expressionParser";

export type Integrand = ((x: number) => number) & { reciprocalSine?: boolean };
export function functionIntegrand(source?: FunctionDefinition): Integrand {
  const f: Integrand = (x) => (source ? evaluateFunction(source, x) : NaN);
  // This supported model has a controlled oscillatory tail. Do not apply the
  // shortcut to a restricted domain, transformed curve or arbitrary oscillator.
  f.reciprocalSine =
    !!source &&
    source.currentExpression.replace(/\s/g, "") ===
      `sin(1/${source.variable || "x"})` &&
    source.domain.min === -Infinity &&
    source.domain.max === Infinity &&
    !source.domainConstraints?.length &&
    !source.differentiabilityChecks?.length;
  return f;
}

/** H(x)=int_0^x sin(1/t)dt. The oscillatory tail uses 12 integrations by parts;
 * at z>=32 its remainder is bounded by 13!/z^14 (<6e-12). */
function reciprocalSinePrimitive(x: number): number {
  if (x === 0) return 0;
  const start = 1 / Math.abs(x),
    z = Math.max(32, start);
  if (!Number.isFinite(z)) return 0;
  let coefficient = 1 / z ** 2,
    tail = 0;
  for (let k = 0; k < 12; k++) {
    tail +=
      (Math.floor(k / 2) % 2 ? -1 : 1) *
      coefficient *
      (k % 2 ? Math.sin(z) : Math.cos(z));
    coefficient *= (k + 2) / z;
  }
  if (start >= 32) return tail;
  const q = quadrature((u) => Math.sin(u) / u ** 2, start, 32, 1e-9);
  return q.reliable ? q.value + tail : NaN;
}

export function constantValue(text: string, infinite = false): number {
  const raw = text.trim().replaceAll("∞", "Infinity");
  if (infinite && /^[+]?Infinity$/i.test(raw)) return Infinity;
  if (infinite && /^-Infinity$/i.test(raw)) return -Infinity;
  const prepared = prepareExpression(raw);
  if (
    Object.keys(prepared.parameters).length ||
    (/[A-Za-z]/.test(prepared.variable) &&
      new RegExp(`\\b${prepared.variable}\\b`).test(prepared.expression))
  )
    throw new Error("请输入常数，例如 0、pi/2 或 -2。");
  const value = compileExpression(raw)(0);
  if (!Number.isFinite(value))
    throw new Error("端点必须是实数；反常积分可用 ±∞。");
  return value;
}

export function derivativeChain(
  source: FunctionDefinition,
  order: number,
): FunctionDefinition[] {
  if (!Number.isInteger(order) || order < 1 || order > 12)
    throw new Error("请选择 1–12 阶导数。");
  const chain: FunctionDefinition[] = [];
  let previous = source;
  for (let i = 1; i <= order; i++) {
    const expression = derivativeExpression(previous);
    if (expression.length > 3000)
      throw new Error("高阶导数过于复杂，请降低阶数。");
    const next = derived(
      previous,
      expression,
      `${i} 阶导函数`,
      `d^${i}/dx^${i}`,
      "逐阶求符号导数，保留来源函数的可导性约束。",
    );
    next.differentiabilityChecks = [
      ...(previous.differentiabilityChecks || []),
      {
        expression: previous.currentExpression,
        argument: previous.variable || "x",
        source: { ...previous, differentiabilityChecks: undefined },
      },
    ];
    next.alias = `d${i}`;
    next.color = ["#d77739", "#8864c2", "#d34e7b", "#199c91"][(i - 1) % 4];
    chain.push(next);
    previous = next;
  }
  return chain;
}

export function taylorExpansion(
  source: FunctionDefinition,
  center: number,
  order: number,
) {
  if (!Number.isInteger(order) || order < 0 || order > 12)
    throw new Error("泰勒阶数应为 0–12。");
  const value = evaluateFunction(source, center);
  if (!Number.isFinite(value))
    throw new Error("展开点处函数没有有限值，请更换 x₀。");
  const coefficients = [value];
  let factorial = 1;
  for (const [i, fn] of (order
    ? derivativeChain(source, order)
    : []
  ).entries()) {
    if (i >= order) break;
    factorial *= i + 1;
    const coefficient = evaluateFunction(fn, center) / factorial;
    if (!Number.isFinite(coefficient))
      throw new Error(`展开点处 ${i + 1} 阶导数不存在或无法可靠求得。`);
    coefficients.push(coefficient);
  }
  const evaluate = (x: number, degree = order) => {
    let result = 0;
    for (let k = degree; k >= 0; k--)
      result = result * (x - center) + coefficients[k];
    return result;
  };
  const variable = source.variable || "x";
  const shift = center === 0 ? variable : `(${variable}-(${center}))`;
  const expression =
    coefficients
      .flatMap((c, k) =>
        c === 0
          ? []
          : [k === 0 ? `(${c})` : `(${c})*${shift}${k > 1 ? `^${k}` : ""}`],
      )
      .join("+") || "0";
  return { coefficients, evaluate, expression };
}

export type PointBehavior =
  "连续" | "可去间断" | "跳跃间断" | "无穷间断" | "振荡或未确定";
export function pointBehavior(
  f: (x: number) => number,
  x: number,
): { kind: PointBehavior; left: number; right: number; value: number } {
  const scale = Math.max(1, Math.abs(x));
  const sequence = (side: number) =>
    Array.from({ length: 9 }, (_, i) => f(x + side * scale * 10 ** (-i - 2)));
  const ls = sequence(-1),
    rs = sequence(1),
    value = f(x);
  const stable = (v: number[]) =>
    v.slice(-3).every(Number.isFinite) &&
    Math.abs(v[8] - v[7]) < 1e-5 * (1 + Math.abs(v[8])) &&
    Math.abs(v[7] - v[6]) < 1e-4 * (1 + Math.abs(v[8]));
  const left = ls[8],
    right = rs[8];
  const approachesValue = (samples: number[]) => {
    if (!Number.isFinite(value)) return false;
    const residuals = samples.slice(-5).map((sample) => sample - value);
    if (
      residuals.every(
        (residual) => Math.abs(residual) < 1e-6 * (1 + Math.abs(value)),
      )
    )
      return true;
    return (
      residuals.slice(1).every((residual, index) => {
        const contraction = residual / residuals[index];
        return contraction >= 0 && contraction < 0.75;
      }) && Math.abs(residuals[4]) < 1e-3 * (1 + Math.abs(value))
    );
  };
  let kind: PointBehavior = "振荡或未确定";
  if (approachesValue(ls) && approachesValue(rs)) {
    kind = "连续";
  } else if (stable(ls) && stable(rs)) {
    const equal =
      Math.abs(left - right) < 1e-5 * (1 + Math.abs(left) + Math.abs(right));
    kind = !equal
      ? "跳跃间断"
      : Number.isFinite(value) &&
          Math.abs(value - left) < 1e-5 * (1 + Math.abs(left))
        ? "连续"
        : "可去间断";
  } else if (
    [ls, rs].some(
      (v) =>
        (!Number.isFinite(value) &&
          v.every(Number.isFinite) &&
          Math.abs(v[8]) > 2 * Math.max(1, Math.abs(v[0])) &&
          v.slice(1).every((n, i) => Math.abs(n) > Math.abs(v[i]) * 1.001)) ||
        (Math.abs(v[8]) > 1e6 &&
          Math.abs(v[8]) > 10 * Math.max(1, Math.abs(v[3]))),
    )
  )
    kind = "无穷间断";
  return { kind, left, right, value };
}

// Interior Gaussian nodes never use an isolated endpoint's assigned value.
const nodes = [
  0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363,
];
const weights = [
  0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
];
export function quadrature(
  f: (x: number) => number,
  a: number,
  b: number,
  tolerance = 1e-7,
): { value: number; reliable: boolean } {
  let budget = 16000;
  let reliable = true;
  const rule = (l: number, r: number) => {
    let sum = 0;
    const m = l / 2 + r / 2,
      h = (r - l) / 2;
    for (let i = 0; i < 4; i++)
      sum += weights[i] * (f(m - h * nodes[i]) + f(m + h * nodes[i]));
    budget -= 8;
    return sum * h;
  };
  const refine = (
    l: number,
    r: number,
    whole: number,
    tol: number,
    depth: number,
  ): number => {
    const m = l / 2 + r / 2;
    const left = rule(l, m),
      right = rule(m, r),
      total = left + right;
    if (!Number.isFinite(total)) {
      reliable = false;
      return NaN;
    }
    if (
      Math.abs(total - whole) <=
      Math.max(tol * (1 + Math.abs(total)), tolerance / 2000)
    )
      return total;
    if (depth >= 30 || budget <= 0) {
      reliable = false;
      return total;
    }
    return (
      refine(l, m, left, tol / 2, depth + 1) +
      refine(m, r, right, tol / 2, depth + 1)
    );
  };
  if (a === b) return { value: 0, reliable: true };
  const value = refine(a, b, rule(a, b), tolerance, 0);
  return { value, reliable: reliable && Number.isFinite(value) };
}

export interface IntegralResult {
  value: number;
  status: "stable" | "unresolved";
  improper: boolean;
  rows: { step: string; value: number }[];
  pieces: {
    from: number;
    to: number;
    status: "stable" | "unresolved";
    value: number;
  }[];
}
export function integrate(
  f: Integrand,
  from: number,
  to: number,
  breaks: number[] = [],
): IntegralResult {
  if (
    Number.isNaN(from) ||
    Number.isNaN(to) ||
    (from === to && !Number.isFinite(from))
  )
    return {
      value: NaN,
      status: "unresolved",
      improper: true,
      rows: [],
      pieces: [],
    };
  if (from === to)
    return {
      value: 0,
      status: "stable",
      improper: false,
      rows: [],
      pieces: [],
    };
  if (f.reciprocalSine && Number.isFinite(from) && Number.isFinite(to)) {
    const value = reciprocalSinePrimitive(to) - reciprocalSinePrimitive(from);
    const status = Number.isFinite(value) ? "stable" : "unresolved";
    const crossesZero = Math.min(from, to) <= 0 && Math.max(from, to) >= 0;
    return {
      value,
      status,
      improper: crossesZero,
      pieces: [{ from, to, value, status }],
      rows: crossesZero
        ? [{ step: "sin(1/x) 专用振荡尾部估计（12 次分部积分）", value }]
        : [],
    };
  }
  const direction = from < to ? 1 : -1,
    a = Math.min(from, to),
    b = Math.max(from, to);
  const detected: number[] = [];
  if (Number.isFinite(a) && Number.isFinite(b)) {
    for (let i = 1; i < 64; i++) {
      const x = a + ((b - a) * i) / 64;
      if (!Number.isFinite(f(x))) detected.push(x);
    }
    const midpoint = a / 2 + b / 2;
    if (["无穷间断", "振荡或未确定"].includes(pointBehavior(f, midpoint).kind))
      detected.push(midpoint);
  }
  const cuts = [
    a,
    ...new Set(
      [
        ...breaks,
        ...detected,
        ...(!Number.isFinite(a) && !Number.isFinite(b) ? [0] : []),
      ]
        .filter((x) => x > a && x < b && Number.isFinite(x))
        .sort((x, y) => x - y),
    ),
    b,
  ];
  const rows: IntegralResult["rows"] = [];
  let improper = false;
  const pieces: IntegralResult["pieces"] = [];
  for (let i = 1; i < cuts.length; i++) {
    const l = cuts[i - 1],
      r = cuts[i];
    const badL =
      !Number.isFinite(l) ||
      ["无穷间断", "振荡或未确定"].includes(pointBehavior(f, l).kind);
    const badR =
      !Number.isFinite(r) ||
      ["无穷间断", "振荡或未确定"].includes(pointBehavior(f, r).kind);
    const singular = badL || badR;
    improper ||= singular;
    let value = NaN,
      previous = NaN,
      previousDelta = Infinity,
      stableCount = 0,
      status: IntegralResult["status"] = "unresolved";
    if (!singular) {
      const q = quadrature(f, l, r);
      value = q.value;
      if (q.reliable) status = "stable";
    } else {
      for (
        let k = 2;
        k <= (!Number.isFinite(l) || !Number.isFinite(r) ? 18 : 12);
        k++
      ) {
        const eps = 10 ** -k;
        const span = Number.isFinite(l) && Number.isFinite(r) ? r - l : 1;
        const lo = !Number.isFinite(l)
          ? r - 2 ** (k + 2)
          : l + (badL ? eps * span : 0);
        const hi = !Number.isFinite(r)
          ? l + 2 ** (k + 2)
          : r - (badR ? eps * span : 0);
        const panels = [lo, hi];
        // Integrate infinite tails in geometric panels, so a localized mass
        // close to the finite endpoint cannot disappear between Gaussian nodes.
        if (!Number.isFinite(r))
          for (let step = 1; l + step < hi; step *= 2) panels.push(l + step);
        if (!Number.isFinite(l))
          for (let step = 1; r - step > lo; step *= 2) panels.push(r - step);
        panels.sort((x, y) => x - y);
        const values = panels.slice(1).map((end, j) => {
          const start = panels[j],
            mid = (start + end) / 2;
          const left =
            badL && Number.isFinite(l) && j === 0
              ? quadrature(
                  (t) =>
                    f(start + (mid - start) * t ** 4) *
                    4 *
                    (mid - start) *
                    t ** 3,
                  0,
                  1,
                  2e-7,
                )
              : quadrature(f, start, mid, 2e-7);
          const right =
            badR && Number.isFinite(r) && j === panels.length - 2
              ? quadrature(
                  (t) =>
                    f(end - (end - mid) * t ** 4) * 4 * (end - mid) * t ** 3,
                  0,
                  1,
                  2e-7,
                )
              : quadrature(f, mid, end, 2e-7);
          return {
            value: left.value + right.value,
            reliable: left.reliable && right.reliable,
          };
        });
        const q = {
          value: values.reduce((sum, part) => sum + part.value, 0),
          reliable: values.every((part) => part.reliable),
        };
        value = q.value;
        rows.push({
          step: `[${l}, ${r}] · ${Number.isFinite(l) && Number.isFinite(r) ? `ε = 10^−${k}` : `R = ${2 ** (k + 2)}`}`,
          value: direction * value,
        });
        const delta = Math.abs(value - previous);
        const decaying =
          delta < previousDelta * 0.85 || delta < 1e-10 * (1 + Math.abs(value));
        stableCount =
          q.reliable &&
          Number.isFinite(previous) &&
          decaying &&
          delta < 3e-5 * (1 + Math.abs(value))
            ? stableCount + 1
            : 0;
        previous = value;
        previousDelta = delta;
      }
      if (stableCount >= 2) status = "stable";
    }
    pieces.push({ from: l, to: r, status, value: direction * value });
  }
  const status = pieces.every((p) => p.status === "stable")
    ? "stable"
    : "unresolved";
  return {
    status,
    improper,
    rows,
    pieces,
    value:
      status === "stable" ? pieces.reduce((sum, p) => sum + p.value, 0) : NaN,
  };
}

export function integralCurve(
  f: (x: number) => number,
  anchor: number,
  min: number,
  max: number,
  breaks: number[],
  constant = 0,
): GraphPoint[][] {
  if (![min, max, constant].every(Number.isFinite) || min >= max) return [];
  let pivot = Number.isFinite(anchor)
    ? Math.max(min, Math.min(max, anchor))
    : Math.max(min, Math.min(max, 0));
  let offset = integrate(f, anchor, pivot, breaks);
  if (offset.status !== "stable") {
    const candidates = [min, (min + max) / 2, max].filter((x) =>
      Number.isFinite(f(x)),
    );
    for (const candidate of candidates) {
      const trial = integrate(f, anchor, candidate, breaks);
      if (trial.status === "stable") {
        pivot = candidate;
        offset = trial;
        break;
      }
    }
    if (offset.status !== "stable") return [];
  }
  const segments: GraphPoint[][] = [];
  for (const end of [min, max]) {
    let previous = pivot,
      total = constant + offset.value;
    const points: GraphPoint[] = [{ x: pivot, y: total }];
    const values = [
      ...Array.from(
        { length: 150 },
        (_, i) => pivot + ((end - pivot) * (i + 1)) / 150,
      ),
      ...breaks.filter(
        (x) => x > Math.min(pivot, end) && x < Math.max(pivot, end),
      ),
    ].sort((a, b) => (end < pivot ? b - a : a - b));
    for (const x of values) {
      const result = integrate(f, previous, x, breaks);
      if (result.status !== "stable") break;
      total += result.value;
      points.push({ x, y: total });
      previous = x;
    }
    if (end < pivot) points.reverse();
    segments.push(points);
  }
  return segments;
}

export function taylorAgreement(
  f: (x: number) => number,
  polynomial: (x: number) => number,
  center: number,
  min: number,
  max: number,
  tolerance: number,
) {
  if (
    !(tolerance > 0) ||
    !Number.isFinite(tolerance) ||
    center < min ||
    center > max
  )
    return null;
  const valid = (x: number) =>
    Number.isFinite(f(x)) && Math.abs(f(x) - polynomial(x)) <= tolerance;
  if (!valid(center)) return null;
  const boundary = (end: number) => {
    let previous = center;
    for (let i = 1; i <= 160; i++) {
      const x = center + ((end - center) * i) / 160;
      if (!valid(x)) {
        let good = previous,
          bad = x;
        for (let j = 0; j < 24; j++) {
          const m = (good + bad) / 2;
          if (valid(m)) good = m;
          else bad = m;
        }
        return good;
      }
      previous = x;
    }
    return end;
  };
  return { min: boundary(min), max: boundary(max) };
}
