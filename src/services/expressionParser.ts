import { ConstantNode, FunctionNode, parse, SymbolNode } from "mathjs";
import type { MathNode, OperatorNode, ParenthesisNode } from "mathjs";
import { ALL_DOMAIN } from "../types/function";
import type { Domain } from "../types/function";
import { normalizeMathCharacters } from "../utils/userExpression";

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
  inputAxis?: "y";
  expression: string;
  variable: string;
  parameters: Record<string, number>;
  name?: string;
  usedFunctions: string[];
}
const declaration = /^([a-zA-Z][a-zA-Z0-9_]*)\s*\(\s*([a-zA-Z])\s*\)\s*=\s*/;
const shorthandNames = [...allowedFunctions]
  .filter((n) => !["min", "max"].includes(n))
  .concat("ln", "lg", "log10", "log2")
  .sort((a, b) => b.length - a.length);
function groupEnd(text: string, opening: number): number | undefined {
  let depth = 0;
  for (let i = opening; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")" && --depth === 0) return i + 1;
  }
  return undefined;
}

function expandCompositionNotation(text: string): string {
  let result = "";
  for (let i = 0; i < text.length;) {
    const match =
      (i === 0 || !/[A-Za-z0-9_]/.test(text[i - 1])) &&
      text
        .slice(i)
        .match(
          /^(?:\(\s*([A-Za-z][A-Za-z0-9_]*(?:\s*∘\s*[A-Za-z][A-Za-z0-9_]*)+)\s*\)|([A-Za-z][A-Za-z0-9_]*(?:\s*∘\s*[A-Za-z][A-Za-z0-9_]*)+))\s*\(/,
        );
    if (match) {
      const opening = i + match[0].length - 1;
      const end = groupEnd(text, opening);
      if (end !== undefined) {
        const argument = expandCompositionNotation(
          text.slice(opening + 1, end - 1),
        );
        result += (match[1] || match[2])
          .split(/\s*∘\s*/)
          .reduceRight((value, name) => `${name}(${value})`, argument);
        i = end;
        continue;
      }
    }
    result += text[i++];
  }
  return result;
}

function expandLogAliases(text: string, protectedNames: string[]): string {
  let result = "";
  for (let i = 0; i < text.length;) {
    const match =
      (i === 0 || !/[A-Za-z0-9_]/.test(text[i - 1])) &&
      text.slice(i).match(/^(lg|log10|log2)\s*\(/);
    if (match && !protectedNames.includes(match[1])) {
      const opening = i + match[0].length - 1;
      const end = groupEnd(text, opening);
      if (end !== undefined) {
        result += `log(${expandLogAliases(text.slice(opening + 1, end - 1), protectedNames)},${match[1] === "log2" ? 2 : 10})`;
        i = end;
        continue;
      }
    }
    result += text[i++];
  }
  return result;
}

// A compact call consumes one powered atom, including an implicit coefficient.
// Explicit operators and sums remain outside: sin2t + 1 is sin(2t) + 1.
function expandCompactCalls(text: string): string {
  function atom(start: number): { text: string; end: number } | undefined {
    let cursor = start;
    while (/\s/.test(text[cursor] ?? "") && cursor < text.length) cursor++;
    if (text[cursor] === "(") {
      const end = groupEnd(text, cursor);
      if (end !== undefined) return { text: text.slice(cursor, end), end };
    }
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
    if (name) {
      const power = text
        .slice(i + name.length)
        .match(/^\s*\^\s*(?:\(\s*(\d+)\s*\)|(\d+))(?![\d.])/);
      if (power) {
        const argument = atom(i + name.length + power[0].length);
        if (argument) {
          const call = argument.text.startsWith("(")
            ? `${name}${argument.text}`
            : `${name}(${argument.text})`;
          result += `(${call})^(${power[1] || power[2]})`;
          i = argument.end;
          continue;
        }
      }
    }
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

export function normalizeExpression(
  input: string,
  knownFunctionNames: string[] = [],
  variable?: string,
): string {
  if (input.length > 4000)
    throw new Error("表达式过长，请拆分为多个函数或较短的变换链。");
  const characters = normalizeMathCharacters(input);
  const declaredVariable = characters.trim().match(declaration)?.[2];
  const builtinNames = new Set([
    ...allowedFunctions,
    "ln",
    "lg",
    "log10",
    "log2",
  ]);
  let text = characters
    .trim()
    .replace(declaration, "")
    .replace(/^y\s*=\s*/i, "")
    .replace(/[πΠ]/g, "pi")
    .replace(/[−–]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/");
  text = text.replace(/[A-Za-z][A-Za-z0-9_]*/g, (name) => {
    if (knownFunctionNames.includes(name)) return name;
    const lower = name.toLowerCase();
    return builtinNames.has(lower) || lower === "pi" ? lower : name;
  });
  const productVariables = new Set(
    ["x", "t", declaredVariable, variable].filter(Boolean),
  );
  text = text.replace(/\b([A-Za-z])\s*\(/g, (match, name) =>
    productVariables.has(name) && !knownFunctionNames.includes(name)
      ? `${name}*(`
      : match,
  );
  text = expandCompositionNotation(text);
  // Classroom shorthand e^πx denotes an exponent πx; explicit * retains standard precedence.
  text = text.replace(
    /[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g,
    (s) => "^(" + [...s].map((c) => superscripts[c]).join("") + ")",
  );
  text = text.replace(
    /\be\s*\^\s*([+-]?pi\s*[a-zA-Z]\b(?:\^\([^()]+\)|\^-?\d+(?:\.\d+)?)?)(?!\s*\^)/g,
    "e^($1)",
  );
  text = expandLogAliases(expandCompactCalls(text), knownFunctionNames);
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
      if (
        ![
          "+",
          "-",
          "*",
          "/",
          "^",
          "%",
          "<",
          ">",
          "<=",
          ">=",
          "==",
          "!=",
          "and",
          "or",
        ].includes(value.op ?? "")
      )
        throw new Error("不支持的运算");
    } else if (child.type === "FunctionNode") {
      const name = (value.fn as MathNode & { name?: string })?.name;
      if (!name || !names.has(name))
        throw new Error(
          `找不到函数 ${name || ""}，请检查名称或先添加这个函数。`,
        );
      const count = value.args?.length ?? 0;
      if (
        count < 1 ||
        (!["min", "max"].includes(name) &&
          count > (["log", "round", "floor", "ceil"].includes(name) ? 2 : 1))
      )
        throw new Error(`函数 ${name} 的参数个数不正确。`);
    } else if (
      !["ParenthesisNode", "ConditionalNode", "RelationalNode"].includes(
        child.type,
      )
    )
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
  const reversed = normalizeMathCharacters(input)
    .trim()
    .match(/^x\s*=(?!=)\s*(.+)$/i);
  const declared = normalizeMathCharacters(input).trim().match(declaration);
  const expression = normalizeExpression(
    reversed ? reversed[1] : input,
    knownFunctionNames,
    reversed ? "y" : undefined,
  );
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
    (reversed ? "y" : declared?.[2]) ??
    (free.includes("x")
      ? "x"
      : free.includes("t")
        ? "t"
        : (free.find((n) => /^[a-zA-Z]$/.test(n)) ?? "x"));
  if (variable === "e")
    throw new Error("常量 e 不能作为自变量，请换用其他字母。");
  if (reversed && free.includes("x"))
    throw new Error(
      "x = 的右侧请使用 y，例如 x = 2y + 1；一般隐式方程暂不支持。",
    );
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
    inputAxis: reversed ? "y" : undefined,
    expression,
    variable,
    parameters,
    name: declared?.[1],
    usedFunctions,
  };
}
function unwrap(node: MathNode): MathNode {
  return node.type === "ParenthesisNode"
    ? unwrap((node as ParenthesisNode).content)
    : node;
}

function signedInteger(node: MathNode): number {
  const inner = unwrap(node);
  if (inner.type === "OperatorNode") {
    const { op, args } = inner as OperatorNode;
    if (args.length === 1 && (op === "+" || op === "-"))
      return (op === "-" ? -1 : 1) * signedInteger(args[0]);
  }
  if (inner.type !== "ConstantNode") return NaN;
  const { value } = inner as ConstantNode;
  return typeof value === "number" && Number.isSafeInteger(value) ? value : NaN;
}

function oddDenominatorFraction(
  node: MathNode,
): { numerator: number; denominator: number } | undefined {
  const inner = unwrap(node);
  if (inner.type !== "OperatorNode") return;
  const { op, args } = inner as OperatorNode;
  if (args.length === 1 && (op === "+" || op === "-")) {
    const fraction = oddDenominatorFraction(args[0]);
    if (fraction && op === "-") fraction.numerator *= -1;
    return fraction;
  }
  if (op !== "/" || args.length !== 2) return;
  const numerator = signedInteger(args[0]);
  const denominator = signedInteger(args[1]);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    !denominator
  )
    return;
  let divisor = Math.abs(numerator);
  let remainder = Math.abs(denominator);
  while (remainder) [divisor, remainder] = [remainder, divisor % remainder];
  const reducedDenominator = Math.abs(denominator) / divisor;
  if (reducedDenominator <= 1 || reducedDenominator % 2 === 0) return;
  return {
    numerator: (numerator / divisor) * Math.sign(denominator),
    denominator: reducedDenominator,
  };
}

const realPowerSymbol = "__realOddDenominatorPower";

function realOddDenominatorPower(
  base: unknown,
  numerator: number,
  denominator: number,
) {
  if (typeof base !== "number") return NaN;
  const magnitude = Math.pow(Math.abs(base), numerator / denominator);
  return base < 0 && numerator % 2 !== 0 ? -magnitude : magnitude;
}

function realPowers(node: MathNode): MathNode {
  return node.transform((child) => {
    if (child.type !== "OperatorNode") return child;
    const { op, args } = child as OperatorNode;
    if (op !== "^" || args.length !== 2) return child;
    const fraction = oddDenominatorFraction(args[1]);
    if (!fraction) return child;
    return new FunctionNode(new SymbolNode(realPowerSymbol), [
      realPowers(args[0]),
      new ConstantNode(fraction.numerator),
      new ConstantNode(fraction.denominator),
    ]);
  });
}

export function compileExpression(
  input: string,
  context?: ExpressionContext,
): (x: number) => number {
  const normalized = normalizeExpression(
    input,
    Object.keys(context?.functions ?? {}),
    context?.variable,
  );
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
  const compiled = realPowers(node).compile();
  return (x: number): number => {
    if (!Number.isFinite(x)) return NaN;
    try {
      const result: unknown = compiled.evaluate({
        ...actual.parameters,
        ...(context?.functions ?? {}),
        [realPowerSymbol]: realOddDenominatorPower,
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
