import { describe, it, expect } from "vitest";
import { makeFunction } from "../services/transformEngine";
import { chooseFunctionColor } from "../utils/functionColors";
describe("comparison colors", () => {
  it("keeps generated colors distinct beyond the initial palette", () => {
    const functions = [] as ReturnType<typeof makeFunction>[];
    for (let i = 0; i < 30; i++) {
      const color = chooseFunctionColor(functions);
      expect(color).toMatch(/^#[a-f0-9]{6}$/);
      expect(functions.some((f) => f.color === color)).toBe(false);
      functions.push({ ...makeFunction("x"), color });
    }
  });
});
