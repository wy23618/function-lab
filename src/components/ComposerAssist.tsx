import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { MathInputAction } from "../utils/mathInput";
import MathFormula from "./MathFormula";

export const studyExamples = [
  ["三角", "sin(x)"],
  ["多项式", "x^3-3x"],
  ["指数", "e^x"],
  ["对数", "ln(1+x)"],
  ["竖线", "x=2"],
  ["反向直线", "x=2y+1"],
  ["横向抛物线", "x=y^2"],
  ["带参数", "a*sin(b*x)"],
  ["跳跃", "x<0 ? -1 : 2"],
  ["可去间断", "x==0 ? 2 : sin(x)/x"],
  ["无穷间断", "1/x"],
  ["可积奇点", "1/sqrt(abs(x))"],
  ["振荡", "sin(1/x)"],
  ["无穷积分", "exp(-x^2)"],
] as const;
export default function ComposerAssist({
  edit,
  onExpression,
}: {
  edit: (action: MathInputAction, touch: boolean) => void;
  onExpression: (text: string) => void;
}) {
  const [open, setOpen] = useState<"examples" | "piecewise" | null>(null);
  const assistRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent) => {
      if (!assistRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        assistRef.current
          ?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')
          ?.focus();
        setOpen(null);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const [left, setLeft] = useState("-1"),
    [right, setRight] = useState("2"),
    [split, setSplit] = useState("0"),
    [inclusive, setInclusive] = useState(false);
  const quick: [string, MathInputAction][] = [
    ["a/b", { type: "template", value: "($)/(1)", select: "1" }],
    ["x²", { type: "insert", value: "^2" }],
    ["√", { type: "wrap", prefix: "sqrt(", suffix: ")" }],
    ["sin", { type: "wrap", prefix: "sin(", suffix: ")" }],
    ["ln", { type: "wrap", prefix: "ln(", suffix: ")" }],
    ["π", { type: "insert", value: "π" }],
  ];
  return (
    <div className="composer-assist" ref={assistRef}>
      <div className="composer-shortcuts" aria-label="快捷数学输入">
        {quick.map(([title, action]) => (
          <button
            key={title}
            type="button"
            aria-label={`插入 ${title}`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => edit(action, false)}
          >
            {title}
          </button>
        ))}
        <button
          type="button"
          className={open === "examples" ? "active" : ""}
          aria-expanded={open === "examples"}
          onClick={() => setOpen(open === "examples" ? null : "examples")}
        >
          例题
          <ChevronDown size={11} />
        </button>
        <button
          type="button"
          className={open === "piecewise" ? "active" : ""}
          aria-expanded={open === "piecewise"}
          onClick={() => setOpen(open === "piecewise" ? null : "piecewise")}
        >
          分段
        </button>
      </div>
      {open && (
        <div className="composer-library">
          <div className="composer-library-heading">
            <strong>
              {open === "examples" ? "点选公式即可编辑" : "分段函数"}
            </strong>
            <button
              type="button"
              aria-label="关闭输入辅助"
              onClick={() => setOpen(null)}
            >
              <X size={14} />
            </button>
          </div>
          {open === "examples" ? (
            <div className="composer-example-list">
              {studyExamples.map(([name, expression], i) => (
                <Fragment key={expression}>
                  {(i === 0 || i === 4 || i === 8) && (
                    <strong className="example-group">
                      {i === 0
                        ? "常见函数"
                        : i === 4
                          ? "方程与参数"
                          : "间断与反常积分"}
                    </strong>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onExpression(expression);
                      setOpen(null);
                    }}
                  >
                    <span>{name}</span>
                    <MathFormula expression={expression} />
                  </button>
                </Fragment>
              ))}
            </div>
          ) : (
            <div className="piecewise-builder">
              <label>
                分界点
                <input
                  aria-label="分段分界点"
                  value={split}
                  onChange={(e) => setSplit(e.target.value)}
                />
              </label>
              <label>
                左段 f(x)
                <input
                  aria-label="分段左式"
                  value={left}
                  onChange={(e) => setLeft(e.target.value)}
                />
              </label>
              <label>
                右段 f(x)
                <input
                  aria-label="分段右式"
                  value={right}
                  onChange={(e) => setRight(e.target.value)}
                />
              </label>
              <label className="piecewise-inclusive">
                <input
                  type="checkbox"
                  checked={inclusive}
                  onChange={(e) => setInclusive(e.target.checked)}
                />
                分界点归左段
              </label>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  onExpression(
                    `x${inclusive ? "<=" : "<"}(${split}) ? (${left}) : (${right})`,
                  );
                  setOpen(null);
                }}
              >
                使用这个分段函数
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
