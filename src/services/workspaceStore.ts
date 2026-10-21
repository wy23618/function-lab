import type { GraphPoint, Viewport } from "../types/function";

export const workspaceKey = "function-lab-workspace-v1";
export const defaultView: Viewport = { cx: 0, cy: 0, scale: 55 };
export type WorkspaceState = {
  version: 1;
  viewport: Viewport;
  points: GraphPoint[];
  refs: { a: number; b: number; c: number }[];
  grid: boolean;
  axes: boolean;
  ticks: boolean;
};
export const defaultWorkspace: WorkspaceState = {
  version: 1,
  viewport: defaultView,
  points: [],
  refs: [],
  grid: true,
  axes: true,
  ticks: true,
};

/** Keep workspace preferences separate from the existing function library. */
export function decodeWorkspace(raw: string): WorkspaceState {
  if (raw.length > 1_000_000) throw new Error("工作台记录过大。");
  const data = JSON.parse(raw) as WorkspaceState;
  if (
    !data ||
    data.version !== 1 ||
    !data.viewport ||
    ![data.viewport.cx, data.viewport.cy, data.viewport.scale].every(
      Number.isFinite,
    ) ||
    data.viewport.scale < 1e-12 ||
    data.viewport.scale > 100000 ||
    !Array.isArray(data.points) ||
    data.points.length > 5000 ||
    data.points.some(
      (p) =>
        !p ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        (p.label !== undefined &&
          (typeof p.label !== "string" || p.label.length > 100)),
    ) ||
    !Array.isArray(data.refs) ||
    data.refs.length > 100 ||
    data.refs.some(
      (r) =>
        !r ||
        ![r.a, r.b, r.c].every(Number.isFinite) ||
        !Number.isFinite(r.a * r.a + r.b * r.b) ||
        r.a * r.a + r.b * r.b === 0,
    ) ||
    ![data.grid, data.axes, data.ticks].every((v) => typeof v === "boolean")
  )
    throw new Error("工作台记录无效。");
  return data;
}

export function loadWorkspace(): WorkspaceState {
  try {
    const raw = localStorage.getItem(workspaceKey);
    return raw ? decodeWorkspace(raw) : defaultWorkspace;
  } catch {
    return defaultWorkspace;
  }
}
