import { parse } from "mathjs";
import type { MathNode } from "mathjs";
import { normalizeExpression } from "../services/expressionParser";

/** Clean generated formulas while preserving operations that can create holes or poles. */
export function formatExpression(expression: string): string {
  try {
    const unwrap = (node: MathNode | undefined): MathNode | undefined => {
      let current = node as (MathNode & { content?: MathNode }) | undefined;
      while (current?.type === "ParenthesisNode" && current.content)
        current = current.content as typeof current;
      return current;
    };
    const numericConstant = (
      node: MathNode | undefined,
    ): number | undefined => {
      const current = unwrap(node) as
        | (MathNode & { op?: string; args?: MathNode[]; value?: unknown })
        | undefined;
      if (current?.type === "ConstantNode" && typeof current.value === "number")
        return current.value;
      if (
        current?.type === "OperatorNode" &&
        current.args?.length === 1 &&
        (current.op === "+" || current.op === "-")
      ) {
        const child = numericConstant(current.args[0]);
        if (child !== undefined) return current.op === "-" ? -child : child;
      }
      return undefined;
    };
    function formatTree(node: MathNode): MathNode {
      return node.transform(rewrite);
    }
    const rewrite = (node: MathNode): MathNode => {
      const value = node as MathNode & {
        value?: unknown;
        op?: string;
        args?: MathNode[];
      };
      if (node.type === "ConstantNode" && typeof value.value === "number") {
        if (Math.abs(value.value - Math.PI) < 1e-14) return parse("pi");
        if (Math.abs(value.value - Math.E) < 1e-14) return parse("e");
      }

      const args = value.args;
      if (node.type !== "OperatorNode" || !args) return node;
      if (value.op === "-" && args.length === 1) {
        const inner = unwrap(args[0]) as
          (MathNode & { op?: string; args?: MathNode[] }) | undefined;
        if (
          inner?.type === "OperatorNode" &&
          inner.op === "-" &&
          inner.args?.length === 2
        )
          return formatTree(
            parse(`${inner.args[1].toString()}-(${inner.args[0].toString()})`),
          );
        return node;
      }
      if (value.op === "^") {
        const base = unwrap(args[0]) as
          (MathNode & { op?: string; args?: MathNode[] }) | undefined;
        const exponent = unwrap(args[1]) as
          (MathNode & { value?: unknown }) | undefined;
        if (
          exponent?.type === "ConstantNode" &&
          typeof exponent.value === "number" &&
          Number.isInteger(exponent.value) &&
          exponent.value % 2 === 0 &&
          base?.type === "OperatorNode" &&
          base.op === "-" &&
          base.args?.length === 1
        )
          return formatTree(
            parse(`(${base.args[0].toString()})^${exponent.value}`),
          );
      }
      if (args.length === 2) {
        const left = unwrap(args[0]);
        const rightValue = numericConstant(args[1]);
        const leftValue = numericConstant(args[0]);
        const zero = rightValue === 0;
        const one = rightValue === 1;
        if ((value.op === "+" || value.op === "-") && zero && left)
          return formatTree(left.cloneDeep());
        if (value.op === "+" && leftValue === 0)
          return formatTree(args[1].cloneDeep());
        if (value.op === "*" && one && left)
          return formatTree(left.cloneDeep());
        if (value.op === "*" && leftValue === 1)
          return formatTree(args[1].cloneDeep());
        if (value.op === "/" && one && left)
          return formatTree(left.cloneDeep());
      }
      return node;
    };
    return formatTree(parse(normalizeExpression(expression))).toString({
      parenthesis: "auto",
      implicit: "hide",
    });
  } catch {
    return expression;
  }
}
