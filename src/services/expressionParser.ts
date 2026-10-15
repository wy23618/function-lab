import { parse } from "mathjs";
import type { MathNode } from "mathjs";
import { ALL_DOMAIN } from "../types/function";
import type { Domain } from "../types/function";

const allowedFunctions = new Set([
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "asinh",
  "sinh",
  "cosh",
  "tanh",
  "exp",
  "log",
  "sqrt",
  "abs",
  "floor",
  "ceil",
  "round",
  "sign",
  "min",
  "max",
]);
const superscripts: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁻": "-",
};

export interface ExpressionContext {
  variable?: string;
  parameters?: Record<string, number>;
  functions?: Record<string, (value: number) => number>;
}
export interface PreparedExpression {
  expression: string;
  variable: string;
  parameters: Record<string, number>;
  name?: string;
  usedFunctions: string[];
}
const declaration = /^([a-zA-Z][a-zA-Z0-9_]*)\s*\(\s*([a-zA-Z])\s*\)\s*=\s*/;
const shorthandNames = [...allowedFunctions]
  .filter((n) => !["min", "max"].includes(n))
  .concat("ln")
  .sort((a, b) => b.length - a.length);
// A compact call consumes one powered atom, including an implicit coefficient.
// Explicit operators and sums remain outside: sin2t + 1 is sin(2t) + 1.
function expandCompactCalls(text: string): string {
  function atom(start: number): { text: string; end: number } | undefined {
    let cursor = start;
    while (/\s/.test(text[cursor] ?? "") && cursor < text.length) cursor++;
    const name = shorthandNames.find((n) => text.startsWith(n, cursor));
    if (name) {
      let opening = cursor + name.length;
      while (/\s/.test(text[opening] ?? "") && opening < text.length) opening++;
      if (text[opening] === "(") {
        let depth = 1;
        let end = opening + 1;
        while (end < text.length && depth > 0) {
          depth += text[end] === "(" ? 1 : text[end] === ")" ? -1 : 0;
          end++;
        }
        if (depth === 0) return { text: text.slice(cursor, end), end };
      }
    }
    if (name && text[cursor + name.length] !== "(") {
      const inner = atom(cursor + name.length);
      if (inner) return { text: `${name}(${inner.text})`, end: inner.end };
    }
    const match = text
      .slice(cursor)
      .match(
        /^-?(?:(?:\d+(?:\.\d+)?)(?:pi|[a-zA-Z]{1,2})?|pi(?:[a-zA-Z])?|[a-zA-Z]{1,2})(?:\^(?:\([^()]+\)|-?\d+(?:\.\d+)?))?/,
      );
    if (!match) return undefined;
    // Never silently turn unknown long identifiers into products.
    if (/[a-zA-Z_]/.test(text[cursor + match[0].length] ?? ""))
      return undefined;
    return { text: match[0], end: cursor + match[0].length };
  }
  let result = "";
  for (let i = 0; i < text.length;) {
    const name =
      (i === 0 || !/[a-zA-Z_]/.test(text[i - 1])) &&
      shorthandNames.find((n) => text.startsWith(n, i));
    const identifierCall = text.slice(i).match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*\(/);
    const preserveAlias =
      name &&
      identifierCall &&
      identifierCall[1] !== name &&
      !shorthandNames.some((n) => text.startsWith(n, i + name.length));
    if (
      name &&
      !preserveAlias &&
      text.slice(i + name.length).trimStart()[0] !== "("
    ) {
      const argument = atom(i + name.length);
      if (argument) {
        result += `${name}(${argument.text})`;
        i = argument.end;
        continue;
      }
    }
    result += text[i++];
  }
  return result;
}

