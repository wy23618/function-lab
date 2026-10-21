import { describe, expect, it } from "vitest";
import { decodeWorkspace, defaultWorkspace } from "../services/workspaceStore";

describe("workspace persistence", () => {
  const workspace = {
    ...defaultWorkspace,
    viewport: { cx: 3, cy: -2, scale: 80 },
    points: [{ x: 2, y: 4, label: "A" }],
    refs: [{ a: 1, b: -1, c: 0 }],
    grid: false,
  };
  it("restores the view, observation points, reference lines, and display preferences", () => {
    expect(decodeWorkspace(JSON.stringify(workspace))).toEqual(workspace);
  });
  it("rejects malformed records and unsupported versions", () => {
    for (const raw of [
      "{",
      "null",
      "[]",
      JSON.stringify({ ...workspace, version: 2 }),
    ])
      expect(() => decodeWorkspace(raw)).toThrow();
  });
  it("rejects invalid camera scales and coordinates before rendering", () => {
    for (const viewport of [
      { cx: null, cy: 0, scale: 55 },
      { cx: 0, cy: 0, scale: 0 },
      { cx: 0, cy: 0, scale: 100001 },
    ])
      expect(() =>
        decodeWorkspace(JSON.stringify({ ...workspace, viewport })),
      ).toThrow();
  });
  it("rejects invalid or excessively large observation sets", () => {
    for (const points of [
      [{ x: "2", y: 3 }],
      [{ x: 2, y: null }],
      [{ x: 2, y: 3, label: "a".repeat(101) }],
      Array(5001).fill({ x: 0, y: 0 }),
    ])
      expect(() =>
        decodeWorkspace(JSON.stringify({ ...workspace, points })),
      ).toThrow();
  });
  it("rejects degenerate reflection lines and non-boolean preferences", () => {
    expect(() =>
      decodeWorkspace(
        JSON.stringify({ ...workspace, refs: [{ a: 0, b: 0, c: 1 }] }),
      ),
    ).toThrow();
    expect(() =>
      decodeWorkspace(JSON.stringify({ ...workspace, grid: "false" })),
    ).toThrow();
  });
});
