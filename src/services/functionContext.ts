import { parse } from "mathjs";
import type { MathNode } from "mathjs";
import type { FunctionDefinition } from "../types/function";
import { prepareExpression, normalizeExpression } from "./expressionParser";
import type { ExpressionContext } from "./expressionParser";
import { makeFunction } from "./transformEngine";
import { evaluateFunction } from "./functionSampler";

export function functionAlias(fn: FunctionDefinition): string | undefined {
  return (
    fn.alias ??
    /^([A-Za-z][A-Za-z0-9_]*)\([A-Za-z][A-Za-z0-9_]*\)$/.exec(fn.name)?.[1]
  );
}
export function prepareFunction(
  input: string,
  index = 0,
  available: FunctionDefinition[] = [],
  previous?: FunctionDefinition,
): FunctionDefinition {
  const candidates = new Map<string, FunctionDefinition>();
  for (const fn of available) {
    const alias = functionAlias(fn);
    if (alias && fn.kind === "function" && fn.id !== previous?.id)
      candidates.set(alias, fn);
  }
  for (const [name, fn] of Object.entries(previous?.bindings ?? {}))
    if (!candidates.has(name)) candidates.set(name, fn);
  const prepared = prepareExpression(input, [...candidates.keys()]);
  if (
    !prepared.name &&
    previous?.variable &&
    previous.variable !== prepared.variable &&
    new RegExp(`\\b${previous.variable}\\b`).test(prepared.expression)
  ) {
    prepared.parameters[prepared.variable] =
      previous.parameters?.[prepared.variable] ?? 1;
    prepared.variable = previous.variable;
    delete prepared.parameters[prepared.variable];
  }
  const bindings: Record<string, FunctionDefinition> = {};
  const liveBindings: Record<string, string> = {};
  for (const name of prepared.usedFunctions) {
    const source = candidates.get(name);
    if (!source) throw new Error(`找不到函数 ${name}，请先添加它。`);
    bindings[name] = structuredClone(source);
    if (available.some((fn) => fn.id === source.id))
      liveBindings[name] = source.id;
  }
  const parameters = { ...prepared.parameters };
  for (const name of Object.keys(parameters))
    if (previous?.parameters?.[name] !== undefined)
      parameters[name] = previous.parameters[name];
  // makeFunction handles ordinary expressions; custom calls need their context.
  const fn = previous
    ? { ...previous }
    : makeFunction(prepared.variable, index);
  let alias = prepared.name ?? fn.alias;
  if (prepared.name && [...candidates.keys()].includes(prepared.name))
    throw new Error(`函数名称 ${prepared.name} 已存在，请使用另一个名称。`);
  if (!previous && !prepared.name) {
    const names = ["f", "g", "h", "p", "q", "r", "s", "u", "v", "w"];
    alias = names.find((name) => !candidates.has(name)) ?? `f${index + 1}`;
  }
  return {
    ...fn,
    currentExpression: prepared.expression,
    originalExpression: previous?.originalExpression ?? prepared.expression,
    variable: prepared.variable,
    parameters,
    bindings,
    liveBindings,
    alias,
    name: alias ? `${alias}(${prepared.variable})` : fn.name,
  };
}

/** Resolve dependencies by identity, keeping the last valid snapshot on deletion. */
export function refreshFunctionBindings(
  list: FunctionDefinition[],
): FunctionDefinition[] {
  const byId = new Map(list.map((fn) => [fn.id, fn]));
  const resolved = new Map<string, FunctionDefinition>();
  const visiting = new Set<string>();
  const visit = (fn: FunctionDefinition): FunctionDefinition => {
    if (resolved.has(fn.id)) return resolved.get(fn.id)!;
    if (visiting.has(fn.id))
      throw new Error("复合函数不能循环引用，请更换组合。");
    visiting.add(fn.id);
    const bindings = { ...fn.bindings };
    const liveBindings = { ...fn.liveBindings };
    let deletedSource = false;
    for (const [name, id] of Object.entries(liveBindings)) {
      const source = byId.get(id);
      if (source) bindings[name] = visit(source);
      else {
        delete liveBindings[name];
        deletedSource = true;
      }
    }
    let result = { ...fn, bindings, liveBindings };
    if (deletedSource) {
      // Expand the displayed formula, while retaining an evaluation gate for
      // the original nested domains (e.g. a restricted inner function).
      result = {
        ...result,
        currentExpression: canonicalExpression(
          result,
          0,
          false,
          fn.variable || "x",
        ),
        liveBindings: {},
        domainConstraints: [
          ...(fn.domainConstraints || []),
          {
            expression: fn.currentExpression,
            domain: {
              min: -Infinity,
              max: Infinity,
              minInclusive: false,
              maxInclusive: false,
            },
          },
        ],
      };
    }
    visiting.delete(fn.id);
    resolved.set(fn.id, result);
    return result;
  };
  return list.map(visit);
}

