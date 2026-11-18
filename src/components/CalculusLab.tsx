import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pause,
  Play,
  Move,
  MousePointer2,
  Minus,
  Plus,
  Maximize2,
  Scan,
  Ellipsis,
  SlidersHorizontal,
  X,
  ArrowRight,
  BookmarkPlus,
} from "lucide-react";
import type {
  FunctionDefinition,
  GraphPoint,
  Viewport,
} from "../types/function";
import { evaluateFunction, sampleFunction } from "../services/functionSampler";
import { slope } from "../services/analysisEngine";
import {
  constantValue,
  derivativeChain,
  integralCurve,
  integrate,
  taylorExpansion,
  functionIntegrand,
  taylorAgreement,
} from "../services/calculusEngine";
import {
  calculusCoordinates,
  graphInCoordinates,
  integralPointRelation,
  taylorPolynomial,
} from "../services/calculusRelations";
import type { CalculusDecoration } from "../services/calculusDrawing";
import {
  calculusWorkspaceKey,
  loadCalculusWorkspace,
} from "../services/calculusWorkspace";
import { fitGraphViewport, fitSampledViewport } from "../utils/fitViewport";
import type { WorkspaceMode } from "./WorkspaceTabs";
import GraphCanvas from "./GraphCanvas";
import MathFormula from "./MathFormula";

const blue = "#3478c5",
  green = "#168b74",
  orange = "#d4773e",
  muted = "#99acb9";
const noLines: { a: number; b: number; c: number }[] = [];
const noPoints: GraphPoint[] = [];
const fmt = (n: number) =>
  Number.isFinite(n) ? Number(n.toPrecision(6)).toString() : "未定义";
const rounded = (n: number) => Number(n.toPrecision(6));
const derivativeName = (n: number) =>
  n === 0 ? "f" : n === 1 ? "f′" : n === 2 ? "f″" : `f⁽${n}⁾`;
function IntegralNotation({ upper }: { upper: string }) {
  return (
    <span className="bound-integral">
      <span className="integral-sign">∫</span>
      <span className="integral-bounds">
        <sup>{upper}</sup>
        <sub>a</sub>
      </span>
      <i>f(t)dt</i>
    </span>
  );
}
function Stepper({
  value,
  onChange,
  min,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  label: string;
}) {
  return (
    <div className="order-stepper">
      <button
        aria-label={`${label}减一阶`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={14} />
      </button>
      <label>
        <input
          type="number"
          min={min}
          max={12}
          value={value}
          aria-label={label}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= min && n <= 12) onChange(n);
          }}
        />
        <span>阶</span>
      </label>
      <button
        aria-label={`${label}加一阶`}
        disabled={value >= 12}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
