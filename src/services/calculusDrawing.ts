import type { GraphPoint } from "../types/function";
export interface CalculusDecoration {
  axis?: "x" | "y";
  band?: { min: number; max: number };
  curves: { segments: GraphPoint[][]; color: string; dashed?: boolean }[];
  area?: { segments: GraphPoint[][]; from: number; to: number };
  probe?: {
    x: number;
    points: {
      y: number;
      color: string;
      slope?: number;
      leftSlope?: number;
      rightSlope?: number;
      open?: boolean;
    }[];
  };
}
export function drawCalculus(
  ctx: CanvasRenderingContext2D,
  data: CalculusDecoration,
  screen: (p: GraphPoint) => GraphPoint,
  width: number,
  height: number,
  areaOnly = false,
) {
  const worldScreen = screen;
  screen = (p) => worldScreen(data.axis === "y" ? { x: p.y, y: p.x } : p);
  const bounded = (p: GraphPoint) => {
    const s = screen(p);
    return {
      x: Math.max(-width * 2, Math.min(width * 3, s.x)),
      y: Math.max(-height * 2, Math.min(height * 3, s.y)),
    };
  };
  ctx.save();
  if (areaOnly && data.band) {
    const a = screen({ x: data.band.min, y: 0 }),
      b = screen({ x: data.band.max, y: 0 });
    ctx.fillStyle = "rgba(48,148,114,.08)";
    if (data.axis === "y")
      ctx.fillRect(0, Math.min(a.y, b.y), width, Math.abs(a.y - b.y));
    else ctx.fillRect(Math.min(a.x, b.x), 0, Math.abs(a.x - b.x), height);
  }
  if (areaOnly && data.area) {
    const { from, to, segments } = data.area;
    const lo = Math.min(from, to),
      hi = Math.max(from, to);
    for (const segment of segments)
      for (let i = 1; i < segment.length; i++) {
        const a = segment[i - 1],
          b = segment[i];
        if (b.x <= lo || a.x >= hi || a.x === b.x) continue;
        const l = Math.max(a.x, lo),
          r = Math.min(b.x, hi);
        const y = (x: number) => a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
        const cuts = [
          l,
          ...(y(l) * y(r) < 0 ? [l - (y(l) * (r - l)) / (y(r) - y(l))] : []),
          r,
        ];
        for (let j = 1; j < cuts.length; j++) {
          const left = cuts[j - 1],
            right = cuts[j];
          const p = bounded({ x: left, y: y(left) }),
            q = bounded({ x: right, y: y(right) });
          const baseLeft = bounded({ x: left, y: 0 }),
            baseRight = bounded({ x: right, y: 0 });
          ctx.fillStyle =
            y((left + right) / 2) >= 0
              ? "rgba(35,157,139,.21)"
              : "rgba(225,117,75,.23)";
          ctx.beginPath();
          ctx.moveTo(baseLeft.x, baseLeft.y);
          ctx.lineTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.lineTo(baseRight.x, baseRight.y);
          ctx.closePath();
          ctx.fill();
        }
      }
  }
  if (!areaOnly) {
    for (const curve of data.curves) {
      ctx.strokeStyle = curve.color;
      ctx.lineWidth = 2.7;
      ctx.setLineDash(curve.dashed ? [7, 4] : []);
      for (const segment of curve.segments) {
        ctx.beginPath();
        segment.forEach((p, i) => {
          const s = bounded(p);
          if (i) ctx.lineTo(s.x, s.y);
          else ctx.moveTo(s.x, s.y);
        });
        ctx.stroke();
      }
    }
    if (data.probe) {
      const { x, points } = data.probe;
      const position = screen({ x, y: 0 });
      ctx.strokeStyle = "#a6b7c5";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      if (data.axis === "y") {
        ctx.moveTo(0, position.y);
        ctx.lineTo(width, position.y);
      } else {
        ctx.moveTo(position.x, 0);
        ctx.lineTo(position.x, height);
      }
      ctx.stroke();
      for (const p of points) {
        if (!Number.isFinite(p.y)) continue;
        const s = screen({ x, y: p.y });
        ctx.strokeStyle = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const projection = screen({ x: 0, y: p.y });
        ctx.moveTo(projection.x, projection.y);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        if (p.slope !== undefined && Number.isFinite(p.slope)) {
          const worldDelta =
            70 /
            Math.max(
              1,
              Math.hypot(
                screen({ x: x + 1, y: p.y + p.slope }).x - s.x,
                screen({ x: x + 1, y: p.y + p.slope }).y - s.y,
              ),
            );
          const a = screen({
              x: x - worldDelta,
              y: p.y - p.slope * worldDelta,
            }),
            b = screen({ x: x + worldDelta, y: p.y + p.slope * worldDelta });
          ctx.setLineDash([]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        for (const [side, slope] of [
          [-1, p.leftSlope],
          [1, p.rightSlope],
        ] as const) {
          if (slope === undefined || !Number.isFinite(slope)) continue;
          const unit = screen({ x: x + 1, y: p.y + slope });
          const delta =
            (side * 65) / Math.max(1, Math.hypot(unit.x - s.x, unit.y - s.y));
          const end = screen({ x: x + delta, y: p.y + slope * delta });
          ctx.setLineDash([4, 3]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        if (p.open) {
          ctx.fillStyle = "white";
          ctx.fill();
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else ctx.fill();
        if (!p.open) {
          ctx.strokeStyle = "white";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}
