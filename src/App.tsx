import { useState, useEffect, useRef, useMemo } from "react";
import {
  Settings,
  CircleHelp,
  Undo2,
  Redo2,
  Plus,
  Minus,
  Home,
  Maximize,
  X,
  Scan,
  Smartphone,
} from "lucide-react";
import MathFormula from "./components/MathFormula";
import type { CSSProperties } from "react";
import type {
  FunctionDefinition,
  GraphPoint,
  Viewport,
} from "./types/function";
import { ALL_DOMAIN } from "./types/function";
import {
  makeFunction,
  transform,
  reflect,
  derived,
} from "./services/transformEngine";
import { sampleFunction, evaluateFunction } from "./services/functionSampler";
import {
  roots,
  intersections,
  parity,
  slope,
  derivativeExpression,
  coincidentFunctions,
} from "./services/analysisEngine";
import { createInverse } from "./services/inverseEngine";
import {
  encodeProject as encode,
  decodeProject as decode,
  validateFunctions,
} from "./services/projectStore";
import { chooseFunctionColor } from "./utils/functionColors";
import { formatDomain } from "./utils/formatMath";
import { pointLabel, nextPointLabel } from "./utils/pointLabels";
import GraphCanvas from "./components/GraphCanvas";
import MathKeyboard from "./components/MathKeyboard";
import FunctionList from "./components/FunctionList";

import {
  prepareFunction,
  refreshFunctionBindings,
  withFunctionNames,
} from "./services/functionContext";
import FunctionActions from "./components/FunctionActions";
import { useUiHistory } from "./utils/useUiHistory";
import type { AxisLabelMode } from "./utils/piTicks";
import { editMathInput } from "./utils/mathInput";
import type { MathInputAction } from "./utils/mathInput";

const storageKey = "function-lab-v1";

