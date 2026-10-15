import { useState, useEffect, useRef } from "react";
import { ChevronDown, ArrowLeftRight } from "lucide-react";
import type { FunctionDefinition, GraphPoint } from "../types/function";
import { ALL_DOMAIN } from "../types/function";
import {
  composeFunctions,
  canonicalExpression,
} from "../services/functionContext";
import { transform, reflect } from "../services/transformEngine";
import { parseDomain } from "../services/expressionParser";
import { parseReflectionLine } from "../services/symmetryEngine";
import { formatDomain } from "../utils/formatMath";
import MathFormula from "./MathFormula";

type Props = {
  current: FunctionDefinition;
  functions: FunctionDefinition[];
  mode: string;
  open: boolean;
  preview: FunctionDefinition | null;
  comparison: string;
  onCompare: (key: string) => void;
  feedback: string;
  error: string;
  onSelect: (id: string) => void;
  onOpen: (mode: string) => void;
  onClose: () => void;
  onCancel: () => void;
  hidden: boolean;
  onPreview: (fn: FunctionDefinition) => void;
  onSave: () => void;
  onAction: (key: string, preview?: boolean) => void;
  onUpdate: (fn: FunctionDefinition) => void;
  onError: (message: string) => void;
  x0: number;
  onX0: (value: number) => void;
  second: string;
  onSecond: (id: string) => void;
  points: GraphPoint[];
  onPoints: (points: GraphPoint[]) => void;
  onRefs: (lines: { a: number; b: number; c: number }[]) => void;
};
const symmetries = [
  ["y", "Y 轴"],
  ["x", "X 轴"],
  ["origin", "原点"],
  ["diag", "y = x"],
  ["anti", "y = −x"],
];
export default function FunctionActions(props: Props) {
  const { current, functions, mode, open, preview } = props;
  const host = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const plot = host.current?.parentElement;
    if (!plot) return;
    const observer = new ResizeObserver(() =>
      setCompact(plot.clientHeight < 320),
    );
    observer.observe(plot);
    return () => observer.disconnect();
  }, []);
  const [sessions, setSessions] = useState<
    Record<
      string,
      {
        a: number;
        b: number;
        vertical: number;
        horizontal: number;
        partner: string;
        swapped: boolean;
        domain: string;
        line: string;
        symmetry: string;
      }
    >
  >({});
  const defaults = {
    a: 0,
    b: 0,
    vertical: 1,
    horizontal: 1,
    partner: "",
    swapped: false,
    domain: "",
    line: "y=x",
    symmetry: "",
  };
  const session = sessions[current.id] || defaults;
  const {
    a,
    b,
    vertical,
    horizontal,
    partner,
    swapped,
    domain,
    line,
    symmetry,
  } = session;
  const update = (patch: Partial<typeof session>) =>
    setSessions((old) => ({
      ...old,
      [current.id]: { ...(old[current.id] || defaults), ...patch },
    }));
  const setA = (a: number) => update({ a }),
    setB = (b: number) => update({ b });
  const setVertical = (vertical: number) => update({ vertical }),
    setHorizontal = (horizontal: number) => update({ horizontal });
  const setPartner = (partner: string) => update({ partner }),
    setSwapped = (swapped: boolean) => update({ swapped });
  const setDomain = (domain: string) => update({ domain }),
    setLine = (line: string) => update({ line });
  const skipSavedPreview = useRef<FunctionDefinition[] | null>(null);
  const analyzedSource = useRef<{
    source: FunctionDefinition;
    mode: string;
  } | null>(null);
  const mainModes = ["translate", "symmetry", "compose", "more"];
  const selectedMode = mainModes.includes(mode) ? mode : "more";
  const analysisOnly =
    [
      "parity",
      "roots",
      "intersections",
      "domain",
      "parameters",
      "history",
    ].includes(mode) ||
    (mode === "more" && !preview);
  const candidates = functions.filter((fn) => fn.kind === "function");
  const other =
    candidates.find((fn) => fn.id === partner) ||
    candidates.find((fn) => fn.id !== current.id) ||
    current;
  const outer = swapped ? other : current,
    inner = swapped ? current : other;
  const run = (task: () => void) => {
    try {
      task();
      props.onError("");
    } catch (e) {
      props.onError(e instanceof Error ? e.message : "请检查输入。");
    }
  };
  const composition = (nextOther = other, nextSwap = swapped) =>
    run(() =>
      props.onPreview(
        composeFunctions(
          nextSwap ? nextOther : current,
          nextSwap ? current : nextOther,
          functions,
        ),
      ),
    );
  function choose(next: string) {
    if (open && mode === next) return;
    props.onOpen(next);
  }
  useEffect(() => {
    if (!open || props.hidden) return;
    if (skipSavedPreview.current) {
      const saved = skipSavedPreview.current;
      skipSavedPreview.current = null;
      if (saved !== functions) return;
    }
    if (mode === "compose") composition();
    if (
      (mode === "parity" || mode === "roots") &&
      (analyzedSource.current?.source !== current ||
        analyzedSource.current.mode !== mode ||
        !props.feedback)
    ) {
      analyzedSource.current = { source: current, mode };
      props.onAction(mode);
    }
    if (mode === "translate" && (a !== 0 || b !== 0))
      run(() => props.onPreview(transform(current, "translate", a, b)));
    if (mode === "scale" && (vertical !== 1 || horizontal !== 1))
      run(() =>
        props.onPreview(transform(current, "scale", vertical, horizontal)),
      );
    if (mode === "symmetry" && symmetry) props.onAction(symmetry, true);
  }, [current, functions, open, mode, props.hidden]);
  const back = () => props.onOpen("more");
  const shift = (axis: "a" | "b", value: number) => {
    if (axis === "a") setA(value);
    else setB(value);
    run(() =>
      props.onPreview(
        transform(
          current,
          "translate",
          axis === "a" ? value : a,
          axis === "b" ? value : b,
        ),
      ),
    );
  };
  const stretch = (axis: "vertical" | "horizontal", value: number) => {
    if (axis === "vertical") setVertical(value);
    else setHorizontal(value);
    run(() =>
      props.onPreview(
        transform(
          current,
          "scale",
          axis === "vertical" ? value : vertical,
          axis === "horizontal" ? value : horizontal,
        ),
      ),
    );
  };
  let expanded = "";
  if (mode === "compose" && preview) {
    try {
      expanded = canonicalExpression(preview, 0, true, preview.variable || "x");
    } catch {}
  }
  return (
    <div
      ref={host}
      className={`function-actions ${open ? "open" : ""} ${compact ? "compact" : ""}`}
      aria-label="当前函数操作"
      hidden={props.hidden}
    >
      <div className="function-action-bar">
        <label className="action-target" style={{ color: current.color }}>
          <span>操作</span>
          <select
            aria-label="正在操作的函数"
            value={current.id}
            onChange={(e) => props.onSelect(e.target.value)}
          >
            {functions.map((fn) => (
              <option key={fn.id} value={fn.id}>
                {fn.kind === "function"
                  ? `${fn.alias}(${fn.variable || "x"})`
                  : fn.alias}
              </option>
            ))}
          </select>
        </label>
        {[
          ["translate", "平移"],
          ["symmetry", "对称"],
          ["compose", "复合"],
          ["more", "更多"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={open && selectedMode === key ? "active" : ""}
            aria-expanded={open && selectedMode === key}
            aria-pressed={open && selectedMode === key}
            disabled={
              current.kind === "relation" &&
              ["translate", "compose"].includes(key)
            }
            onClick={() => choose(key)}
          >
            {label}
          </button>
        ))}
        {
          <button
            className="action-collapse"
            onClick={props.onClose}
            aria-label="收起函数操作"
            title="收起工具，保留图像上的试调结果"
            disabled={!open}
          >
            <ChevronDown size={18} />
          </button>
        }
      </div>
      {open && (
        <div className="function-action-body" key={mode}>
          {!["translate", "symmetry", "compose", "more"].includes(mode) && (
            <button className="action-back" onClick={back}>
              ‹ 更多操作
            </button>
          )}
          {mode === "translate" && (
            <>
              <span className="action-description">
                拖动调节，虚线显示新函数
              </span>
              <Adjustment
                label="横向平移"
                value={a}
                min={-8}
                max={8}
                onChange={(value) => shift("a", value)}
              />
              <Adjustment
                label="纵向平移"
                value={b}
                min={-8}
                max={8}
                onChange={(value) => shift("b", value)}
              />
            </>
          )}
          {mode === "symmetry" && (
            <>
              <span className="action-description">
                选择对称轴，查看虚线结果
              </span>
              <div className="action-options">
                {symmetries.map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={symmetry === key}
                    className={symmetry === key ? "chosen" : ""}
                    onClick={() => {
                      update({ symmetry: key });
                      props.onAction(key, true);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          {mode === "compose" && (
            <div className="composition-controls">
              <label>
                另一个函数{" "}
                <select
                  aria-label="复合的另一个函数"
                  value={other.id}
                  onChange={(e) => {
                    setPartner(e.target.value);
                    const next = functions.find(
                      (fn) => fn.id === e.target.value,
                    )!;
                    composition(next);
                  }}
                >
                  {candidates.map((fn) => (
                    <option key={fn.id} value={fn.id}>
                      {fn.alias}({fn.variable || "x"}) = {fn.currentExpression}
                    </option>
                  ))}
                </select>
              </label>
              <div className="composition-order">
                <strong style={{ color: inner.color }}>
                  先算 {inner.alias}
                </strong>
                <span>→</span>
                <strong style={{ color: outer.color }}>
                  再算 {outer.alias}
                </strong>
                <button
                  onClick={() => {
                    setSwapped(!swapped);
                    composition(other, !swapped);
                  }}
                >
                  <ArrowLeftRight size={15} />
                  交换顺序
                </button>
              </div>
              {preview && (
                <div className="composition-formula">
                  <span>
                    {preview.alias}({preview.variable || "x"}) ={" "}
                  </span>
                  <MathFormula expression={preview.currentExpression} />
                  {expanded.length < 160 && (
                    <span className="composition-expanded">
                      = <MathFormula expression={expanded} />
                    </span>
                  )}
                </div>
              )}
              <small>修改来源时自动更新，删除来源时保留当前结果。</small>
            </div>
          )}
          {mode === "more" && (
            <div className="action-options more-options">
              <button onClick={() => choose("scale")}>伸缩</button>
              <button onClick={() => props.onAction("inverse", true)}>
                反函数
              </button>
              <button onClick={() => choose("absolute")}>绝对值</button>
              <button onClick={() => props.onAction("derivative", true)}>
                求导
              </button>
              <button onClick={() => choose("roots")}>零点</button>
              <button onClick={() => choose("intersections")}>交点</button>
              <button onClick={() => choose("differential")}>切线与法线</button>
              <button onClick={() => choose("domain")}>定义域</button>
              <button onClick={() => choose("parameters")}>变量与参数</button>
              <button onClick={() => choose("geometry")}>直线对称</button>
              <button onClick={() => choose("parity")}>奇偶性</button>
              <button onClick={() => choose("history")}>变换记录</button>
            </div>
          )}
          {mode === "scale" && (
            <>
              <Adjustment
                label="纵向倍数"
                value={vertical}
                min={-4}
                max={4}
                onChange={(value) => stretch("vertical", value)}
              />
              <Adjustment
                label="横向倍数"
                value={horizontal}
                min={-4}
                max={4}
                onChange={(value) => stretch("horizontal", value)}
              />
            </>
          )}
          {mode === "absolute" && (
            <div className="action-options">
              {[
                ["absY", "|f(x)|"],
                ["absX", "f(|x|)"],
                ["absBoth", "|f(|x|)|"],
                ["negAbs", "−|f(x)|"],
              ].map(([key, label]) => (
                <button key={key} onClick={() => props.onAction(key, true)}>
                  {label
                    .replaceAll("f", current.alias || "f")
                    .replaceAll("x", current.variable || "x")}
                </button>
              ))}
            </div>
          )}
          {mode === "domain" && (
            <div className="action-fields">
              <label>
                定义域{" "}
                <input
                  aria-label="定义域"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder={`${current.variable || "x"}≥0 或 -2≤${current.variable || "x"}≤5`}
                />
              </label>
              <small>当前：{formatDomain(current.domain)}</small>
              <div className="action-options">
                <button
                  disabled={current.locked || current.kind !== "function"}
                  onClick={() =>
                    run(() =>
                      props.onUpdate({
                        ...current,
                        domain: parseDomain(domain, current.variable || "x"),
                      }),
                    )
                  }
                >
                  应用定义域
                </button>
                <button
                  disabled={current.locked}
                  onClick={() =>
                    props.onUpdate({
                      ...current,
                      domain: { ...ALL_DOMAIN },
                      domainConstraints: undefined,
                    })
                  }
                >
                  恢复完整定义域
                </button>
              </div>
            </div>
          )}
          {mode === "parameters" && (
            <div className="action-fields">
              <label>
                横轴变量{" "}
                <select
                  aria-label="自变量"
                  value={current.variable || "x"}
                  disabled={current.locked}
                  onChange={(e) => {
                    const next = e.target.value,
                      parameters = { ...current.parameters };
                    delete parameters[next];
                    parameters[current.variable || "x"] = 1;
                    props.onUpdate({ ...current, variable: next, parameters });
                  }}
                >
                  {[
                    current.variable || "x",
                    ...Object.keys(current.parameters || {}),
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              {Object.entries(current.parameters || {}).map(([key, value]) => (
                <Adjustment
                  key={key}
                  label={`参数 ${key}`}
                  value={value}
                  min={Math.min(-10, value)}
                  max={Math.max(10, value)}
                  disabled={current.locked}
                  onChange={(v) =>
                    props.onUpdate({
                      ...current,
                      parameters: { ...current.parameters, [key]: v },
                    })
                  }
                />
              ))}
              {!Object.keys(current.parameters || {}).length && (
                <small>这个函数没有可调参数。</small>
              )}
            </div>
          )}
          {mode === "intersections" && (
            <div className="action-fields">
              <label>
                与谁求交点{" "}
                <select
                  aria-label="第二个函数"
                  value={props.second}
                  onChange={(e) => props.onSecond(e.target.value)}
                >
                  <option value="">选择另一函数</option>
                  {candidates
                    .filter((fn) => fn.id !== current.id)
                    .map((fn) => (
                      <option key={fn.id} value={fn.id}>
                        {fn.alias}({fn.variable || "x"})
                      </option>
                    ))}
                </select>
              </label>
              <button onClick={() => props.onAction("intersections")}>
                标出交点
              </button>
            </div>
          )}
          {mode === "differential" && (
            <div className="action-fields">
              <label>
                切点横坐标{" "}
                <input
                  type="number"
                  aria-label="切点横坐标"
                  step="0.1"
                  value={props.x0}
                  onChange={(e) => props.onX0(Number(e.target.value))}
                />
              </label>
              <div className="action-options">
                <button onClick={() => props.onAction("tangent", true)}>
                  切线
                </button>
                <button onClick={() => props.onAction("normal", true)}>
                  法线
                </button>
              </div>
            </div>
          )}
          {mode === "geometry" && (
            <div className="action-fields">
              <label>
                对称直线{" "}
                <input
                  aria-label="对称直线"
                  value={line}
                  onChange={(e) => setLine(e.target.value)}
                  placeholder="例如 x=2 或 y=x"
                />
              </label>
              <div className="action-options">
                <button
                  onClick={() =>
                    run(() => {
                      const l = parseReflectionLine(line);
                      props.onRefs([l]);
                      props.onPreview(reflect(current, l.a, l.b, l.c));
                    })
                  }
                >
                  查看镜像
                </button>
                <button
                  onClick={() =>
                    run(() => {
                      const p = props.points.at(-1);
                      if (!p) throw new Error("先长按画布添加一个观察点。");
                      if (props.points.length >= 5000)
                        throw new Error("观察点过多，请先清除部分标记。");
                      const l = parseReflectionLine(line);
                      const d =
                        (l.a * p.x + l.b * p.y + l.c) / (l.a * l.a + l.b * l.b);
                      props.onPoints([
                        ...props.points,
                        {
                          x: p.x - 2 * l.a * d,
                          y: p.y - 2 * l.b * d,
                          label: (p.label || "A") + "′",
                        },
                      ]);
                      props.onRefs([l]);
                    })
                  }
                >
                  反射最后一个点
                </button>
              </div>
            </div>
          )}
          {mode === "history" && (
            <div className="action-history">
              {current.transformHistory.length ? (
                current.transformHistory.map((item, index) => (
                  <p key={index}>
                    <strong>{item.label}</strong> · {item.explanation}
                  </p>
                ))
              ) : (
                <p>直接输入的函数，尚无变换记录。</p>
              )}
            </div>
          )}
          {mode === "parity" && (
            <div className="analysis-result">
              <strong>{current.alias} 的奇偶性</strong>
              <p role="status">{props.feedback}</p>
              <div className="action-options">
                <button
                  aria-pressed={props.comparison === "y"}
                  className={props.comparison === "y" ? "chosen" : ""}
                  onClick={() => props.onCompare("y")}
                >
                  对照 Y 轴对称
                </button>
                <button
                  aria-pressed={props.comparison === "origin"}
                  className={props.comparison === "origin" ? "chosen" : ""}
                  onClick={() => props.onCompare("origin")}
                >
                  对照原点对称
                </button>
              </div>
              <small>对照虚线仅用于观察，不进入函数列表。</small>
            </div>
          )}
          {mode === "roots" && (
            <div className="analysis-result">
              <strong>{current.alias} 的零点</strong>
              <p role="status">{props.feedback}</p>
              <button onClick={() => props.onAction("roots")}>
                按当前视野重新查找
              </button>
            </div>
          )}
          {props.error && (
            <p className="action-error" role="alert">
              {props.error}
            </p>
          )}
          {!props.error &&
            props.feedback &&
            !preview &&
            !["parity", "roots"].includes(mode) && (
              <p className="action-feedback" role="status">
                {props.feedback}
              </p>
            )}
        </div>
      )}
      {(open ||
        preview ||
        (["parity", "roots", "intersections"].includes(mode) &&
          !!props.feedback)) && (
        <div className="action-save">
          <span role="status" style={{ color: preview?.color }}>
            {props.comparison
              ? `对照虚线：${props.comparison === "y" ? "Y 轴镜像" : "原点镜像"}`
              : preview
                ? `虚线：${preview.alias}${preview.kind === "function" ? `(${preview.variable || "x"})` : ""}`
                : props.feedback || "选择选项或拖动调节"}
          </span>
          {analysisOnly ? (
            <button onClick={() => (open ? props.onClose() : choose(mode))}>
              {open ? "看图像" : "查看结果"}
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  if (mode === "translate") update({ a: 0, b: 0 });
                  if (mode === "scale") update({ vertical: 1, horizontal: 1 });
                  if (mode === "symmetry") update({ symmetry: "" });
                  props.onCancel();
                }}
              >
                取消
              </button>
              <button
                className="action-watch"
                onClick={() => (open ? props.onClose() : choose(mode))}
              >
                {open ? "看图像" : "继续调节"}
              </button>
              <button
                className="primary"
                disabled={!preview}
                onClick={() => {
                  skipSavedPreview.current = functions;
                  props.onSave();
                }}
              >
                添加为新函数
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
function Adjustment({
  label,
  value,
  min,
  max,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="action-adjustment">
      <span>{label}</span>
      <input
        aria-label={`${label} 滑块`}
        type="range"
        min={min}
        max={max}
        step="0.1"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        aria-label={label}
        type="number"
        step="0.1"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}
