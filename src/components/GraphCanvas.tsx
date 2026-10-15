import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FunctionDefinition,
  GraphPoint,
  Viewport,
} from "../types/function";
import { sampleFunction } from "../services/functionSampler";
import { pointLabel } from "../utils/pointLabels";
import { beginPinch, movePinch } from "../utils/pinchViewport";
import type { PinchAnchor } from "../utils/pinchViewport";
import MathFormula from "./MathFormula";
import { viewportAfterHeightResize } from "../utils/resizeViewport";
import { piAxisUsage, piTickStep, formatPiTick } from "../utils/piTicks";
import type { AxisLabelMode } from "../utils/piTicks";
import { placeCurveLabels, segmentDistance } from "../utils/curveLabels";
import type { LabelBox } from "../utils/curveLabels";

interface Props {
  functions: FunctionDefinition[];
  legendFunctions?: FunctionDefinition[];
  selected?: string;
  onSelect?: (id: string) => void;
  overlayKey?: string;
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  grid: boolean;
  axes: boolean;
  ticks: boolean;
  axisLabels?: AxisLabelMode;
  points: GraphPoint[];
  onPoint: (point: GraphPoint) => void;
  referenceLines: { a: number; b: number; c: number }[];
  onHover?: (point: GraphPoint | null) => void;
}

const formatNumber = (value: number) =>
  Math.abs(value) < 1e-10 ? "0" : Number(value.toPrecision(5)).toString();
const gridStep = (scale: number) => {
  const target = 50 / scale;
  const power = 10 ** Math.floor(Math.log10(target));
  return Math.max(
    1,
    [1, 2, 5, 10].find((value) => value * power >= target)! * power,
  );
};
function canvasPosition(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): GraphPoint {
  const rect = canvas.getBoundingClientRect();
  if (canvas.closest(".manual-landscape"))
    return {
      x: ((clientY - rect.top) * canvas.clientWidth) / rect.height,
      y: ((rect.right - clientX) * canvas.clientHeight) / rect.width,
    };
  return {
    x: ((clientX - rect.left) * canvas.clientWidth) / rect.width,
    y: ((clientY - rect.top) * canvas.clientHeight) / rect.height,
  };
}

// Reflection is its own inverse. Reverse the complete viewport through the
// relation chain so sampling uses the original function's parameter interval.
export function sourceParameterRange(
  fn: FunctionDefinition,
  corners: GraphPoint[],
): [number, number] {
  let source = fn;
  let sourceCorners = corners;
  const visited = new Set<FunctionDefinition>();
  while (
    source.kind === "relation" &&
    source.source &&
    source.reflection &&
    !visited.has(source)
  ) {
    visited.add(source);
    const { a, b, c } = source.reflection;
    const norm = a * a + b * b;
    if (!Number.isFinite(norm) || norm === 0) return [NaN, NaN];
    sourceCorners = sourceCorners.map((point) => {
      const distance = (a * point.x + b * point.y + c) / norm;
      return { x: point.x - 2 * a * distance, y: point.y - 2 * b * distance };
    });
    source = source.source;
  }
  return [
    Math.min(...sourceCorners.map((point) => point.x)),
    Math.max(...sourceCorners.map((point) => point.x)),
  ];
}

// Clip each segment before handing coordinates to canvas. This also prevents
// extreme, finite values near poles from destabilizing the canvas renderer.
function clipSegment(
  start: GraphPoint,
  end: GraphPoint,
  width: number,
  height: number,
): [GraphPoint, GraphPoint] | null {
  const dx = end.x - start.x,
    dy = end.y - start.y;
  if (![start.x, start.y, end.x, end.y, dx, dy].every(Number.isFinite))
    return null;
  let low = 0,
    high = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [start.x, width - start.x, start.y, height - start.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const ratio = q[i] / p[i];
    if (p[i] < 0) low = Math.max(low, ratio);
    else high = Math.min(high, ratio);
    if (low > high) return null;
  }
  return [
    { x: start.x + low * dx, y: start.y + low * dy },
    { x: start.x + high * dx, y: start.y + high * dy },
  ];
}

