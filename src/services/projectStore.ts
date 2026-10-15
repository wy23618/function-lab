import { expressionContext } from "./functionContext";
import type { Domain, FunctionDefinition } from "../types/function";
import { compileExpression } from "./expressionParser";
export function encodeProject(value: unknown) {
  return JSON.stringify(value, (_, v) =>
    v === Infinity ? "__Infinity__" : v === -Infinity ? "__-Infinity__" : v,
  );
}
export function decodeProject(text: string): unknown {
  if (text.length > 5_000_000)
    throw new Error("实验文件过大，请使用较小的实验文件。");
  try {
    return JSON.parse(text, (_, v) =>
      v === "__Infinity__" ? Infinity : v === "__-Infinity__" ? -Infinity : v,
    );
  } catch {
    throw new Error("实验文件格式无效，请选择从函数实验室导出的 JSON 文件。");
  }
}
function validDomain(d: Domain) {
  return (
    d &&
    typeof d.min === "number" &&
    typeof d.max === "number" &&
    !Number.isNaN(d.min) &&
    !Number.isNaN(d.max) &&
    d.min <= d.max &&
    d.min !== Infinity &&
    d.max !== -Infinity &&
    typeof d.minInclusive === "boolean" &&
    typeof d.maxInclusive === "boolean"
  );
}
export function validateFunctions(data: unknown): FunctionDefinition[] {
  if (!Array.isArray(data) || data.length > 150)
    throw new Error("实验应包含至多 150 个函数。");
  const validate = (f: FunctionDefinition, depth = 0) => {
    if (depth > 30) throw new Error("镜像链过长，请拆分实验。");
    if (
      !f ||
      typeof f.id !== "string" ||
      typeof f.name !== "string" ||
      typeof f.currentExpression !== "string" ||
      f.currentExpression.length > 4000 ||
      typeof f.originalExpression !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(f.color) ||
      typeof f.visible !== "boolean" ||
      typeof f.locked !== "boolean" ||
      !["solid", "dashed"].includes(f.lineStyle) ||
      !validDomain(f.domain) ||
      !Array.isArray(f.transformHistory) ||
      f.transformHistory.some(
        (h) =>
          !h ||
          ["label", "rule", "explanation", "from", "to"].some(
            (k) => typeof (h as any)[k] !== "string",
          ),
      )
    )
      throw new Error("实验文件中的函数数据不完整。");
    const identifier = /^[A-Za-z][A-Za-z0-9_]*$/;
    const reserved = new Set([
      "e",
      "pi",
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
    if (
      (f.variable !== undefined &&
        (typeof f.variable !== "string" || !identifier.test(f.variable))) ||
      (f.alias !== undefined &&
        (typeof f.alias !== "string" ||
          !identifier.test(f.alias) ||
          reserved.has(f.alias)))
    )
      throw new Error("函数变量或名称无效。");
    if (f.parameters !== undefined) {
      if (
        !f.parameters ||
        typeof f.parameters !== "object" ||
        Array.isArray(f.parameters) ||
        Object.keys(f.parameters).length > 50 ||
        Object.entries(f.parameters).some(
          ([name, value]) =>
            !identifier.test(name) ||
            typeof value !== "number" ||
            !Number.isFinite(value),
        )
      )
        throw new Error("函数参数无效。");
    }
    if (f.bindings !== undefined) {
      if (
        !f.bindings ||
        typeof f.bindings !== "object" ||
        Array.isArray(f.bindings) ||
        Object.keys(f.bindings).length > 50
      )
        throw new Error("复合函数定义无效。");
      for (const [name, source] of Object.entries(f.bindings)) {
        if (!identifier.test(name) || reserved.has(name))
          throw new Error("复合函数名称无效。");
        validate(source, depth + 1);
      }
    }
    if (
      f.liveBindings !== undefined &&
      (!f.liveBindings ||
        typeof f.liveBindings !== "object" ||
        Array.isArray(f.liveBindings) ||
        Object.entries(f.liveBindings).some(
          ([name, id]) => !identifier.test(name) || typeof id !== "string",
        ))
    )
      throw new Error("复合函数来源无效。");
    if (f.kind === "function")
      compileExpression(f.currentExpression, expressionContext(f));
    else if (
      f.kind === "relation" &&
      f.source &&
      f.reflection &&
      Object.values(f.reflection).every(Number.isFinite) &&
      f.reflection.a * f.reflection.a + f.reflection.b * f.reflection.b > 0
    )
      validate(f.source, depth + 1);
    else throw new Error("实验文件中的关系数据无效。");
    if (f.domainConstraints) {
      if (
        !Array.isArray(f.domainConstraints) ||
        f.domainConstraints.length > 50
      )
        throw new Error("定义域约束无效。");
      for (const c of f.domainConstraints) {
        if (!c || typeof c.expression !== "string" || !validDomain(c.domain))
          throw new Error("定义域约束无效。");
        compileExpression(c.expression, expressionContext(f));
      }
    }
    if (f.differentiabilityChecks) {
      if (
        !Array.isArray(f.differentiabilityChecks) ||
        f.differentiabilityChecks.length > 50
      )
        throw new Error("导函数约束无效。");
      for (const c of f.differentiabilityChecks) {
        if (
          !c ||
          typeof c.expression !== "string" ||
          typeof c.argument !== "string"
        )
          throw new Error("导函数约束无效。");
        if (c.source) validate(c.source, depth + 1);
        else compileExpression(c.expression, expressionContext(f));
        compileExpression(c.argument, expressionContext(f));
      }
    }
  };
  for (const f of data) validate(f);
  if (new Set(data.map((f) => f.id)).size !== data.length)
    throw new Error("实验文件包含重复函数标识。");
  return data;
}