export function normalizeExpression(input: string): string {
  if (input.length > 4000)
    throw new Error("表达式过长，请拆分为多个函数或较短的变换链。");
  let text = input
    .trim()
    .replace(declaration, "")
    .replace(/^y\s*=\s*/i, "")
    .replace(/[πΠ]/g, "pi")
    .replace(/[−–]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/");
  // Classroom shorthand e^πx denotes an exponent πx; explicit * retains standard precedence.
  text = text.replace(
    /[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g,
    (s) => "^(" + [...s].map((c) => superscripts[c]).join("") + ")",
  );
  text = text.replace(
    /\be\s*\^\s*([+-]?pi\s*[a-zA-Z]\b(?:\^\([^()]+\)|\^-?\d+(?:\.\d+)?)?)(?!\s*\^)/g,
    "e^($1)",
  );
  text = expandCompactCalls(text);
  // Constants next to a letter denote multiplication, including πt and πm.
  text = text
    .replace(/(?<![a-zA-Z_])pi(?=[a-zA-Z]|\()/g, "pi*")
    .replace(/\b([a-zA-Z])(?=pi\b)/g, "$1*")
    .replace(/\be(?=[a-zA-Z]\b|pi\b|\()/g, "e*")
    .replace(/\bln(?=\s*\()/g, "log")
    .replace(/√\s*\(/g, "sqrt(")
    .replace(/√\s*(pi|[a-zA-Z]|\d+(?:\.\d+)?)/g, "sqrt($1)");
  text = text.replace(/(?<![a-zA-Z_])([a-zA-Z]{2})\b(?!\s*\()/g, (word) =>
    word === "pi" || word === "ln" ? word : word.split("").join("*"),
  );
  let open = false;
  text = [...text]
    .map((c) => {
      if (c !== "|") return c;
      open = !open;
      return open ? "abs(" : ")";
    })
    .join("");
  if (open) throw new Error("绝对值符号必须成对出现");
  if (!text) throw new Error("请输入函数表达式");
  return text;
}

function validate(node: MathNode, context: ExpressionContext): void {
  const names = new Set([
    ...allowedFunctions,
    ...Object.keys(context.functions ?? {}),
  ]);
  const symbols = new Set([
    context.variable ?? "x",
    "pi",
    "e",
    ...Object.keys(context.parameters ?? {}),
  ]);
  node.traverse((child, path, parent) => {
    const value = child as MathNode & {
      name?: string;
      op?: string;
      value?: unknown;
      fn?: MathNode;
      args?: MathNode[];
    };
    if (child.type === "ConstantNode") {
      if (typeof value.value !== "number" || !Number.isFinite(value.value))
        throw new Error("仅支持有限实数常量");
    } else if (child.type === "SymbolNode") {
      if (!symbols.has(value.name ?? "") && !names.has(value.name ?? ""))
        throw new Error(`不支持的符号：${value.name}`);
      if (
        names.has(value.name ?? "") &&
        !(path === "fn" && parent?.type === "FunctionNode")
      )
        throw new Error(`函数 ${value.name} 需要参数，例如 ${value.name}(x)。`);
    } else if (child.type === "OperatorNode") {
      if (!["+", "-", "*", "/", "^", "%"].includes(value.op ?? ""))
        throw new Error("不支持的运算");
    } else if (child.type === "FunctionNode") {
      const name = (value.fn as MathNode & { name?: string })?.name;
      if (!name || !names.has(name)) throw new Error("不支持的函数调用");
      const count = value.args?.length ?? 0;
      if (
        count < 1 ||
        (!["min", "max"].includes(name) &&
          count > (["log", "round", "floor", "ceil"].includes(name) ? 2 : 1))
      )
        throw new Error(`函数 ${name} 的参数个数不正确。`);
    } else if (child.type !== "ParenthesisNode")
      throw new Error("表达式只能包含数学运算、自变量、参数和数学函数");
  });
}

function parseExpression(normalized: string): MathNode {
  try {
    return parse(normalized);
  } catch {
    const balance = [...normalized].reduce(
      (n, c) => n + (c === "(" ? 1 : c === ")" ? -1 : 0),
      0,
    );
    if (balance !== 0) throw new Error("括号不匹配，请检查缺失或多余的括号。");
    throw new Error("表达式格式错误，请检查运算符、括号和函数参数。");
  }
}
export function prepareExpression(
  input: string,
  knownFunctionNames: string[] = [],
): PreparedExpression {
  const declared = input.trim().match(declaration);
  const expression = normalizeExpression(input);
  const node = parseExpression(expression);
  const free: string[] = [];
  const usedFunctions: string[] = [];
  node.traverse((child, path, parent) => {
    const name = (child as MathNode & { name?: string }).name;
    if (child.type !== "SymbolNode" || !name) return;
    if (path === "fn" && parent?.type === "FunctionNode") {
      if (!allowedFunctions.has(name) && !usedFunctions.includes(name))
        usedFunctions.push(name);
    } else if (
      !["pi", "e"].includes(name) &&
      !allowedFunctions.has(name) &&
      !free.includes(name)
    )
      free.push(name);
  });
  const variable =
    declared?.[2] ??
    (free.includes("x")
      ? "x"
      : free.includes("t")
        ? "t"
        : (free.find((n) => /^[a-zA-Z]$/.test(n)) ?? "x"));
  if (variable === "e")
    throw new Error("常量 e 不能作为自变量，请换用其他字母。");
  const parameters = Object.fromEntries(
    free
      .filter((n) => n !== variable && /^[a-zA-Z]$/.test(n))
      .map((n) => [n, 1]),
  );
  validate(node, {
    variable,
    parameters,
    functions: Object.fromEntries(
      knownFunctionNames.map((n) => [n, () => NaN]),
    ),
  });
  if (
    declared &&
    (allowedFunctions.has(declared[1]) || ["pi", "e"].includes(declared[1]))
  )
    throw new Error("函数名称不能使用数学函数或常量名称。");
  return {
    expression,
    variable,
    parameters,
    name: declared?.[1],
    usedFunctions,
  };
}
export function compileExpression(
  input: string,
  context?: ExpressionContext,
): (x: number) => number {
  const normalized = normalizeExpression(input);
  const prepared = context ? undefined : prepareExpression(input);
  const actual = context ?? prepared!;
  const variable = actual.variable ?? "x";
  if (!/^[a-zA-Z]$/.test(variable) || ["e"].includes(variable))
    throw new Error("自变量应为常量名称之外的单个字母。");
  for (const [name, value] of Object.entries(actual.parameters ?? {})) {
    if (
      !/^[a-zA-Z]$/.test(name) ||
      name === variable ||
      name === "e" ||
      !Number.isFinite(value)
    )
      throw new Error("参数名称或数值无效。");
  }
  const node = parseExpression(normalized);
  validate(node, actual);
  const compiled = node.compile();
  return (x: number): number => {
    if (!Number.isFinite(x)) return NaN;
    try {
      const result: unknown = compiled.evaluate({
        ...actual.parameters,
        ...(context?.functions ?? {}),
        [variable]: x,
      });
      return typeof result === "number" && Number.isFinite(result)
        ? result
        : NaN;
    } catch {
      return NaN;
    }
  };
}

export function domainContains(domain: Domain, x: number): boolean {
  return (
    Number.isFinite(x) &&
    (domain.minInclusive ? x >= domain.min : x > domain.min) &&
    (domain.maxInclusive ? x <= domain.max : x < domain.max)
  );
}

export function parseDomain(input: string, variable = "x"): Domain {
  const raw = input
    .trim()
    .replace(/\s/g, "")
    .replace(/[−–]/g, "-")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=");
  if (!raw || /^(R|ℝ|全体实数|实数)$/i.test(raw)) return { ...ALL_DOMAIN };
  const bound = (value: string): number => {
    if (/^(\+?∞|\+?inf(?:inity)?)$/i.test(value)) return Infinity;
    if (/^(-∞|-inf(?:inity)?)$/i.test(value)) return -Infinity;
    const normalized = normalizeExpression(value);
    const endpoint = prepareExpression(normalized);
    if (
      endpoint.variable !== "x" ||
      /\bx\b/.test(normalized) ||
      Object.keys(endpoint.parameters).length
    )
      throw new Error("定义域端点必须是常数");
    const result = compileExpression(normalized)(0);
    if (!Number.isFinite(result)) throw new Error("定义域端点无效");
    return result;
  };
  let min = -Infinity,
    max = Infinity,
    minInclusive = false,
    maxInclusive = false;
  const match = raw.match(/^([[(])([^,，]+)[,，]([^,，]+)([\])])$/);
  if (match) {
    min = bound(match[2]);
    max = bound(match[3]);
    minInclusive = match[1] === "[";
    maxInclusive = match[4] === "]";
  } else {
    const parts = raw.split(/(<=|>=|<|>)/);
    if (
      (parts.length !== 3 && parts.length !== 5) ||
      parts.filter((p) => p === variable).length !== 1
    )
      throw new Error(
        `定义域格式应为 [a,b]、${variable}≥a、${variable}<b 或 a≤${variable}≤b。`,
      );
    for (let i = 1; i < parts.length; i += 2) {
      const l = parts[i - 1],
        r = parts[i + 1],
        op = parts[i];
      if (l !== variable && r !== variable)
        throw new Error(`不等式中每个比较都必须包含 ${variable}。`);
      const value = bound(l === variable ? r : l);
      const lower = l === variable ? op.startsWith(">") : op.startsWith("<");
      const inclusive = op.includes("=");
      if (lower) {
        if (value > min) {
          min = value;
          minInclusive = inclusive;
        } else if (value === min) minInclusive &&= inclusive;
      } else {
        if (value < max) {
          max = value;
          maxInclusive = inclusive;
        } else if (value === max) maxInclusive &&= inclusive;
      }
    }
  }
  minInclusive &&= Number.isFinite(min);
  maxInclusive &&= Number.isFinite(max);
  if (
    min > max ||
    min === Infinity ||
    max === -Infinity ||
    (min === max && !(minInclusive && maxInclusive))
  )
    throw new Error("定义域为空或端点顺序错误");
  return { min, max, minInclusive, maxInclusive };
}