const defaultView: Viewport = { cx: 0, cy: 0, scale: 55 };
const initial = () => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw)
      return refreshFunctionBindings(
        withFunctionNames(validateFunctions(decode(raw))),
      );
  } catch {}
  return [
    { ...makeFunction("x^2"), color: "#32966f" },
    { ...makeFunction("sin(x)", 1), color: "#2879f6" },
    { ...makeFunction("2*x+1", 2), color: "#e35450" },
  ];
};
const commands = [
  ["y", "关于 Y 轴对称"],
  ["x", "关于 X 轴对称"],
  ["origin", "关于原点对称"],
  ["diag", "关于 y=x 对称"],
  ["anti", "关于 y=−x 对称"],
  ["inverse", "反函数"],
  ["absY", "|f(x)|"],
  ["absX", "f(|x|)"],
  ["absBoth", "|f(|x|)|"],
  ["negAbs", "−|f(x)|"],
  ["parity", "奇偶性"],
  ["roots", "零点"],
  ["intersections", "交点"],
  ["derivative", "导数"],
  ["tangent", "切线"],
  ["normal", "法线"],
  ["domain", "定义域"],
  ["fit", "适应全部图像"],
] as const;
export default function App() {
  const [functions, setFunctions] = useState<FunctionDefinition[]>(initial);
  const [selected, setSelected] = useState(() => functions[0]?.id || "");
  const [viewport, setViewport] = useState<Viewport>(defaultView);
  const [expression, setExpression] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [caretPosition, setCaretPosition] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<FunctionDefinition | null>(null);
  const [panel, setPanel] = useState(false);
  const [toolOverlays, setToolOverlays] = useState<FunctionDefinition[]>([]);
  const [comparison, setComparison] = useState("");
  const [toolMode, setToolMode] = useState("more");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [orientationHint, setOrientationHint] = useState("");
  const [manualLandscape, setManualLandscape] = useState(false);
  useEffect(() => {
    if (!manualLandscape) return;
    const exitWhenRotated = () => {
      if (window.matchMedia("(orientation: landscape)").matches) {
        setManualLandscape(false);
        setOrientationHint("");
      }
    };
    window.addEventListener("orientationchange", exitWhenRotated);
    window.addEventListener("resize", exitWhenRotated);
    return () => {
      window.removeEventListener("orientationchange", exitWhenRotated);
      window.removeEventListener("resize", exitWhenRotated);
    };
  }, [manualLandscape]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editingFunctionId, setEditingFunctionId] = useState("");
  const [graphRatio, setGraphRatio] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("function-lab-graph-ratio"));
      if (saved >= 0.25 && saved <= 0.85) return saved;
    } catch {}
    return 0.6;
  });
  const [graphResizing, setGraphResizing] = useState(false);
  const graphResize = useRef<{
    id: number;
    y: number;
    height: number;
    viewport: number;
  } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("function-lab-graph-ratio", String(graphRatio));
      } catch {}
    }, 200);
    return () => clearTimeout(timer);
  }, [graphRatio]);
  const [listExpanded, setListExpanded] = useState(true);
  const [keyboard, setKeyboard] = useState(false);
  const [touchLayout, setTouchLayout] = useState(
    () =>
      window.matchMedia(
        "(any-pointer: coarse), (max-width: 800px), (max-height: 600px) and (orientation: landscape)",
      ).matches,
  );
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  useEffect(() => {
    const media = window.matchMedia(
      "(any-pointer: coarse), (max-width: 800px), (max-height: 600px) and (orientation: landscape)",
    );
    const update = () => setTouchLayout(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!inputAreaRef.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setDockHeight(entry.target.getBoundingClientRect().height),
    );
    observer.observe(inputAreaRef.current);
    return () => observer.disconnect();
  }, []);
  const [grid, setGrid] = useState(true);
  const [axes, setAxes] = useState(true);
  const [ticks, setTicks] = useState(true);
  const [axisLabels, setAxisLabels] = useState<AxisLabelMode>(() => {
    try {
      const value = localStorage.getItem("function-lab-axis-labels");
      if (value === "pi" || value === "numeric") return value;
    } catch {}
    return "auto";
  });
  const [points, setPoints] = useState<GraphPoint[]>([]);
  const [refs, setRefs] = useState<{ a: number; b: number; c: number }[]>([]);
  const [undoStack, setUndo] = useState<FunctionDefinition[][]>([]);
  const [redoStack, setRedo] = useState<FunctionDefinition[][]>([]);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const operationBefore = useRef<{
    points: GraphPoint[];
    refs: { a: number; b: number; c: number }[];
  } | null>(null);
  function restoreOperation() {
    if (operationBefore.current) {
      setPoints(operationBefore.current.points);
      setRefs(operationBefore.current.refs);
    }
    setPreview(null);
    setToolOverlays((overlays) => (overlays.length ? [] : overlays));
    setComparison("");
    setError("");
    setNotice("");
  }
  useUiHistory(
    {
      panel,
      mode: toolMode,
      keyboard,
      settings: settingsOpen,
      help: helpOpen,
      palette,
      landscape: manualLandscape,
    },
    (state) => {
      const collapsing = panel && !state.panel;
      if (!collapsing && state.mode !== toolMode) restoreOperation();
      setPanel(state.panel);
      setToolMode(collapsing ? toolMode : state.mode);
      setKeyboard(state.keyboard);
      setSettingsOpen(state.settings);
      setHelpOpen(state.help);
      setPalette(state.palette);
      setManualLandscape(state.landscape);
      if (!state.landscape) setOrientationHint("");
      if (!state.keyboard) inputRef.current?.blur();
    },
  );
  const [x0, setX0] = useState(1);
  const [second, setSecond] = useState("");
  const current = functions.find((f) => f.id === selected) || functions[0];
  function commit(next: FunctionDefinition[]) {
    const resolved = refreshFunctionBindings(withFunctionNames(next));
    validateFunctions(resolved);
    setUndo((u) => [...u.slice(-49), functions]);
    setRedo([]);
    setFunctions(resolved);
    setPreview(null);
    setToolOverlays((overlays) => (overlays.length ? [] : overlays));
    setComparison("");
    setError("");
  }
  function add(fn: FunctionDefinition) {
    const result = withFunctionNames([
      ...functions,
      { ...fn, color: chooseFunctionColor(functions) },
    ]).at(-1)!;
    commit([...functions, result]);
    setSelected(result.id);
    setNotice(fn.transformHistory.at(-1)?.explanation || "函数已加入图像。");
  }
  function guarded(action: () => void) {
    try {
      action();
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "操作暂时无法完成，请检查输入。",
      );
    }
  }
  function undo() {
    if (!undoStack.length) return;
    setRedo((r) => [...r, functions]);
    setFunctions(undoStack.at(-1)!);
    setUndo((u) => u.slice(0, -1));
    setPreview(null);
  }
  async function enterLandscape() {
    setSettingsOpen(false);
    setKeyboard(false);
    inputRef.current?.blur();
    setOrientationHint("");
    if (manualLandscape) {
      setManualLandscape(false);
      try {
        (
          screen.orientation as ScreenOrientation & { unlock?: () => void }
        ).unlock?.();
      } catch {}
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (mode: string) => Promise<void>;
      };
      if (!orientation.lock) throw new Error("使用页面横屏");
      await orientation.lock("landscape");
      setManualLandscape(false);
    } catch {
      (
        screen.orientation as ScreenOrientation & { unlock?: () => void }
      ).unlock?.();
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
      setManualLandscape(true);
      setOrientationHint("横屏布局已开启；将手机横过来即可铺满横屏。");
    }
  }
  function redo() {
    if (!redoStack.length) return;
    setUndo((u) => [...u, functions]);
    setFunctions(redoStack.at(-1)!);
    setRedo((r) => r.slice(0, -1));
    setPreview(null);
  }
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, encode(functions));
    } catch {
      setNotice("浏览器存储空间不足，建议导出实验。");
    }
  }, [functions]);
  function prepareInputDraft() {
    const previous = functions.find((fn) => fn.id === editingFunctionId);
    const candidate = prepareFunction(
      expression,
      previous ? functions.indexOf(previous) : functions.length,
      functions.filter((fn) => fn.id !== previous?.id),
      previous,
    );
    const resolved = refreshFunctionBindings(
      previous
        ? functions.map((fn) => (fn.id === previous.id ? candidate : fn))
        : [...functions, candidate],
    );
    return resolved.find((fn) => fn.id === candidate.id)!;
  }
  const draft = useMemo(() => {
    if (!expression.trim()) return null;
    try {
      return {
        ...prepareInputDraft(),
        id: "draft",
        name: "输入预览",
        color: "#54899a",
        lineStyle: "dashed" as const,
      };
    } catch {
      return null;
    }
  }, [expression, functions, editingFunctionId]);
  useEffect(() => {
    const openGroups = [...expression].reduce(
      (n, c) => n + (c === "(" ? 1 : c === ")" ? -1 : 0),
      0,
    );
    const unfinished =
      /\(\s*\)|[+*/^,=−-]\s*$/.test(expression) || openGroups > 0;
    if (!expression.trim() || unfinished) {
      setError("");
      return;
    }
    const timer = setTimeout(() => {
      try {
        prepareInputDraft();
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "请检查表达式。");
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [expression, functions, editingFunctionId]);
  function addInput() {
    guarded(() => {
      const previous = functions.find((f) => f.id === editingFunctionId);
      if (previous) {
        if (previous.locked) throw new Error("请先解锁函数。");
        const next = prepareFunction(
          expression,
          functions.indexOf(previous),
          functions.filter((f) => f.id !== previous.id),
          previous,
        );
        commit(functions.map((f) => (f.id === previous.id ? next : f)));
      } else add(prepareFunction(expression, functions.length, functions));
      setExpression("");
      setEditingFunctionId("");
      if (touchLayout) {
        setKeyboard(false);
        inputRef.current?.blur();
      }
    });
  }

  function resizeGraph(ratio: number) {
    setKeyboard(false);
    inputRef.current?.blur();
    setGraphRatio(Math.max(0.25, Math.min(0.85, ratio)));
  }
  function editInput(action: MathInputAction, touchInput: boolean) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? expression.length;
    const end = el?.selectionEnd ?? start;
    if (touchInput && !touchLayout) el?.blur();
    const next = editMathInput(expression, start, end, action);
    setExpression(next.text);
    setCaretPosition(next.start);
    requestAnimationFrame(() => {
      if (!touchInput) el?.focus({ preventScroll: true });
      el?.setSelectionRange(next.start, next.end);
    });
  }
  function fit() {
    const ps = functions
      .filter((f) => f.visible)
      .flatMap((f) => sampleFunction(f, -10, 10, 800).flat())
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!ps.length) {
      setNotice("当前可见范围没有有效曲线。");
      return;
    }
    const xs = ps.map((p) => p.x).sort((a, b) => a - b),
      ys = ps.map((p) => p.y).sort((a, b) => a - b);
    const lo = 0,
      hi = ps.length - 1;
    const xmin = xs[lo],
      xmax = xs[hi],
      ymin = ys[lo],
      ymax = ys[hi];
    const rect = document
      .querySelector(".graph-canvas-wrap")
      ?.getBoundingClientRect();
    setViewport({
      cx: (xmin + xmax) / 2,
      cy: (ymin + ymax) / 2,
      scale: Math.max(
        1e-12,
        Math.min(
          (rect?.width || 800) / Math.max(2, xmax - xmin) / 1.15,
          (rect?.height || 600) / Math.max(2, ymax - ymin) / 1.15,
        ),
      ),
    });
    setNotice(
      "已适应 x ∈ [−10,10] 内的全部可见采样曲线；无界函数的完整图像无法装入有限画布。",
    );
  }
  function action(key: string, asPreview = false) {
    const retain = (fn: FunctionDefinition) =>
      asPreview ? previewResult(fn) : add(fn);
    guarded(() => {
      if (key === "fit") {
        fit();
        return;
      }
      if (!current) throw new Error("请先输入并选择一个函数。");
      if (key === "domain") {
        setToolMode("domain");
        setPanel(true);
        return;
      }
      if (["diag", "anti"].includes(key)) {
        setRefs([{ a: 1, b: key === "diag" ? -1 : 1, c: 0 }]);
        retain(reflect(current, 1, key === "diag" ? -1 : 1, 0));
        return;
      }
      if (key === "inverse") {
        const inv = createInverse(current);
        setRefs([{ a: 1, b: -1, c: 0 }]);
        if (!inv.valid) {
          setNotice(
            inv.reason +
              "。可以用「关于 y=x 对称」查看镜像关系，或限制定义域后重试。",
          );
          return;
        }
        if (inv.expression) {
          const inverseFunction = derived(
            current,
            inv.expression,
            "反函数",
            "定义域与值域交换",
            `${inv.reason} 原函数 D=${formatDomain(current.domain)} → 反函数值域；原函数 R=${formatDomain(inv.domain || ALL_DOMAIN)} → 反函数定义域。`,
            inv.domain || ALL_DOMAIN,
          );
          inverseFunction.parameters = {};
          inverseFunction.bindings = {};
          inverseFunction.liveBindings = {};
          retain(inverseFunction);
        } else {
          const relation = reflect(current, 1, -1, 0);
          relation.name = "反函数（数值镜像）";
          relation.transformHistory.at(-1)!.explanation = inv.reason;
          retain(relation);
        }
        return;
      }
      if (
        current.kind === "relation" &&
        [
          "parity",
          "roots",
          "intersections",
          "derivative",
          "tangent",
          "normal",
        ].includes(key)
      )
        throw new Error("该分析需要显函数，请选择左侧的原函数。");
      const min = viewport.cx - 8,
        max = viewport.cx + 8;
      if (key === "parity") {
        const result = parity(current);
        setPreview(null);
        setToolOverlays((overlays) => (overlays.length ? [] : overlays));
        setComparison("");
        setToolMode("parity");
        setPanel(true);
        setNotice(`${result.kind}：${result.explanation}`);
        return;
      }
      if (key === "roots") {
        setPreview(null);
        setToolMode("roots");
        setPanel(true);
        if (coincidentFunctions(current, makeFunction("0"))) {
          setPoints([]);
          setNotice(
            "函数恒等于 0；有效定义域内的每个点都是零点，不标注连续零点。",
          );
          return;
        }
        const result = roots(current, min, max);
        setPoints(result);
        setNotice(
          `区间 [${min.toFixed(2)}, ${max.toFixed(2)}] 内数值找到 ${result.length} 个零点${result.length ? "：" + result.map((p) => p.x.toFixed(4)).join("，") : ""}。数值搜索可能遗漏高频或偶重零点。`,
        );
        return;
      }
      if (key === "intersections") {
        const other =
          functions.find((f) => f.id === second) ||
          functions.find((f) => f.id !== current.id && f.kind === "function");
        if (!other) throw new Error("请先添加另一个函数。");
        if (other.id === current.id) throw new Error("请选择两个不同函数。");
        if (coincidentFunctions(current, other)) {
          setNotice(
            "两条曲线的表达式重合，共同定义域内有连续交点，不标注为孤立交点。",
          );
          setPoints([]);
          return;
        }
        const result = intersections(current, other, min, max);
        setPoints(result);
        setNotice(
          `与 ${other.name} 在 [${min.toFixed(2)},${max.toFixed(2)}] 内数值找到 ${result.length} 个交点。重合曲线不作为孤立交点。`,
        );
        return;
      }
      if (["derivative", "tangent", "normal"].includes(key)) {
        const m = slope(current, x0),
          y = evaluateFunction(current, x0);
        if (!Number.isFinite(m) || !Number.isFinite(y))
          throw new Error("该点没有可用的有限导数，可能超出定义域或不可导。");
        setPoints((p) => [...p, { x: x0, y }]);
        if (key === "derivative") {
          const d = derived(
            current,
            derivativeExpression(current),
            "导函数",
            `d/d${current.variable || "x"}`,
            "由原函数求导，保留原函数定义域；不可导点不绘制。",
          );
          d.differentiabilityChecks = [
            ...(current.differentiabilityChecks || []),
            {
              expression: current.currentExpression,
              argument: current.variable || "x",
              source: current,
            },
          ];
          retain(d);
          setNotice(
            `${current.variable || "x"}₀=${x0}，f(${current.variable || "x"}₀)≈${y.toFixed(6)}，f′(${current.variable || "x"}₀)≈${m.toFixed(6)}（数值估计）。`,
          );
          return;
        }
        if (key === "normal" && Math.abs(m) < 1e-10) {
          setRefs([{ a: 1, b: 0, c: -x0 }]);
          setNotice(`法线为 x=${x0}。`);
          return;
        }
        const k = key === "normal" ? -1 / m : m;
        const line = derived(
          current,
          `${k}*(${current.variable || "x"}-(${x0}))+(${y})`,
          key === "normal" ? "法线" : "切线",
          `${current.variable || "x"}₀=${x0}`,
          `f′(${x0})≈${m.toFixed(6)}；经过 (${x0},${y.toFixed(4)})。`,
          ALL_DOMAIN,
        );
        line.parameters = {};
        line.bindings = {};
        line.domainConstraints = undefined;
        line.differentiabilityChecks = undefined;
        retain(line);
        return;
      }
      retain(transform(current, key));
    });
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const editing = (e.target as HTMLElement)?.matches("input,textarea");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if (e.key === "Escape") {
        setPalette(false);
        restoreOperation();
        setPanel(false);
        setSettingsOpen(false);
        setHelpOpen(false);
        setKeyboard(false);
      }
      if (!editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (!editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  function previewResult(fn: FunctionDefinition) {
    const named = withFunctionNames([...functions, fn]).at(-1)!;
    setPreview({
      ...named,
      color: chooseFunctionColor(functions),
      lineStyle: "dashed",
    });
    setError("");
    setNotice("");
  }
  function selectFunction(id: string) {
    if (id === current?.id) return;
    setToolOverlays((overlays) => (overlays.length ? [] : overlays));
    setComparison("");
    setSelected(id);
    setPreview(null);
    setError("");
    setNotice("");
  }
  function exportProject() {
    const blob = new Blob(
      [encode({ version: 1, functions, points, viewport })],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "函数实验室.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importProject(file: File) {
    file
      .text()
      .then((text) =>
        guarded(() => {
          const data = decode(text) as any;
          if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data) ||
            data.version !== 1 ||
            !Array.isArray(data.functions) ||
            data.functions.length > 150
          )
            throw new Error("这不是有效的函数实验室文件（最多 150 个函数）。");
          const imported = validateFunctions(data.functions);
          if (
            data.points !== undefined &&
            (!Array.isArray(data.points) ||
              data.points.length > 5000 ||
              data.points.some(
                (p: GraphPoint) =>
                  !p ||
                  !Number.isFinite(p.x) ||
                  !Number.isFinite(p.y) ||
                  (p.label !== undefined &&
                    (typeof p.label !== "string" || p.label.length > 100)),
              ))
          )
            throw new Error("观察点数据无效。");
          if (
            data.viewport &&
            ![data.viewport.cx, data.viewport.cy, data.viewport.scale].every(
              Number.isFinite,
            )
          )
            throw new Error("视口数据无效。");
          if (
            data.viewport &&
            (data.viewport.scale < 1e-12 || data.viewport.scale > 100000)
          )
            throw new Error("视口比例超出范围。");
          commit(imported);
          setSelected(imported[0]?.id || "");
          setPoints(data.points || []);
          if (data.viewport) setViewport(data.viewport);
          setRefs([]);
          setNotice("实验已导入。");
        }),
      )
      .catch(() => setError("文件读取失败。"));
  }
  const powerStart = expression.lastIndexOf("^(", caretPosition);
  const exponentEditing =
    powerStart >= 0 &&
    [...expression.slice(powerStart + 1, caretPosition)].reduce(
      (n, c) => n + (c === "(" ? 1 : c === ")" ? -1 : 0),
      0,
    ) > 0;
  const displayed = useMemo(
    () => [
      ...functions,
      ...toolOverlays,
      ...(preview ? [preview] : []),
      ...(draft ? [draft] : []),
    ],
    [functions, toolOverlays, preview, draft],
  );

  return (
    <div
      className={`app-shell ${keyboard && touchLayout ? "math-keyboard-open" : ""} ${manualLandscape ? "manual-landscape" : ""}`}
      style={{ "--math-dock-height": `${dockHeight}px` } as CSSProperties}
    >
      <header className="app-header">
        <div className="brand">
          <strong>函数实验室</strong>
        </div>
        <div className="header-actions">
          <button
            aria-label="撤销"
            title="撤销 Ctrl+Z"
            onClick={undo}
            disabled={!undoStack.length}
          >
            <Undo2 size={20} />
          </button>
          <button
            aria-label="重做"
            title="重做 Ctrl+Y"
            onClick={redo}
            disabled={!redoStack.length}
          >
            <Redo2 size={20} />
          </button>
          <button
            aria-label="使用帮助"
            onClick={() => {
              setHelpOpen(!helpOpen);
              setSettingsOpen(false);
            }}
          >
            <CircleHelp size={22} />
          </button>
          <button
            className="landscape-entry"
            aria-label={manualLandscape ? "退出横屏模式" : "横屏看图"}
            onClick={enterLandscape}
          >
            <Smartphone size={20} style={{ transform: "rotate(90deg)" }} />
          </button>
          <button
            aria-label="设置"
            aria-expanded={settingsOpen}
            onClick={() => {
              setSettingsOpen(!settingsOpen);
              setHelpOpen(false);
            }}
          >
            <Settings size={23} />
          </button>
        </div>
        {orientationHint && (
          <div className="orientation-hint" role="status">
            {orientationHint}
            <button
              aria-label="关闭横屏提示"
              onClick={() => setOrientationHint("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {helpOpen && (
          <div className="header-popover">
            <strong>快速画图</strong>
            <p>输入公式即可预览，回车或点添加保留。</p>
            <p>拖动画布平移，滚轮或双指缩放。拉拽分界条调整图像区域。</p>
            <p>
              点曲线或左上角名称选中函数，再用图像底部工具条操作。长按画布可标记坐标。
            </p>
            <button onClick={() => setHelpOpen(false)}>知道了</button>
          </div>
        )}
        {settingsOpen && (
          <div className="header-popover settings-popover">
            <strong>画布与项目</strong>
            <label>
              <input
                type="checkbox"
                checked={grid}
                onChange={(e) => setGrid(e.target.checked)}
              />
              网格
            </label>
            <label>
              <input
                type="checkbox"
                checked={axes}
                onChange={(e) => setAxes(e.target.checked)}
              />
              坐标轴
            </label>
            <label>
              <input
                type="checkbox"
                checked={ticks}
                onChange={(e) => setTicks(e.target.checked)}
              />
              刻度
            </label>
            <label>
              坐标标注
              <select
                aria-label="坐标标注"
                value={axisLabels}
                onChange={(event) => {
                  const mode = event.target.value as AxisLabelMode;
                  setAxisLabels(mode);
                  try {
                    localStorage.setItem("function-lab-axis-labels", mode);
                  } catch {}
                }}
              >
                <option value="auto">自动</option>
                <option value="numeric">数值</option>
                <option value="pi">整数＋π（两轴）</option>
              </select>
            </label>
            <button
              onClick={() => {
                setPoints([]);
                setRefs([]);
                setSettingsOpen(false);
              }}
            >
              清除观察标记
            </button>
            <button onClick={exportProject}>导出项目</button>
            <label className="button-label">
              导入项目
              <input
                type="file"
                accept=".json"
                hidden
                onChange={(e) => {
                  if (e.target.files?.[0]) importProject(e.target.files[0]);
                  e.target.value = "";
                  setSettingsOpen(false);
                }}
              />
            </label>
            <button onClick={() => setSettingsOpen(false)}>关闭</button>
          </div>
        )}
      </header>
      <main
        className={`workspace ${panel ? "" : "panel-hidden"}`}
        style={
          { "--portrait-graph-size": `${graphRatio * 100}svh` } as CSSProperties
        }
      >
        <aside className="left-panel">
          <div
            ref={inputAreaRef}
            className={`math-input-area ${keyboard ? "open" : ""}`}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addInput();
              }}
              className="input-form"
            >
              {editingFunctionId && (
                <button
                  type="button"
                  className="cancel-edit"
                  onClick={() => {
                    setEditingFunctionId("");
                    setExpression("");
                  }}
                >
                  取消编辑
                </button>
              )}
              <label htmlFor="function-input">
                {editingFunctionId ? "编辑公式" : "输入公式"}
              </label>
              <div className="input-row">
                <span className="input-prefix">ƒ</span>
                <input
                  id="function-input"
                  aria-label="输入表达式"
                  ref={inputRef}
                  inputMode={touchLayout ? "none" : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sinx / e^(πx) / f(t)=m*t+n"
                  value={expression}
                  onChange={(e) => {
                    setExpression(e.target.value);
                    setCaretPosition(e.target.selectionStart ?? 0);
                  }}
                  onSelect={(e) =>
                    setCaretPosition(e.currentTarget.selectionStart ?? 0)
                  }
                  onKeyDown={(e) => {
                    if (
                      !e.ctrlKey &&
                      !e.metaKey &&
                      !e.altKey &&
                      ["(", ")", "^", "Backspace"].includes(e.key)
                    ) {
                      e.preventDefault();
                      editInput(
                        e.key === "Backspace"
                          ? { type: "backspace" }
                          : { type: "insert", value: e.key },
                        false,
                      );
                    }
                  }}
                  onFocus={() => {
                    if (touchLayout) setKeyboard(true);
                  }}
                  onClick={() => {
                    if (touchLayout) setKeyboard(true);
                  }}
                />
                {expression && (
                  <button
                    type="button"
                    className="input-clear"
                    aria-label="清空输入"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => editInput({ type: "clear" }, touchLayout)}
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
              {expression && (
                <div
                  className={`formula-preview ${exponentEditing ? "is-power-editing" : ""}`}
                  aria-label="公式排版预览"
                >
                  <MathFormula expression={expression} />
                  <span className="editing-hint">
                    {exponentEditing ? "指数 · 点跳出返回底数" : "实时公式"}
                  </span>
                </div>
              )}
              {error && expression && (
                <p className="input-error" role="alert">
                  {error}
                </p>
              )}
              <button className="add-function" disabled={!expression.trim()}>
                <Plus size={19} />
                {editingFunctionId ? "保存函数" : "添加函数"}
              </button>
              <div className="input-hint">
                {touchLayout
                  ? "输入即预览 · 点添加保留"
                  : "输入即预览 · Enter 添加"}
              </div>
            </form>
            {!keyboard && (
              <button
                className="keyboard-toggle"
                onClick={() => setKeyboard(true)}
              >
                打开数学键盘 ⌃
              </button>
            )}
            {keyboard && (
              <MathKeyboard
                edit={editInput}
                onAdd={addInput}
                canAdd={!!expression.trim()}
                addLabel={editingFunctionId ? "保存" : "添加"}
                onClose={() => {
                  setKeyboard(false);
                  inputRef.current?.blur();
                }}
              />
            )}
          </div>
          <div className="function-list-heading">
            <button
              className="mobile-list-toggle"
              aria-expanded={listExpanded}
              onClick={() => setListExpanded(!listExpanded)}
            >
              函数列表（{functions.length}）{" "}
              <span>{listExpanded ? "收起 ⌃" : "展开 ⌄"}</span>
            </button>
            <button
              className="clear-functions"
              disabled={!functions.length}
              onClick={() => {
                commit([]);
                setSelected("");
                setEditingFunctionId("");
                if (editingFunctionId) setExpression("");
                setPanel(false);
                setListExpanded(true);
              }}
            >
              全部清空
            </button>
          </div>
          <div
            className={`function-list-section ${listExpanded ? "" : "collapsed"}`}
          >
            {!functions.length && (
              <div className="function-empty">
                输入公式，开始画图。
                {undoStack.length > 0 && (
                  <button onClick={undo}>撤销清空</button>
                )}
              </div>
            )}
            <FunctionList
              functions={functions}
              selected={current?.id || ""}
              onSelect={selectFunction}
              onEdit={(fn) => {
                selectFunction(fn.id);
                setPreview(null);
                setToolOverlays((overlays) =>
                  overlays.length ? [] : overlays,
                );
                setComparison("");
                setEditingFunctionId(fn.id);
                setExpression(fn.currentExpression);
                setKeyboard(touchLayout);
                requestAnimationFrame(() => {
                  inputRef.current?.focus({ preventScroll: true });
                  inputRef.current?.setSelectionRange(
                    fn.currentExpression.length,
                    fn.currentExpression.length,
                  );
                });
              }}
              onTools={(fn) => {
                if (!panel) operationBefore.current = { points, refs };
                if (fn.id !== current?.id) setPreview(null);
                setSelected(fn.id);
                setToolMode("more");
                setPanel(true);
                setKeyboard(false);
                setNotice("");
              }}
              onChange={(fn) => {
                guarded(() =>
                  commit(functions.map((f) => (f.id === fn.id ? fn : f))),
                );
              }}
              onDelete={(id) =>
                guarded(() => commit(functions.filter((f) => f.id !== id)))
              }
              onCopy={(fn) =>
                guarded(() =>
                  add({
                    ...fn,
                    id: crypto.randomUUID(),
                    name: fn.name + " 副本",
                    locked: false,
                  }),
                )
              }
              onSolo={(id) =>
                commit(functions.map((f) => ({ ...f, visible: f.id === id })))
              }
            />
          </div>
          <div className="local-note">
            本地自动保存
            <br />
            核心功能无需网络或账号
          </div>
        </aside>
        <section className="graph-panel">
          <div className="graph-stage">
            <GraphCanvas
              functions={displayed}
              legendFunctions={functions}
              selected={current?.id}
              onSelect={selectFunction}
              overlayKey={`${panel}|${toolMode}|${keyboard}|${current?.id}|${error}|${notice}|${preview?.id}`}
              viewport={viewport}
              onViewportChange={setViewport}
              grid={grid}
              axes={axes}
              ticks={ticks}
              axisLabels={axisLabels}
              points={points}
              onPoint={(p) =>
                guarded(() => {
                  if (points.length >= 5000)
                    throw new Error("观察点已达 5000 个，请先清除部分标记。");
                  setPoints((ps) => [
                    ...ps,
                    { ...p, label: nextPointLabel(ps) },
                  ]);
                })
              }
              referenceLines={refs}
            />
            {current && (
              <FunctionActions
                hidden={keyboard}
                current={current}
                functions={functions}
                mode={toolMode}
                open={panel}
                preview={preview}
                comparison={comparison}
                onCompare={(key) =>
                  guarded(() => {
                    if (comparison === key) {
                      setToolOverlays((overlays) =>
                        overlays.length ? [] : overlays,
                      );
                      setComparison("");
                      return;
                    }
                    const mirror = transform(current, key);
                    setToolOverlays([
                      {
                        ...mirror,
                        color: chooseFunctionColor(functions),
                        lineStyle: "dashed",
                      },
                    ]);
                    setComparison(key);
                  })
                }
                feedback={notice}
                error={error}
                onSelect={selectFunction}
                onOpen={(mode) => {
                  const pending =
                    !!preview ||
                    toolOverlays.length > 0 ||
                    (["parity", "roots", "intersections"].includes(toolMode) &&
                      !!notice);
                  if (!panel && !pending)
                    operationBefore.current = { points, refs };
                  if (mode !== toolMode) restoreOperation();
                  setToolMode(mode);
                  setPanel(true);
                  if (mode !== toolMode || !preview) setPreview(null);
                  setError("");
                  if (mode !== toolMode) setNotice("");
                  setKeyboard(false);
                }}
                onClose={() => {
                  setPanel(false);
                  setError("");
                }}
                onCancel={restoreOperation}
                onPreview={previewResult}
                onSave={() =>
                  guarded(() => {
                    if (preview) {
                      const target = current.id;
                      const name = preview.alias;
                      add({ ...preview, lineStyle: "solid" });
                      setSelected(target);
                      setNotice(`已添加 ${name}，继续调节或选择其他工具。`);
                      operationBefore.current = { points, refs };
                    }
                  })
                }
                onAction={action}
                onUpdate={(fn) =>
                  guarded(() =>
                    commit(functions.map((f) => (f.id === fn.id ? fn : f))),
                  )
                }
                onError={setError}
                x0={x0}
                onX0={setX0}
                second={second}
                onSecond={setSecond}
                points={points}
                onPoints={setPoints}
                onRefs={setRefs}
              />
            )}
            <div className="view-tools">
              <button
                aria-label="放大"
                onClick={() =>
                  setViewport((v) => ({
                    ...v,
                    scale: Math.min(100000, v.scale * 1.3),
                  }))
                }
              >
                <Plus size={21} />
              </button>
              <button
                aria-label="缩小"
                onClick={() =>
                  setViewport((v) => ({
                    ...v,
                    scale: Math.max(1e-12, v.scale / 1.3),
                  }))
                }
              >
                <Minus size={21} />
              </button>
              <button
                aria-label="复位"
                title="复位"
                onClick={() => setViewport(defaultView)}
              >
                <Home size={20} />
              </button>
              <button
                aria-label="适应所有曲线"
                title="适应所有曲线"
                onClick={fit}
              >
                <Scan size={20} />
              </button>
              <button
                aria-label="全屏"
                title="全屏"
                onClick={() => {
                  if (!document.fullscreenElement)
                    document
                      .querySelector(".graph-panel")
                      ?.requestFullscreen()
                      .catch(() => setError("此浏览器暂不支持全屏。"));
                  else document.exitFullscreen();
                }}
              >
                <Maximize size={19} />
              </button>
            </div>
          </div>
          <div className="graph-settings">
            <label>
              <input
                type="checkbox"
                checked={grid}
                onChange={(e) => setGrid(e.target.checked)}
              />
              网格
            </label>
            <label>
              <input
                type="checkbox"
                checked={axes}
                onChange={(e) => setAxes(e.target.checked)}
              />
              坐标轴
            </label>
            <label>
              <input
                type="checkbox"
                checked={ticks}
                onChange={(e) => setTicks(e.target.checked)}
              />
              刻度
            </label>
            <span>滚轮缩放 · 拖动画布 · 点击固定点</span>
            <button
              onClick={() => {
                setPoints([]);
                setRefs([]);
              }}
            >
              清除标记
            </button>
          </div>
          {points.length > 0 && (
            <div className="point-strip">
              {points.map((p, i) => (
                <button
                  key={i}
                  onClick={() =>
                    setPoints((ps) => ps.filter((_, j) => i !== j))
                  }
                  title="点击移除"
                >
                  {p.label || pointLabel(i)} ({p.x.toFixed(3)}, {p.y.toFixed(3)}
                  ) ×
                </button>
              ))}
            </div>
          )}
          {error && !panel && !expression && (
            <div className="graph-feedback" role="alert">
              {error}
            </div>
          )}
          <div
            className={`graph-resize-handle ${graphResizing ? "is-resizing" : ""}`}
            role="separator"
            tabIndex={0}
            aria-label="调整图像区域高度"
            aria-orientation="horizontal"
            aria-valuemin={25}
            aria-valuemax={85}
            aria-valuenow={Math.round(graphRatio * 100)}
            aria-valuetext={`图像高度 ${Math.round(graphRatio * 100)}%`}
            onPointerDown={(e) => {
              if (e.button !== 0 || graphResize.current) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              setGraphResizing(true);
              graphResize.current = {
                id: e.pointerId,
                y: e.clientY,
                height:
                  e.currentTarget.parentElement!.getBoundingClientRect().height,
                viewport: document.documentElement.clientHeight,
              };
            }}
            onPointerMove={(e) => {
              const start = graphResize.current;
              if (
                !start ||
                start.id !== e.pointerId ||
                Math.abs(e.clientY - start.y) < 4
              )
                return;
              resizeGraph(
                (start.height + e.clientY - start.y) / start.viewport,
              );
            }}
            onPointerUp={(e) => {
              if (graphResize.current?.id !== e.pointerId) return;
              graphResize.current = null;
              setGraphResizing(false);
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={(e) => {
              if (graphResize.current?.id !== e.pointerId) return;
              graphResize.current = null;
              setGraphResizing(false);
            }}
            onLostPointerCapture={(e) => {
              if (graphResize.current?.id !== e.pointerId) return;
              graphResize.current = null;
              setGraphResizing(false);
            }}
            onDoubleClick={() => resizeGraph(0.6)}
            onKeyDown={(e) => {
              if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              resizeGraph(
                e.key === "Home"
                  ? 0.25
                  : e.key === "End"
                    ? 0.85
                    : graphRatio + (e.key === "ArrowDown" ? 0.05 : -0.05),
              );
            }}
          >
            <span className="resize-grip" />
            <span>按住这里 · 上下拖拽</span>
          </div>
        </section>
      </main>
      <footer>
        函数实验室 <span>从公式到图像，从变换到理解。</span>
        <span>{functions.filter((f) => f.visible).length} 条可见曲线</span>
      </footer>
      {palette && (
        <div className="modal-backdrop" onClick={() => setPalette(false)}>
          <div
            className="command-palette"
            role="dialog"
            aria-label="搜索数学工具"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              placeholder="搜索 Y轴、反函数、切线、定义域…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const found = commands.find(([, label]) =>
                    label
                      .toLowerCase()
                      .replaceAll(" ", "")
                      .includes(query.toLowerCase().replaceAll(" ", "")),
                  );
                  if (found) {
                    setPalette(false);
                    setQuery("");
                    action(found[0]);
                  }
                }
              }}
            />
            <div>
              {commands
                .filter(([, label]) =>
                  label
                    .toLowerCase()
                    .replaceAll(" ", "")
                    .includes(query.toLowerCase().replaceAll(" ", "")),
                )
                .map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setPalette(false);
                      setQuery("");
                      action(key);
                    }}
                  >
                    {label}
                    <span>↵</span>
                  </button>
                ))}
            </div>
            <small>Esc 关闭</small>
          </div>
        </div>
      )}
    </div>
  );
}
