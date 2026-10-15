import { parse } from "mathjs";
import type { MathNode } from "mathjs";
import type { ReactNode } from "react";
import { normalizeExpression } from "../services/expressionParser";
function render(node: MathNode, depth = 0): ReactNode {
  if (depth > 30) return "…";
  const n = node as MathNode & {
    name?: string;
    value?: number;
    op?: string;
    args?: MathNode[];
    content?: MathNode;
    fn?: MathNode;
    implicit?: boolean;
  };
  const draw = (a: MathNode) => render(a, depth + 1);
  if (n.type === "ConstantNode") return String(n.value);
  if (n.type === "SymbolNode")
    return <i>{n.name === "pi" ? "π" : n.name === "_" ? "□" : n.name}</i>;
  if (n.type === "ParenthesisNode" && n.content)
    return (
      <>
        <span>(</span>
        {draw(n.content)}
        <span>)</span>
      </>
    );
  if (n.type === "OperatorNode" && n.args) {
    if (n.op === "^" && n.args.length === 2)
      return (
        <span className="math-power">
          {draw(n.args[0])}
          <sup>
            {draw(
              n.args[1].type === "ParenthesisNode"
                ? (n.args[1] as MathNode & { content: MathNode }).content
                : n.args[1],
            )}
          </sup>
        </span>
      );
    if (n.op === "/" && n.args.length === 2)
      return (
        <span className="math-fraction">
          <span>{draw(n.args[0])}</span>
          <span>{draw(n.args[1])}</span>
        </span>
      );
    if (n.args.length === 1)
      return (
        <>
          {n.op === "-" ? "−" : n.op}
          {draw(n.args[0])}
        </>
      );
    return (
      <>
        {n.args.map((a, i) => (
          <span key={i}>
            {i > 0 && (
              <span className="math-op">
                {n.op === "*"
                  ? n.implicit
                    ? " "
                    : "·"
                  : n.op === "-"
                    ? "−"
                    : n.op}
              </span>
            )}
            {draw(a)}
          </span>
        ))}
      </>
    );
  }
  if (n.type === "FunctionNode" && n.fn) {
    const name = (n.fn as MathNode & { name: string }).name;
    const args = n.args ?? [];
    if (name === "sqrt")
      return (
        <span className="math-root">
          √<span>{args.length ? draw(args[0]) : "□"}</span>
        </span>
      );
    if (name === "abs") return <>|{args.length ? draw(args[0]) : "□"}|</>;
    return (
      <>
        <span>{name === "log" && args.length === 1 ? "ln" : name}</span>
        {name === "log" && args.length === 2 && <sub>{draw(args[1])}</sub>}(
        {args.length
          ? name === "log" && args.length === 2
            ? draw(args[0])
            : args.map((a, i) => (
                <span key={i}>
                  {i > 0 && ", "}
                  {draw(a)}
                </span>
              ))
          : "□"}
        )
      </>
    );
  }
  return node.toString();
}
export default function MathFormula({ expression }: { expression: string }) {
  let result: ReactNode = expression;
  try {
    let text = normalizeExpression(expression.slice(0, 1000)).replace(
      /\(\)/g,
      "(_)",
    );
    text = text.replace(/([+*/^−-])$/, "$1_");
    if (text.endsWith("(")) text += "_";
    const balance = [...text].reduce(
      (n, c) => n + (c === "(" ? 1 : c === ")" ? -1 : 0),
      0,
    );
    if (balance > 0 && balance < 30) text += ")".repeat(balance);
    if (text) result = render(parse(text));
  } catch {}
  return <span className="math-formula">{result}</span>;
}
