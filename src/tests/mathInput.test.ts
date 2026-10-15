import { describe, expect, it } from "vitest";
import { editMathInput } from "../utils/mathInput";

describe("math keyboard editing", () => {
  it("pairs parentheses and puts the cursor inside", () => {
    expect(editMathInput("x+", 2, 2, { type: "insert", value: "(" })).toEqual({
      text: "x+()",
      start: 3,
      end: 3,
    });
  });
  it("jumps over an existing closing parenthesis", () => {
    expect(
      editMathInput("sin(t)", 5, 5, { type: "insert", value: ")" }),
    ).toEqual({ text: "sin(t)", start: 6, end: 6 });
  });
  it("removes empty paired parentheses together", () => {
    expect(editMathInput("sin()", 4, 4, { type: "backspace" })).toEqual({
      text: "sin",
      start: 3,
      end: 3,
    });
  });
  it("creates an exponent slot and exits it without altering the expression", () => {
    const power = editMathInput("e", 1, 1, { type: "insert", value: "^" });
    expect(power).toEqual({ text: "e^()", start: 3, end: 3 });
    const exponent = editMathInput(power.text, power.start, power.end, {
      type: "insert",
      value: "πx",
    });
    expect(exponent.text).toBe("e^(πx)");
    expect(
      editMathInput(exponent.text, exponent.start, exponent.end, {
        type: "nextSlot",
      }).start,
    ).toBe(6);
  });
  it("opens a function at its argument and fills that position", () => {
    const wrapped = editMathInput("2+", 2, 2, {
      type: "wrap",
      prefix: "sin(",
      suffix: ")",
    });
    expect(wrapped).toEqual({ text: "2+sin()", start: 6, end: 6 });
    expect(
      editMathInput(wrapped.text, wrapped.start, wrapped.end, {
        type: "insert",
        value: "t",
      }).text,
    ).toBe("2+sin(t)");
  });
  it("wraps selected text without losing it", () => {
    expect(
      editMathInput("x+1", 0, 3, {
        type: "wrap",
        prefix: "sqrt(",
        suffix: ")",
      }),
    ).toEqual({ text: "sqrt(x+1)", start: 8, end: 8 });
  });
  it("deletes on either side of the cursor", () => {
    expect(editMathInput("123", 1, 1, { type: "backspace" }).text).toBe("23");
    expect(editMathInput("123", 1, 1, { type: "delete" }).text).toBe("13");
  });
  it("deletes selections and replaces them", () => {
    expect(editMathInput("sin(x)", 4, 5, { type: "backspace" }).text).toBe(
      "sin()",
    );
    expect(
      editMathInput("sin(x)", 4, 5, { type: "insert", value: "m*t+n" }).text,
    ).toBe("sin(m*t+n)");
  });
  it("keeps deletion and navigation inside the input", () => {
    expect(editMathInput("x", 0, 0, { type: "backspace" })).toEqual({
      text: "x",
      start: 0,
      end: 0,
    });
    expect(editMathInput("x", 1, 1, { type: "delete" })).toEqual({
      text: "x",
      start: 1,
      end: 1,
    });
    expect(editMathInput("x", 0, 0, { type: "left" }).start).toBe(0);
    expect(editMathInput("x", 1, 1, { type: "right" }).end).toBe(1);
  });
  it("collapses selections toward the requested direction", () => {
    expect(editMathInput("1234", 1, 3, { type: "left" })).toEqual({
      text: "1234",
      start: 1,
      end: 1,
    });
    expect(editMathInput("1234", 1, 3, { type: "right" })).toEqual({
      text: "1234",
      start: 3,
      end: 3,
    });
  });
});