export default function CalculusLab({
  current,
  mode,
  viewport,
  onViewport,
  onSave,
  onFullscreen,
  operationError,
}: {
  current?: FunctionDefinition;
  mode: Exclude<WorkspaceMode, "graph">;
  viewport: Viewport;
  onViewport: (v: Viewport) => void;
  onSave: (fn: FunctionDefinition) => boolean;
  onFullscreen: () => void;
  operationError?: string;
}) {
  const [restored] = useState(loadCalculusWorkspace);
  const [order, setOrder] = useState(Math.max(1, restored.order)),
    [degree, setDegree] = useState(restored.degree);
  const [aText, setA] = useState(restored.aText),
    [bText, setB] = useState(restored.bText),
    [constantText, setConstant] = useState(restored.constantText),
    [breakText, setBreaks] = useState(restored.breakText);
  const [centerText, setCenter] = useState(restored.centerText),
    [tolerance, setTolerance] = useState(restored.tolerance),
    [queries, setQueries] = useState(restored.queries);
  const [point, setPoint] = useState(restored.x),
    [definite, setDefinite] = useState(restored.definite),
    [allOrders, setAllOrders] = useState(false);
  const [pointText, setPointText] = useState(String(restored.x)),
    [editingPoint, setEditingPoint] = useState(false);
  const [pan, setPan] = useState(false),
    [playing, setPlaying] = useState(false),
    [details, setDetails] = useState(false),
    [saved, setSaved] = useState("");
  const plotRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const measure = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  const stateRef = useRef({});
  stateRef.current = {
    mode,
    order,
    degree,
    aText,
    bText,
    constantText,
    breakText,
    centerText,
    tolerance,
    queries,
    x: point,
    definite,
  };
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(
          calculusWorkspaceKey,
          JSON.stringify(stateRef.current),
        );
      } catch {
        /* storage may be full */
      }
    };
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          calculusWorkspaceKey,
          JSON.stringify(stateRef.current),
        );
      } catch {
        /* storage may be full */
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [
    mode,
    order,
    degree,
    aText,
    bText,
    constantText,
    breakText,
    centerText,
    tolerance,
    queries,
    point,
    definite,
  ]);
  useEffect(() => {
    if (!details) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetails(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [details]);
  const coordinates = useMemo(() => {
    try {
      return {
        value: current ? calculusCoordinates(current) : undefined,
        error: current ? "" : "先在左侧输入或选择一个函数。",
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [current]);
  const source = coordinates.value?.body,
    axis = coordinates.value?.axis ?? "x",
    variable = source?.variable || axis;
  const f = useMemo(
    () => (source ? functionIntegrand(source) : () => NaN),
    [source],
  );
  const range = useMemo(() => {
    const middle = axis === "x" ? viewport.cx : viewport.cy,
      half = (axis === "x" ? size.width : size.height) / viewport.scale / 2;
    return { min: middle - half, max: middle + half };
  }, [axis, viewport, size]);
  const config = useMemo(() => {
    try {
      if (mode === "taylor" && constantValue(tolerance) <= 0)
        throw new Error("贴合容差请输入正数。");
      return {
        a: mode === "integral" ? constantValue(aText, true) : 0,
        b: mode === "integral" && definite ? constantValue(bText, true) : 0,
        c: mode === "integral" ? constantValue(constantText) : 0,
        center: mode === "taylor" ? constantValue(centerText) : 0,
        tol: mode === "taylor" ? constantValue(tolerance) : 0.001,
        breaks:
          mode === "integral"
            ? breakText
                .split(/[,，;；\s]+/)
                .filter(Boolean)
                .map((t) => constantValue(t))
            : [],
      };
    } catch (e) {
      return {
        a: 0,
        b: 0,
        c: 0,
        center: 0,
        tol: 0.001,
        breaks: [],
        error: (e as Error).message,
      };
    }
  }, [
    mode,
    aText,
    bText,
    definite,
    constantText,
    centerText,
    tolerance,
    breakText,
  ]);
  const derivatives = useMemo(() => {
    try {
      return {
        chain:
          source && mode === "derivative" ? derivativeChain(source, order) : [],
      };
    } catch (e) {
      return { chain: [], error: (e as Error).message };
    }
  }, [source, mode, order]);
  const taylor = useMemo(() => {
    try {
      return source && mode === "taylor" && !config.error
        ? {
            value: taylorExpansion(source, config.center, degree),
            polynomial: taylorPolynomial(source, config.center, degree),
          }
        : {};
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [source, mode, config.center, config.error, degree]);
  const previous = order === 1 ? source : derivatives.chain[order - 2],
    nth = derivatives.chain[order - 1];
  const comparison = useMemo(() => {
    if (!source || mode !== "taylor" || !details || config.error)
      return undefined;
    try {
      return taylorExpansion(source, config.center, 12);
    } catch {
      return undefined;
    }
  }, [source, mode, details, config.center, config.error]);
  const plots = useMemo(() => {
    if (!source) return [];
    const raw = {
      ...source,
      id: "study-source",
      color: blue,
      visible: true,
      lineStyle: "solid" as const,
    };
    const bodies: FunctionDefinition[] = [raw];
    if (mode === "derivative" && nth) {
      if (allOrders)
        derivatives.chain.forEach((fn, i) =>
          bodies.push({
            ...fn,
            color: i === order - 1 ? orange : i === order - 2 ? green : muted,
            visible: true,
          }),
        );
      else {
        if (order > 1 && previous)
          bodies.push({ ...previous, color: green, visible: true });
        bodies.push({ ...nth, color: orange, visible: true });
      }
    }
    if (mode === "taylor" && taylor.polynomial)
      bodies.push({ ...taylor.polynomial, color: orange, visible: true });
    return bodies.map((fn, index) =>
      graphInCoordinates(
        {
          ...fn,
          lineStyle: mode === "derivative" && index > 0 ? "dashed" : "solid",
        },
        axis,
      ),
    );
  }, [
    source,
    mode,
    nth,
    previous,
    order,
    allOrders,
    derivatives.chain,
    taylor.polynomial,
    axis,
  ]);
  const integralSegments = useMemo(
    () =>
      mode === "integral" && source && !config.error
        ? integralCurve(
            f,
            config.a,
            range.min,
            range.max,
            config.breaks,
            config.c,
          )
        : [],
    [mode, source, f, config, range],
  );
  const sourceSegments = useMemo(
    () =>
      source && mode === "integral"
        ? sampleFunction(source, range.min, range.max, 650)
        : [],
    [source, mode, range],
  );
  const relation = useMemo(
    () =>
      mode === "integral" && source && !config.error
        ? integralPointRelation(
            source,
            config.a,
            point,
            config.breaks,
            config.c,
          )
        : undefined,
    [mode, source, config, point],
  );
  const total = useMemo(
    () =>
      mode === "integral" && source && !config.error
        ? integrate(f, config.a, definite ? config.b : point, config.breaks)
        : undefined,
    [mode, source, f, config, definite, point],
  );
  const agreement = useMemo(
    () =>
      taylor.value
        ? taylorAgreement(
            f,
            taylor.value.evaluate,
            config.center,
            range.min,
            range.max,
            config.tol,
          )
        : null,
    [taylor.value, f, config.center, config.tol, range],
  );
  const sourceValue = f(point),
    previousValue = previous ? evaluateFunction(previous, point) : NaN,
    nthValue = nth ? evaluateFunction(nth, point) : NaN;
  const tangent = previous ? slope(previous, point) : NaN,
    polynomialValue = taylor.value?.evaluate(point) ?? NaN;
  const error =
    coordinates.error ||
    config.error ||
    derivatives.error ||
    taylor.error ||
    operationError;
  const decoration = useMemo<CalculusDecoration>(() => {
    const points: NonNullable<CalculusDecoration["probe"]>["points"] = [
      { y: f(point), color: blue },
    ];
    if (mode === "derivative" && previous && nth) {
      points.length = 0;
      points.push(
        {
          y: evaluateFunction(previous, point),
          color: order === 1 ? blue : green,
          slope: slope(previous, point),
        },
        { y: evaluateFunction(nth, point), color: orange },
      );
    }
    if (mode === "integral" && relation) {
      points.push({
        y: relation.value,
        color: green,
        slope: relation.slope,
        leftSlope: relation.leftSlope,
        rightSlope: relation.rightSlope,
      });
      const behavior = relation.behavior;
      if (behavior.kind === "可去间断")
        points.push({
          y: (behavior.left + behavior.right) / 2,
          color: blue,
          open: true,
        });
      if (behavior.kind === "跳跃间断") {
        for (const y of [behavior.left, behavior.right])
          if (Math.abs(y - f(point)) > 1e-6 || !Number.isFinite(f(point)))
            points.push({ y, color: blue, open: true });
      }
    }
    if (mode === "taylor" && taylor.value)
      points.push({ y: taylor.value.evaluate(point), color: orange });
    return {
      axis,
      curves:
        mode === "integral"
          ? [{ segments: integralSegments, color: green }]
          : [],
      area:
        mode === "integral" && total?.status === "stable"
          ? {
              segments: sourceSegments,
              from: config.a,
              to: definite ? config.b : point,
            }
          : undefined,
      band: mode === "taylor" ? (agreement ?? undefined) : undefined,
      probe: { x: point, points },
    };
  }, [
    f,
    point,
    mode,
    previous,
    nth,
    order,
    relation,
    taylor.value,
    axis,
    integralSegments,
    sourceSegments,
    total?.status,
    config.a,
    config.b,
    definite,
    agreement,
  ]);
  const world = (independent: number, value: number) =>
    axis === "x" ? { x: independent, y: value } : { x: value, y: independent };
  const handles = [];
  if (mode === "taylor" && Number.isFinite(f(config.center)))
    handles.push({
      id: "center",
      point: world(config.center, f(config.center)),
      axis,
      color: orange,
      label: `${variable}₀`,
      onChange: (value: number) => {
        setCenter(String(rounded(value)));
        setPlaying(false);
      },
    });
  if (mode === "integral") {
    if (Number.isFinite(config.a))
      handles.push({
        id: "a",
        point: world(config.a, 0),
        axis,
        color: green,
        label: "a",
        onChange: (value: number) => {
          setA(String(rounded(value)));
          setPlaying(false);
        },
      });
    if (definite && Number.isFinite(config.b))
      handles.push({
        id: "b",
        point: world(config.b, 0),
        axis,
        color: orange,
        label: "b",
        onChange: (value: number) => {
          setB(String(rounded(value)));
          setPlaying(false);
        },
      });
  }
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now(),
        delta = ((now - last) / 14000) * (range.max - range.min);
      last = now;
      setPoint((p) => (p + delta > range.max ? range.min : p + delta));
    }, 40);
    return () => clearInterval(id);
  }, [playing, range]);
  const trace = (value: number) => {
    setPoint(rounded(value));
    setEditingPoint(false);
    setPlaying(false);
  };
  const fitStudy = () => {
    let next = fitGraphViewport(
      plots,
      size,
      mode === "taylor" ? config.center : 0,
    );
    if (next && mode === "integral" && source && !config.error) {
      const middle = axis === "x" ? next.cx : next.cy,
        half = (axis === "x" ? size.width : size.height) / next.scale / 2;
      const dependent = axis === "x" ? next.cy : next.cx,
        dependentHalf =
          (axis === "x" ? size.height : size.width) / next.scale / 2;
      const visible = sampleFunction(source, middle - half, middle + half, 300)
        .flat()
        .filter((p) => Math.abs(p.y - dependent) <= dependentHalf);
      const min =
          visible.length > 1
            ? Math.min(...visible.map((p) => p.x))
            : middle - half,
        max =
          visible.length > 1
            ? Math.max(...visible.map((p) => p.x))
            : middle + half;
      const raw = sampleFunction(source, min, max, 200).flat(),
        accumulated = integralCurve(
          f,
          config.a,
          min,
          max,
          config.breaks,
          config.c,
        ).flat();
      if (accumulated.length > 1)
        next =
          fitSampledViewport(
            [raw, accumulated].map((curve) =>
              curve.map((p) => (axis === "y" ? { x: p.y, y: p.x } : p)),
            ),
            size,
          ) || next;
    }
    if (next) onViewport(next);
  };
  const fitRef = useRef(fitStudy);
  fitRef.current = fitStudy;
  useEffect(() => {
    fitRef.current();
  }, [
    mode,
    order,
    current?.id,
    current?.currentExpression,
    size.width,
    size.height,
  ]);
  const saveLayer = () => {
    if (!current || !source) return;
    const body = mode === "derivative" ? nth : taylor.polynomial;
    if (!body) return;
    const success = onSave({
      ...graphInCoordinates(body, axis),
      id: crypto.randomUUID(),
      alias: undefined,
      name:
        mode === "derivative"
          ? `${order} 阶导数`
          : `${degree} 阶泰勒 · ${variable}₀=${centerText}`,
      color: orange,
      visible: true,
      lineStyle: mode === "derivative" ? "dashed" : "solid",
      calculusLink: {
        kind: mode === "derivative" ? "derivative" : "taylor",
        sourceId: current.id,
        order: mode === "derivative" ? order : degree,
        ...(mode === "taylor" ? { center: config.center } : {}),
      },
    });
    if (success) setSaved("已加入函数列表，跟随原函数更新");
  };
  let insight = "";
  if (mode === "derivative")
    insight = `${derivativeName(order - 1)} 的切线斜率，对应 ${derivativeName(order)} 的函数值。${Number.isFinite(tangent) && Number.isFinite(nthValue) ? `此处两者都是 ${fmt(nthValue)}。` : "此处导数未定义，不绘制切线。"}`;
  if (mode === "taylor")
    insight = agreement
      ? `浅绿区域内，当前采样误差 ≤ ${tolerance}。拖动 ${variable}₀ 换展开点，增加阶数观察贴合范围。`
      : `增加阶数观察误差；展开点必须有相应阶导数。`;
  if (mode === "integral" && relation) {
    const kind = relation.behavior.kind;
    insight =
      kind === "连续"
        ? `拖动 a 改变积分起点。蓝色高度 f(${variable}) 等于绿色切线斜率 F′(${variable})。`
        : kind === "跳跃间断"
          ? `跳跃点：F 的左右斜率分别为 ${fmt(relation.leftSlope)}、${fmt(relation.rightSlope)}，两者不同，F 在这里不可导。`
          : kind === "可去间断"
            ? `可去间断：单点函数值不改变积分。F′ 取两侧共同极限 ${fmt(relation.slope)}，不一定等于 f 在该点的值。`
            : Number.isFinite(relation.slope)
              ? `振荡间断：此例的积分函数在 0 处仍可导，F′(0)=0。`
              : "此处有奇点或振荡。有限数值截断不能证明收敛；查看分析中的单侧截断结果。";
    if (total?.status === "unresolved")
      insight =
        "当前区间未确认收敛，已隐藏积分值和面积阴影。可在「分析」查看分段结果。";
    else if (!Number.isFinite(relation.value))
      insight = "从下限 a 到当前观察点的累积积分不可用，此处没有绿色切线。";
  }
  const relationLabel =
    relation && Number.isFinite(relation.value)
      ? relation.behavior.kind === "连续"
        ? "= F′"
        : relation.behavior.kind === "可去间断"
          ? "极限 → F′"
          : relation.behavior.kind === "跳跃间断"
            ? "左右斜率"
            : undefined
      : undefined;
  return (
    <div className={`study-studio study-${mode}`}>
      <div className="study-bar">
        <div className="study-source">
          <span>
            {current?.id === "draft" ? "输入预览" : "正在研究"}
            {axis === "y" ? " · 以 y 为自变量" : ""}
          </span>
          <MathFormula expression={current?.currentExpression || "f(x)"} />
        </div>
        <div className="study-controls">
          {mode === "derivative" && (
            <Stepper
              value={order}
              onChange={setOrder}
              min={1}
              label="求导阶数"
            />
          )}
          {mode === "integral" && (
            <>
              <label
                className="compact-field"
                title="a 是积分起点；拖动图上的 a 或直接输入数值。"
              >
                <span>起点 a</span>
                <input
                  aria-label="积分下限 a"
                  value={aText}
                  onChange={(e) => setA(e.target.value)}
                />
              </label>
              <button
                className={`bound-toggle ${definite ? "active" : ""}`}
                aria-pressed={definite}
                onClick={() => setDefinite(!definite)}
              >
                {definite ? "定积分" : "变上限"}
              </button>
              {definite && (
                <label className="compact-field">
                  <span>上限 b</span>
                  <input
                    aria-label="积分上限 b"
                    value={bText}
                    onChange={(e) => setB(e.target.value)}
                  />
                </label>
              )}
            </>
          )}
          {mode === "taylor" && (
            <>
              <label className="compact-field">
                <span>{variable}₀</span>
                <input
                  aria-label="泰勒展开点"
                  value={centerText}
                  onChange={(e) => setCenter(e.target.value)}
                  onBlur={() => fitRef.current()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              </label>
              <Stepper
                value={degree}
                onChange={setDegree}
                min={0}
                label="泰勒阶数"
              />
            </>
          )}
          <button
            className={`study-detail-button ${details ? "active" : ""}`}
            aria-label="分析"
            aria-expanded={details}
            onClick={() => setDetails(!details)}
          >
            <SlidersHorizontal size={15} />
            <span>分析</span>
          </button>
        </div>
      </div>
      <div className="study-plot" ref={plotRef}>
        <GraphCanvas
          functions={plots}
          hideSelection
          showCurveLabels={false}
          sampleCount={mode === "derivative" && order > 7 ? 350 : 700}
          viewport={viewport}
          onViewportChange={onViewport}
          grid
          axes
          ticks
          points={noPoints}
          onPoint={() => {}}
          referenceLines={noLines}
          calculus={decoration}
          handles={handles}
          traceAxis={axis}
          onTrace={pan ? undefined : trace}
        />
        <div className="study-legend">
          <span style={{ color: blue }}>f({variable})</span>
          {mode === "derivative" && order > 1 && (
            <span className="dashed-legend" style={{ color: green }}>
              {derivativeName(order - 1)}({variable})
            </span>
          )}
          <span
            className={mode === "derivative" ? "dashed-legend" : undefined}
            style={{ color: mode === "integral" ? green : orange }}
          >
            {mode === "derivative" ? (
              `${derivativeName(order)}(${variable})`
            ) : mode === "integral" ? (
              <>
                F({variable}) = C + <IntegralNotation upper={variable} />
              </>
            ) : (
              `T${degree}(${variable})`
            )}
          </span>
        </div>
        <div className="study-plot-tools" aria-label="图像工具">
          <button
            aria-label={pan ? "切换为沿曲线观察" : "切换为平移画布"}
            title={pan ? "返回沿曲线观察" : "平移画布"}
            aria-pressed={pan}
            className={pan ? "active" : ""}
            onClick={() => setPan(!pan)}
          >
            {pan ? <Move size={17} /> : <MousePointer2 size={17} />}
          </button>
          <details
            className="study-view-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary aria-label="更多视图工具" title="更多视图工具">
              <Ellipsis size={18} />
            </summary>
            <div className="study-view-options">
              <button
                aria-label="放大研究图像"
                onClick={() =>
                  onViewport({
                    ...viewport,
                    scale: Math.min(100000, viewport.scale * 1.3),
                  })
                }
              >
                <Plus size={15} />
                <span>放大</span>
              </button>
              <button
                aria-label="缩小研究图像"
                onClick={() =>
                  onViewport({
                    ...viewport,
                    scale: Math.max(1e-12, viewport.scale / 1.3),
                  })
                }
              >
                <Minus size={15} />
                <span>缩小</span>
              </button>
              <button aria-label="适应研究图像" onClick={fitStudy}>
                <Scan size={15} />
                <span>适应图像</span>
              </button>
              <button aria-label="全屏研究图像" onClick={onFullscreen}>
                <Maximize2 size={15} />
                <span>全屏</span>
              </button>
            </div>
          </details>
        </div>
        <div className="study-gesture">
          {pan ? "拖动画布平移" : "沿曲线拖动观察"}
          <span className="gesture-desktop"> · Shift 拖动平移</span>
          <span className="gesture-touch"> · 双指缩放</span>
        </div>
        {error && (
          <div className="study-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="study-bottom">
        <div className="study-readout" aria-live="off">
          {mode === "derivative" && (
            <>
              <div style={{ color: order === 1 ? blue : green }}>
                <span>
                  {derivativeName(order - 1)}({fmt(point)})
                </span>
                <strong>{fmt(previousValue)}</strong>
              </div>
              <div className="readout-link">
                <span>切线斜率</span>
                <b>
                  {fmt(tangent)} <ArrowRight size={14} />
                </b>
              </div>
              <div style={{ color: orange }}>
                <span>
                  {derivativeName(order)}({fmt(point)})
                </span>
                <strong>{fmt(nthValue)}</strong>
              </div>
            </>
          )}
          {mode === "integral" && (
            <>
              <div style={{ color: blue }}>
                <span>
                  f({fmt(point)}){" "}
                  {relationLabel && <small>{relationLabel}</small>}
                </span>
                <strong>{fmt(sourceValue)}</strong>
              </div>
              <div style={{ color: green }}>
                <span>F({fmt(point)})</span>
                <strong>{fmt(relation?.value ?? NaN)}</strong>
              </div>
              <div className="area-value">
                <span>
                  <IntegralNotation upper={definite ? "b" : variable} />
                </span>
                <strong>{fmt(total?.value ?? NaN)}</strong>
              </div>
            </>
          )}
          {mode === "taylor" && (
            <>
              <div style={{ color: blue }}>
                <span>f({fmt(point)})</span>
                <strong>{fmt(sourceValue)}</strong>
              </div>
              <div style={{ color: orange }}>
                <span>
                  T{degree}({fmt(point)})
                </span>
                <strong>{fmt(polynomialValue)}</strong>
              </div>
              <div className="error-value">
                <span>绝对误差</span>
                <strong>
                  {Number.isFinite(sourceValue - polynomialValue)
                    ? Math.abs(sourceValue - polynomialValue).toExponential(2)
                    : "未定义"}
                </strong>
              </div>
            </>
          )}
          {mode !== "integral" && (
            <button
              className="save-layer"
              disabled={!!error}
              title={saved || "加入函数列表，跟随原函数更新"}
              aria-label="保存当前研究曲线"
              onClick={saveLayer}
            >
              <BookmarkPlus size={17} />
              <span>{saved ? "已保存" : "保留曲线"}</span>
            </button>
          )}
        </div>
        <div className="study-scrubber">
          <button
            aria-label={playing ? "暂停观察动画" : "播放观察动画"}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <label className="probe-field">
            <span>{variable} =</span>
            <input
              type="text"
              aria-label="观察点数值"
              title="支持 pi/2 等常数，回车完成输入"
              value={editingPoint ? pointText : String(rounded(point))}
              onFocus={() => {
                setPointText(String(rounded(point)));
                setEditingPoint(true);
              }}
              onBlur={() => setEditingPoint(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              onChange={(e) => {
                setEditingPoint(true);
                setPointText(e.target.value);
                setPlaying(false);
                try {
                  setPoint(constantValue(e.target.value));
                } catch {
                  /* keep the last valid point while typing */
                }
              }}
            />
          </label>
          <input
            type="range"
            aria-label="观察点滑块"
            min={range.min}
            max={range.max}
            step={(range.max - range.min) / 1600}
            value={Math.max(range.min, Math.min(range.max, point))}
            onChange={(e) => trace(Number(e.target.value))}
          />
        </div>
        <p className="study-insight" role="status">
          {error || insight}
        </p>
      </div>
      {details && (
        <>
          <button
            className="study-scrim"
            aria-label="关闭分析面板"
            onClick={() => setDetails(false)}
          />
          <aside className="study-drawer" aria-label="研究分析">
            <header>
              <div>
                <span>进一步研究</span>
                <h3>
                  {mode === "derivative"
                    ? "逐阶看清变化"
                    : mode === "integral"
                      ? "面积、斜率与收敛"
                      : "从局部走向逼近"}
                </h3>
              </div>
              <button
                aria-label="收起研究分析"
                onClick={() => setDetails(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="study-drawer-content">
              {(mode === "taylor" || mode === "derivative") && (
                <label className="degree-slider">
                  <span>
                    快速换阶 · {mode === "taylor" ? degree : order} 阶
                  </span>
                  <input
                    aria-label={
                      mode === "taylor" ? "泰勒阶数滑块" : "求导阶数滑块"
                    }
                    type="range"
                    min={mode === "taylor" ? 0 : 1}
                    max={12}
                    value={mode === "taylor" ? degree : order}
                    onChange={(e) =>
                      (mode === "taylor" ? setDegree : setOrder)(
                        Number(e.target.value),
                      )
                    }
                  />
                </label>
              )}
              {mode === "derivative" && (
                <>
                  <p>
                    第 n 阶导数，是第 n−1
                    阶函数的变化率。点击某一阶，把它设为当前观察对象。
                  </p>
                  <label className="study-check">
                    <input
                      type="checkbox"
                      checked={allOrders}
                      onChange={(e) => setAllOrders(e.target.checked)}
                    />
                    叠加所有低阶导数
                  </label>
                  <div className="order-list">
                    {[source, ...derivatives.chain]
                      .filter((fn): fn is FunctionDefinition => !!fn)
                      .map((fn, i) => (
                        <button
                          className={i === order ? "active" : ""}
                          key={i}
                          disabled={i === 0}
                          onClick={() => setOrder(i)}
                        >
                          <span>
                            {derivativeName(i)}({variable})
                          </span>
                          <MathFormula expression={fn.currentExpression} />
                          <small>{fmt(evaluateFunction(fn, point))}</small>
                        </button>
                      ))}
                  </div>
                  <p className="study-note">
                    支持 1–12
                    阶符号求导。定义域与逐阶可导条件随原函数保留；原函数在尖点不可导时，不会补出一条假导数。
                  </p>
                </>
              )}
              {mode === "integral" && (
                <>
                  <label className="drawer-field">
                    积分常数 C
                    <input
                      aria-label="积分常数 C"
                      value={constantText}
                      onChange={(e) => setConstant(e.target.value)}
                    />
                  </label>
                  <label className="drawer-field">
                    分割点（用逗号分隔）
                    <input
                      aria-label="积分分割点"
                      value={breakText}
                      onChange={(e) => setBreaks(e.target.value)}
                    />
                  </label>
                  <p>
                    F({variable}) = C + ∫ₐ{variable}{" "}
                    f(t)dt。面积和积分函数共用同一个下限 a；上下限可输入
                    ±∞。拖动图中的 a、b 圆点即可改变区间。
                  </p>
                  <div className="signed-area-key">
                    <span>绿色 · 函数在轴上方</span>
                    <span>橙色 · 函数在轴下方</span>
                  </div>
                  <p className="study-note">
                    阴影按函数正负着色；上限小于下限时，积分方向反转。定积分区间保持固定，观察点仍可独立移动。
                  </p>
                  <h4>
                    {total?.status === "stable"
                      ? "数值结果稳定"
                      : "尚未确认收敛"}
                  </h4>
                  <p>
                    数值稳定是截断与误差检验结果，不是一般函数的收敛证明。内部奇点左右分别检查；普通反常积分与柯西主值分开处理。
                  </p>
                  {total && (
                    <>
                      <table>
                        <thead>
                          <tr>
                            <th>分段区间</th>
                            <th>结果</th>
                          </tr>
                        </thead>
                        <tbody>
                          {total.pieces.map((p, i) => (
                            <tr key={i}>
                              <td>
                                [{String(p.from)}, {String(p.to)}]
                              </td>
                              <td>
                                {p.status === "stable"
                                  ? fmt(p.value)
                                  : "未确认收敛"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!!total.rows.length && (
                        <details>
                          <summary>查看截断过程</summary>
                          <table>
                            <tbody>
                              {total.rows.map((row, i) => (
                                <tr key={i}>
                                  <td>{row.step}</td>
                                  <td>{fmt(row.value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </details>
                      )}
                    </>
                  )}
                </>
              )}
              {mode === "taylor" && (
                <>
                  <label className="drawer-field">
                    贴合容差
                    <input
                      aria-label="泰勒误差容差"
                      value={tolerance}
                      onChange={(e) => setTolerance(e.target.value)}
                    />
                  </label>
                  <p>
                    当前是 {degree} 阶多项式，
                    {taylor.value?.coefficients.filter((c) => c !== 0).length ??
                      0}{" "}
                    个数值非零项（幂次 0 到 {degree}
                    ，零系数项省略）。浅绿带显示从展开点向两侧、采样误差不超过容差的连续范围。
                  </p>
                  {agreement && (
                    <div className="agreement-range">
                      约 [{fmt(agreement.min)}, {fmt(agreement.max)}]
                    </div>
                  )}
                  <p className="study-note">
                    这是当前视窗内的采样估计，不能证明整段误差上界，也不代表泰勒级数的收敛区间。离开收敛范围时，继续增加阶数也可能更差。
                  </p>
                  {taylor.value && (
                    <details>
                      <summary>展开式与系数</summary>
                      <MathFormula expression={taylor.value.expression} />
                      <table>
                        <thead>
                          <tr>
                            <th>幂次 k</th>
                            <th>f⁽ᵏ⁾({centerText}) / k!</th>
                          </tr>
                        </thead>
                        <tbody>
                          {taylor.value.coefficients.map((v, i) => (
                            <tr key={i}>
                              <td>{i}</td>
                              <td>{fmt(v)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                  {comparison && (
                    <details open>
                      <summary>
                        在 {variable}={fmt(point)}，需要展开到几阶？
                      </summary>
                      <p>这里只比较当前点，不能据此判断整段贴合。</p>
                      <div className="taylor-order-comparison">
                        {comparison.coefficients.map((_, n) => {
                          const err = Math.abs(
                            sourceValue - comparison.evaluate(point, n),
                          );
                          return (
                            <button
                              key={n}
                              aria-label={`采用 ${n} 阶泰勒`}
                              className={`${n === degree ? "active" : ""} ${err <= config.tol ? "within-tolerance" : ""}`}
                              onClick={() => setDegree(n)}
                            >
                              <span>{n} 阶</span>
                              <small>
                                {Number.isFinite(err)
                                  ? err.toExponential(1)
                                  : "未定义"}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                    </details>
                  )}
                  <label className="drawer-field">
                    同时求多个位置的值
                    <input
                      aria-label="泰勒多点求值"
                      value={queries}
                      onChange={(e) => setQueries(e.target.value)}
                    />
                  </label>
                  <table>
                    <thead>
                      <tr>
                        <th>{variable}</th>
                        <th>f</th>
                        <th>T{degree}</th>
                        <th>误差</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queries
                        .split(/[,，;；\s]+/)
                        .filter(Boolean)
                        .slice(0, 30)
                        .map((text, i) => {
                          let x = NaN;
                          try {
                            x = constantValue(text);
                          } catch {
                            /* show undefined */
                          }
                          const actual = f(x),
                            approx = taylor.value?.evaluate(x) ?? NaN;
                          return (
                            <tr
                              key={i}
                              onClick={() => Number.isFinite(x) && trace(x)}
                            >
                              <td>{text}</td>
                              <td>{fmt(actual)}</td>
                              <td>{fmt(approx)}</td>
                              <td>{fmt(Math.abs(actual - approx))}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