export default function GraphCanvas(props: Props) {
  const {
    functions,
    viewport,
    grid,
    axes,
    ticks,
    points,
    onPoint,
    referenceLines,
    onHover,
  } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    viewport: Viewport;
    moved: boolean;
  } | null>(null);
  const pressTime = useRef(0);
  const pointers = useRef(new Map<number, GraphPoint>());
  const pinch = useRef<PinchAnchor | null>(null);
  const liveViewport = useRef(viewport);
  const gestureFrame = useRef<number | null>(null);
  if (pointers.current.size === 0 && gestureFrame.current === null)
    liveViewport.current = viewport;
  const latest = useRef(props);
  latest.current = props;
  const [size, setSize] = useState({ width: 800, height: 600 });
  const measuredSize = useRef<{ width: number; height: number } | null>(null);
  const [hover, setHover] = useState<GraphPoint | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const settledView = useRef(viewport);
  const settledSize = useRef(size);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [obstacles, setObstacles] = useState<LabelBox[]>([]);
  const visibleLegend = (props.legendFunctions || functions).filter(
    (fn) => fn.visible,
  );
  const symbolicAxes = useMemo(
    () => piAxisUsage(functions, props.axisLabels || "auto"),
    [functions, props.axisLabels],
  );
  const toScreen = (point: GraphPoint): GraphPoint => ({
    x: size.width / 2 + (point.x - viewport.cx) * viewport.scale,
    y: size.height / 2 - (point.y - viewport.cy) * viewport.scale,
  });
  const toWorld = (x: number, y: number): GraphPoint => ({
    x: viewport.cx + (x - size.width / 2) / viewport.scale,
    y: viewport.cy - (y - size.height / 2) / viewport.scale,
  });

  useEffect(() => {
    if (!hostRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        const next = { width, height };
        if (measuredSize.current) {
          const view = latest.current.viewport;
          const resized = viewportAfterHeightResize(
            view,
            measuredSize.current,
            next,
          );
          if (resized !== view) latest.current.onViewportChange(resized);
        }
        measuredSize.current = next;
        setSize(next);
      }
    });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const { x, y } = canvasPosition(canvas, event.clientX, event.clientY);
      const bounds = { width: canvas.clientWidth, height: canvas.clientHeight };
      const current = latest.current.viewport;
      const scale = Math.max(
        1e-12,
        Math.min(
          100000,
          current.scale *
            Math.exp(-Math.max(-300, Math.min(300, event.deltaY)) * 0.0015),
        ),
      );
      latest.current.onViewportChange({
        scale,
        cx:
          current.cx + (x - bounds.width / 2) * (1 / current.scale - 1 / scale),
        cy:
          current.cy -
          (y - bounds.height / 2) * (1 / current.scale - 1 / scale),
      });
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, []);

  const sampled = useMemo(() => {
    const min = viewport.cx - size.width / (2 * viewport.scale);
    const max = viewport.cx + size.width / (2 * viewport.scale);
    const minY = viewport.cy - size.height / (2 * viewport.scale);
    const maxY = viewport.cy + size.height / (2 * viewport.scale);
    const corners = [
      { x: min, y: minY },
      { x: min, y: maxY },
      { x: max, y: minY },
      { x: max, y: maxY },
    ];
    return functions
      .filter((fn) => fn.visible)
      .map((fn) => {
        const [sourceMin, sourceMax] = sourceParameterRange(fn, corners);
        return {
          fn,
          color: fn.color,
          segments: sampleFunction(
            fn,
            sourceMin,
            sourceMax,
            Math.max(1200, Math.round(Math.max(size.width, size.height) * 2)),
          ),
        };
      });
  }, [functions, viewport, size]);

  useEffect(() => {
    setSettling(true);
    const timer = setTimeout(() => {
      settledView.current = viewport;
      settledSize.current = size;
      setSettling(false);
    }, 180);
    return () => clearTimeout(timer);
  }, [viewport, size]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const overlays = [
      ...(host.parentElement?.querySelectorAll<HTMLElement>(
        ".graph-legend, .view-tools, .function-actions",
      ) || []),
    ];
    const measure = () => {
      const next = overlays
        .filter((el) => el.offsetWidth && el.offsetHeight)
        .map((el) => ({
          x: el.offsetLeft,
          y: el.offsetTop,
          width: el.offsetWidth,
          height: el.offsetHeight,
        }));
      setObstacles((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    };
    const observer = new ResizeObserver(measure);
    overlays.forEach((el) => observer.observe(el));
    observer.observe(host);
    measure();
    return () => observer.disconnect();
  }, [size, legendExpanded, props.overlayKey, visibleLegend.length]);
  const labelAnchorCache = useRef(
    new Map<string, { world: GraphPoint; dx: number; dy: number }>(),
  );
  const curveLabels = useMemo(() => {
    if (
      dragging ||
      settling ||
      settledView.current !== viewport ||
      settledSize.current !== size ||
      viewport.scale < 13 ||
      size.width < 230 ||
      size.height < 150
    )
      return [];
    const screen = (point: GraphPoint) => ({
      x: size.width / 2 + (point.x - viewport.cx) * viewport.scale,
      y: size.height / 2 - (point.y - viewport.cy) * viewport.scale,
    });
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = "italic 20px Georgia";
    const labelIds = new Set(
      (props.legendFunctions || functions)
        .filter((fn) => fn.visible)
        .slice(0, 24)
        .map((fn) => fn.id),
    );
    if (props.selected) labelIds.add(props.selected);
    const curves = sampled.map(({ fn, segments }) => {
      const text =
        fn.kind === "function"
          ? `${fn.alias || "f"}(${fn.variable || "x"})`
          : fn.alias || fn.name;
      const previous = labelAnchorCache.current.get(fn.id);
      return {
        id: fn.id,
        segments: segments.map((segment) => segment.map(screen)),
        width: labelIds.has(fn.id)
          ? Math.ceil(ctx.measureText(text).width) + 4
          : 0,
        height: 28,
        preferred: previous
          ? { anchor: screen(previous.world), dx: previous.dx, dy: previous.dy }
          : undefined,
      };
    });
    const origin = screen({ x: 0, y: 0 });
    const reserved = [
      ...obstacles,
      ...points
        .map((p) => ({ ...screen(p), width: 22, height: 22 }))
        .map((box) => ({ ...box, x: box.x - 11, y: box.y - 11 })),
    ];
    if (axes || ticks)
      reserved.push(
        {
          x: 0,
          y: origin.y - 15,
          width: size.width,
          height: symbolicAxes.x ? 53 : 30,
        },
        {
          x: origin.x - (symbolicAxes.y ? 80 : 22),
          y: 0,
          width: symbolicAxes.y ? 115 : 58,
          height: size.height,
        },
      );
    const order = [...curves].sort(
      (a, b) =>
        Number(b.id === props.selected) - Number(a.id === props.selected),
    );
    for (const [index, line] of referenceLines.entries()) {
      const minX = viewport.cx - size.width / (2 * viewport.scale),
        maxX = viewport.cx + size.width / (2 * viewport.scale);
      const endpoints =
        Math.abs(line.b) > 1e-12
          ? [
              screen({ x: minX, y: -(line.a * minX + line.c) / line.b }),
              screen({ x: maxX, y: -(line.a * maxX + line.c) / line.b }),
            ]
          : [
              screen({
                x: -line.c / line.a,
                y: viewport.cy - size.height / (2 * viewport.scale),
              }),
              screen({
                x: -line.c / line.a,
                y: viewport.cy + size.height / (2 * viewport.scale),
              }),
            ];
      const edge = clipSegment(
        endpoints[0],
        endpoints[1],
        size.width,
        size.height,
      );
      if (edge)
        order.push({
          id: `reference-${index}`,
          segments: [edge],
          width: 0,
          height: 0,
          preferred: undefined,
        });
    }
    const labels = placeCurveLabels(order, size.width, size.height, reserved);
    for (const label of labels)
      labelAnchorCache.current.set(label.id, {
        world: {
          x: viewport.cx + (label.anchor.x - size.width / 2) / viewport.scale,
          y: viewport.cy - (label.anchor.y - size.height / 2) / viewport.scale,
        },
        dx: label.dx,
        dy: label.dy,
      });
    return labels.map((label) => ({
      ...label,
      fn: functions.find((fn) => fn.id === label.id)!,
    }));
  }, [
    sampled,
    size,
    viewport,
    axes,
    ticks,
    referenceLines,
    points,
    dragging,
    settling,
    obstacles,
    functions,
    props.legendFunctions,
    props.selected,
    symbolicAxes,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = "#fafaf8";
    ctx.fillRect(0, 0, size.width, size.height);
    const minX = viewport.cx - size.width / (2 * viewport.scale);
    const maxX = viewport.cx + size.width / (2 * viewport.scale);
    const minY = viewport.cy - size.height / (2 * viewport.scale);
    const maxY = viewport.cy + size.height / (2 * viewport.scale);
    const symbolicStep = piTickStep(viewport.scale);
    const step = gridStep(viewport.scale);
    const yStep = step;
    const origin = toScreen({ x: 0, y: 0 });
    ctx.font = "12px Georgia, serif";
    ctx.textBaseline = "middle";
    for (
      let x = Math.ceil(minX / step) * step, count = 0;
      x <= maxX && count < 500;
      x += step, count++
    ) {
      const sx = toScreen({ x, y: 0 }).x;
      if (grid) {
        ctx.beginPath();
        ctx.strokeStyle = "#e9ece7";
        ctx.lineWidth = 1;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, size.height);
        ctx.stroke();
      }
      if (ticks && Math.abs(x) > step * 1e-8) {
        ctx.fillStyle = "#64706f";
        ctx.textAlign = "center";
        ctx.font = "12px Georgia, serif";
        ctx.fillText(
          formatNumber(x),
          sx,
          Math.max(14, Math.min(size.height - 14, origin.y + 17)),
        );
      }
    }
    for (
      let y = Math.ceil(minY / yStep) * yStep, count = 0;
      y <= maxY && count < 500;
      y += yStep, count++
    ) {
      const sy = toScreen({ x: 0, y }).y;
      if (grid) {
        ctx.beginPath();
        ctx.strokeStyle = "#e9ece7";
        ctx.lineWidth = 1;
        ctx.moveTo(0, sy);
        ctx.lineTo(size.width, sy);
        ctx.stroke();
      }
      if (ticks && Math.abs(y) > yStep * 1e-8) {
        ctx.fillStyle = "#64706f";
        ctx.textAlign = "left";
        ctx.font = "12px Georgia, serif";
        ctx.fillText(
          formatNumber(y),
          Math.max(8, Math.min(size.width - 55, origin.x + 9)),
          sy,
        );
      }
    }
    // π is an additional coordinate annotation; the integer grid stays intact.
    ctx.font = "12px Georgia, serif";
    ctx.fillStyle = "#467b6b";
    if (ticks && symbolicAxes.x) {
      ctx.textAlign = "center";
      for (
        let value = Math.ceil(minX / symbolicStep.step) * symbolicStep.step,
          count = 0;
        value <= maxX && count < 500;
        value += symbolicStep.step, count++
      ) {
        if (Math.abs(value) < symbolicStep.step * 1e-8) continue;
        ctx.fillText(
          formatPiTick(Math.round(value / symbolicStep.step), symbolicStep),
          toScreen({ x: value, y: 0 }).x,
          Math.max(34, Math.min(size.height - 12, origin.y + 36)),
        );
      }
    }
    if (ticks && symbolicAxes.y) {
      ctx.textAlign = "right";
      for (
        let value = Math.ceil(minY / symbolicStep.step) * symbolicStep.step,
          count = 0;
        value <= maxY && count < 500;
        value += symbolicStep.step, count++
      ) {
        if (Math.abs(value) < symbolicStep.step * 1e-8) continue;
        ctx.fillText(
          formatPiTick(Math.round(value / symbolicStep.step), symbolicStep),
          Math.max(55, Math.min(size.width - 8, origin.x - 10)),
          toScreen({ x: 0, y: value }).y,
        );
      }
    }
    if (axes) {
      ctx.font = "12px Georgia, serif";
      ctx.strokeStyle = "#39434b";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, origin.y);
      ctx.lineTo(size.width, origin.y);
      ctx.moveTo(origin.x, 0);
      ctx.lineTo(origin.x, size.height);
      ctx.stroke();
      ctx.fillStyle = "#39434b";
      ctx.textAlign = "left";
      if (origin.y >= 0 && origin.y <= size.height)
        ctx.fillText("x", size.width - 14, Math.max(12, origin.y - 13));
      if (origin.x >= 0 && origin.x <= size.width)
        ctx.fillText("y", Math.min(size.width - 14, origin.x + 12), 12);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size.width, size.height);
    ctx.clip();
    referenceLines.forEach(({ a, b, c }) => {
      if (![a, b, c].every(Number.isFinite) || (a === 0 && b === 0)) return;
      const candidates: GraphPoint[] = [];
      if (b !== 0)
        for (const x of [minX, maxX]) {
          const y = -(a * x + c) / b;
          if (y >= minY && y <= maxY) candidates.push({ x, y });
        }
      if (a !== 0)
        for (const y of [minY, maxY]) {
          const x = -(b * y + c) / a;
          if (x >= minX && x <= maxX) candidates.push({ x, y });
        }
      if (candidates.length < 2) return;
      const start = toScreen(candidates[0]);
      const end = toScreen(candidates[candidates.length - 1]);
      ctx.beginPath();
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    let curveIndex = 0;
    functions
      .filter((fn) => fn.visible)
      .forEach((fn) => {
        const curve = sampled[curveIndex++];
        if (!curve) return;
        ctx.strokeStyle = fn.color;
        ctx.lineWidth = fn.id === props.selected ? 3.2 : 2.3;
        ctx.lineJoin = "round";
        ctx.setLineDash(fn.lineStyle === "dashed" ? [8, 5] : []);
        curve.segments.forEach((segment) => {
          if (segment.length === 1) {
            const p = toScreen(segment[0]);
            if (
              p.x >= -4 &&
              p.x <= size.width + 4 &&
              p.y >= -4 &&
              p.y <= size.height + 4
            ) {
              ctx.beginPath();
              ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
              ctx.fillStyle = fn.color;
              ctx.fill();
            }
            return;
          }
          ctx.beginPath();
          let previous: GraphPoint | undefined;
          let drawnEnd: GraphPoint | undefined;
          segment.forEach((point) => {
            const screen = toScreen(point);
            if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) {
              previous = undefined;
              drawnEnd = undefined;
              return;
            }
            if (previous) {
              const clipped = clipSegment(
                previous,
                screen,
                size.width,
                size.height,
              );
              if (clipped) {
                if (
                  !drawnEnd ||
                  Math.hypot(
                    drawnEnd.x - clipped[0].x,
                    drawnEnd.y - clipped[0].y,
                  ) > 0.01
                )
                  ctx.moveTo(clipped[0].x, clipped[0].y);
                ctx.lineTo(clipped[1].x, clipped[1].y);
                drawnEnd = clipped[1];
              } else drawnEnd = undefined;
            }
            previous = screen;
          });
          ctx.stroke();
        });
      });
    ctx.setLineDash([]);
    points.forEach((point, index) => {
      const screen = toScreen(point);
      if (
        !Number.isFinite(screen.x) ||
        !Number.isFinite(screen.y) ||
        screen.x < -8 ||
        screen.y < -8 ||
        screen.x > size.width + 8 ||
        screen.y > size.height + 8
      )
        return;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "#172a43";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#334155";
      ctx.font = "12px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(
        `${point.label || pointLabel(index)} (${formatNumber(point.x)}, ${formatNumber(point.y)})`,
        screen.x + 9,
        screen.y - 12,
      );
    });
    if (hover && !dragging) {
      const screen = toScreen(hover);
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(screen.x, 0);
      ctx.lineTo(screen.x, size.height);
      ctx.moveTo(0, screen.y);
      ctx.lineTo(size.width, screen.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = "#334155";
      ctx.fill();
    }
    ctx.restore();
  }, [
    functions,
    sampled,
    viewport,
    size,
    grid,
    axes,
    ticks,
    points,
    referenceLines,
    hover,
    dragging,
    props.selected,
    symbolicAxes,
  ]);

  const locate = (x: number, y: number) => {
    let nearest = toWorld(x, y);
    let distance = 15;
    for (const curve of sampled)
      for (const segment of curve.segments)
        for (const point of segment) {
          const screen = toScreen(point);
          const d = Math.hypot(screen.x - x, screen.y - y);
          if (d < distance) {
            distance = d;
            nearest = point;
          }
        }
    return nearest;
  };

  // Coalesce touch updates into one render per frame while retaining the
  // latest viewport for transitions between one and two fingers.
  function updateGesture(next: Viewport) {
    liveViewport.current = next;
    if (gestureFrame.current === null)
      gestureFrame.current = requestAnimationFrame(() => {
        gestureFrame.current = null;
        latest.current.onViewportChange(liveViewport.current);
      });
  }
  function rebaseGesture(continued = false) {
    const fingers = [...pointers.current.values()];
    const canvas = canvasRef.current;
    const bounds = canvas && {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    };
    const current = liveViewport.current;
    pinch.current = null;
    if (fingers.length >= 2 && bounds) {
      const [first, second] = fingers;
      pinch.current = beginPinch(
        current,
        first,
        second,
        bounds.width,
        bounds.height,
      );
      drag.current = null;
    } else if (fingers.length === 1) {
      drag.current = {
        ...fingers[0],
        viewport: { ...current },
        moved: continued,
      };
    } else drag.current = null;
  }
  function endPointer(id: number) {
    if (!pointers.current.delete(id)) return;
    rebaseGesture(true);
    setDragging(pointers.current.size > 0);
  }
  useEffect(
    () => () => {
      if (gestureFrame.current !== null)
        cancelAnimationFrame(gestureFrame.current);
    },
    [],
  );

  return (
    <div
      ref={hostRef}
      className="graph-canvas-wrap"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        data-x-axis-labels={symbolicAxes.x ? "pi" : "numeric"}
        data-y-axis-labels={symbolicAxes.y ? "pi" : "numeric"}
        aria-label="函数坐标图，双指缩放，单指拖动，鼠标点击或触屏长按标记坐标"
        role="img"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
          cursor: dragging ? "grabbing" : "crosshair",
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          if (pointers.current.size === 0)
            pressTime.current = performance.now();
          pointers.current.set(
            event.pointerId,
            canvasPosition(event.currentTarget, event.clientX, event.clientY),
          );
          rebaseGesture();
          setHover(null);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const bounds = {
            width: event.currentTarget.clientWidth,
            height: event.currentTarget.clientHeight,
          };
          const point = canvasPosition(
            event.currentTarget,
            event.clientX,
            event.clientY,
          );
          if (pointers.current.has(event.pointerId)) {
            pointers.current.set(event.pointerId, point);
            const fingers = [...pointers.current.values()];
            if (pinch.current && fingers.length >= 2) {
              const [first, second] = fingers;
              updateGesture(
                movePinch(
                  pinch.current,
                  first,
                  second,
                  bounds.width,
                  bounds.height,
                ),
              );
            } else if (drag.current) {
              const dx = point.x - drag.current.x;
              const dy = point.y - drag.current.y;
              if (Math.hypot(dx, dy) > 5) drag.current.moved = true;
              if (drag.current.moved)
                updateGesture({
                  ...drag.current.viewport,
                  cx:
                    drag.current.viewport.cx - dx / drag.current.viewport.scale,
                  cy:
                    drag.current.viewport.cy + dy / drag.current.viewport.scale,
                });
            }
          } else if (event.pointerType === "mouse") {
            const nearest = locate(point.x, point.y);
            setHover(nearest);
            onHover?.(nearest);
          }
        }}
        onPointerUp={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          if (
            pointers.current.size === 1 &&
            drag.current &&
            !drag.current.moved
          ) {
            const click = canvasPosition(
              event.currentTarget,
              event.clientX,
              event.clientY,
            );
            let closest = "",
              distance = 14;
            for (const curve of sampled)
              for (const segment of curve.segments)
                for (let i = 1; i < segment.length; i++) {
                  const d = segmentDistance(
                    click,
                    toScreen(segment[i - 1]),
                    toScreen(segment[i]),
                  );
                  if (
                    d < distance &&
                    (props.legendFunctions || functions).some(
                      (fn) => fn.id === curve.fn.id,
                    )
                  ) {
                    distance = d;
                    closest = curve.fn.id;
                  }
                }
            const longPress = performance.now() - pressTime.current >= 450;
            if (closest && !longPress) props.onSelect?.(closest);
            else if (event.pointerType === "mouse" || longPress)
              onPoint(locate(click.x, click.y));
          }
          endPointer(event.pointerId);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => endPointer(event.pointerId)}
        onLostPointerCapture={(event) => endPointer(event.pointerId)}
        onPointerLeave={() => {
          setHover(null);
          onHover?.(null);
        }}
      />
      <div className="graph-legend" aria-label="图像函数目录">
        {(legendExpanded ? visibleLegend : visibleLegend.slice(0, 3)).map(
          (fn) => (
            <button
              key={fn.id}
              className={props.selected === fn.id ? "selected" : ""}
              style={{ color: fn.color }}
              onClick={() => props.onSelect?.(fn.id)}
              aria-label={`选择 ${fn.alias || fn.name}`}
              aria-pressed={props.selected === fn.id}
            >
              <span className="legend-name">
                {fn.kind === "function"
                  ? `${fn.alias || "f"}(${fn.variable || "x"}) = `
                  : `${fn.alias} : `}
              </span>
              <MathFormula expression={fn.currentExpression} />
            </button>
          ),
        )}
        {visibleLegend.length > 3 && (
          <button
            className="legend-expand"
            onClick={() => setLegendExpanded(!legendExpanded)}
          >
            {legendExpanded
              ? "收起目录"
              : `展开全部（${visibleLegend.length}）`}
          </button>
        )}
      </div>
      <div className="curve-label-layer" aria-label="曲线名称">
        {curveLabels.map(({ fn, x, y, width, height }) => (
          <button
            className={`curve-label ${fn.id === props.selected ? "selected" : ""}`}
            key={fn.id}
            style={{ left: x, top: y, width, height, color: fn.color }}
            onClick={() => props.onSelect?.(fn.id)}
            aria-label={`选择曲线 ${fn.alias || fn.name}`}
          >
            {fn.kind === "function"
              ? `${fn.alias || "f"}(${fn.variable || "x"})`
              : fn.alias || fn.name}
          </button>
        ))}
      </div>
      {hover && !dragging && (
        <output
          style={{
            position: "absolute",
            right: 16,
            bottom: 16,
            padding: "6px 10px",
            background: "rgba(255,255,255,.94)",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            color: "#475569",
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          x = {formatNumber(hover.x)} · y = {formatNumber(hover.y)}
        </output>
      )}
    </div>
  );
}