export function withFunctionNames(
  list: FunctionDefinition[],
): FunctionDefinition[] {
  const used = new Set(list.flatMap((fn) => (fn.alias ? [fn.alias] : [])));
  const seen = new Set<string>();
  return list.map((fn) => {
    let alias = fn.alias;
    if (!alias || seen.has(alias)) {
      const names =
        fn.kind === "relation"
          ? []
          : ["f", "g", "h", "p", "q", "r", "s", "u", "v", "w"];
      alias = names.find((name) => !used.has(name));
      for (let n = 1; !alias; n++) {
        const candidate = `${fn.kind === "relation" ? "R" : "f"}${n}`;
        if (!used.has(candidate)) alias = candidate;
      }
    }
    used.add(alias);
    seen.add(alias);
    return { ...fn, alias };
  });
}

export function composeFunctions(
  outer: FunctionDefinition,
  inner: FunctionDefinition,
  list: FunctionDefinition[],
): FunctionDefinition {
  if (outer.kind !== "function" || inner.kind !== "function")
    throw new Error("请选择两个显函数进行复合。");
  const variable = inner.variable || "x";
  const result = prepareFunction(
    `${outer.alias}(${inner.alias}(${variable}))`,
    list.length,
    list,
  );
  return {
    ...result,
    transformHistory: [
      {
        label: "复合函数",
        rule: `先算 ${inner.alias}，再算 ${outer.alias}`,
        explanation: "复合结果随来源函数更新；仅在内外两层函数均有定义时绘制。",
        from: `${outer.alias} / ${inner.alias}`,
        to: result.currentExpression,
      },
    ],
  };
}
export function expressionContext(fn: FunctionDefinition): ExpressionContext {
  const functions: Record<string, (value: number) => number> = {};
  for (const [name, source] of Object.entries(fn.bindings ?? {}))
    functions[name] = (value) => evaluateFunction(source, value);
  return {
    variable: fn.variable ?? "x",
    parameters: fn.parameters ?? {},
    functions,
  };
}

export function canonicalExpression(
  fn: FunctionDefinition,
  depth = 0,
  substituteParameters = true,
  outputVariable = "x",
): string {
  if (depth > 20) throw new Error("复合函数嵌套过深。");
  const variable = fn.variable ?? "x";
  const expand = (node: MathNode): MathNode => {
    const n = node as MathNode & {
      name?: string;
      fn?: { name?: string };
      args?: MathNode[];
    };
    if (n.type === "SymbolNode") {
      if (n.name === variable) return parse(outputVariable);
      if (
        substituteParameters &&
        n.name &&
        Object.hasOwn(fn.parameters ?? {}, n.name)
      )
        return parse(`(${fn.parameters![n.name]})`);
    }
    if (n.type === "FunctionNode" && n.fn?.name && fn.bindings?.[n.fn.name]) {
      if (n.args?.length !== 1) throw new Error("复合函数需要一个自变量。");
      const argument = expand(n.args[0]);
      const source = parse(
        canonicalExpression(fn.bindings[n.fn.name], depth + 1),
      );
      return source.transform((child) =>
        child.type === "SymbolNode" &&
        (child as unknown as { name: string }).name === "x"
          ? argument.cloneDeep()
          : child,
      );
    }
    return node.map((child) => expand(child));
  };
  return expand(parse(normalizeExpression(fn.currentExpression))).toString();
}
