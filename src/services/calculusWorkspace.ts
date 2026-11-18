export const calculusWorkspaceKey = "function-lab-calculus-v2";
export const defaultCalculusWorkspace = {
  mode: "integral" as "integral" | "derivative" | "taylor",
  aText: "0",
  bText: "1",
  breakText: "0",
  centerText: "0",
  constantText: "0",
  order: 1,
  degree: 3,
  x: 1,
  definite: false,
  queries: "-1, 0, 1, 2",
  tolerance: "0.001",
};
export type CalculusWorkspace = typeof defaultCalculusWorkspace;
export function loadCalculusWorkspace(): CalculusWorkspace {
  const defaults = structuredClone(defaultCalculusWorkspace);
  try {
    const raw = localStorage.getItem(calculusWorkspaceKey);
    if (!raw || raw.length > 50000) return defaults;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return defaults;
    const valid: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(defaults)) {
      const candidate = data[key];
      if (
        (typeof value === "string" &&
          typeof candidate === "string" &&
          candidate.length <= 4000) ||
        (typeof value === "number" && Number.isFinite(candidate)) ||
        (typeof value === "boolean" && typeof candidate === "boolean") ||
        (value === null &&
          (candidate === null ||
            (typeof candidate === "string" && candidate.length <= 4000)))
      )
        valid[key] = candidate;
    }
    if (!["integral", "derivative", "taylor"].includes(String(valid.mode)))
      delete valid.mode;
    if (
      !Number.isInteger(valid.order) ||
      Number(valid.order) < 0 ||
      Number(valid.order) > 12
    )
      delete valid.order;
    if (
      !Number.isInteger(valid.degree) ||
      Number(valid.degree) < 0 ||
      Number(valid.degree) > 12
    )
      delete valid.degree;
    return { ...defaults, ...valid };
  } catch {
    return defaults;
  }
}
