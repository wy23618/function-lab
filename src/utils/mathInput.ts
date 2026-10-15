export type MathInputAction =
  | { type: "insert"; value: string }
  | { type: "wrap"; prefix: string; suffix: string }
  | {
      type:
        | "backspace"
        | "delete"
        | "left"
        | "right"
        | "home"
        | "end"
        | "selectAll"
        | "nextSlot"
        | "clear";
    };
export function editMathInput(
  text: string,
  start: number,
  end: number,
  action: MathInputAction,
) {
  start = Math.max(0, Math.min(text.length, start));
  end = Math.max(start, Math.min(text.length, end));
  let replacement = "",
    caret = start;
  switch (action.type) {
    case "left": {
      const pos = start === end ? Math.max(0, start - 1) : start;
      return { text, start: pos, end: pos };
    }
    case "right": {
      const pos = start === end ? Math.min(text.length, end + 1) : end;
      return { text, start: pos, end: pos };
    }
    case "home":
      return { text, start: 0, end: 0 };
    case "end":
      return { text, start: text.length, end: text.length };
    case "selectAll":
      return { text, start: 0, end: text.length };
    case "nextSlot": {
      const next = text.indexOf(")", end);
      const pos = next < 0 ? text.length : next + 1;
      return { text, start: pos, end: pos };
    }
    case "clear":
      return { text: "", start: 0, end: 0 };
    case "backspace":
      if (start === end && text[start - 1] === "(" && text[end] === ")") {
        start--;
        end++;
      } else if (start === end) start = Math.max(0, start - 1);
      caret = start;
      break;
    case "delete":
      if (start === end) end = Math.min(text.length, end + 1);
      break;
    case "insert":
      if (action.value === ")" && start === end && text[start] === ")")
        return { text, start: start + 1, end: start + 1 };
      if (action.value === "(" || action.value === "^") {
        const prefix = action.value === "(" ? "(" : "^(";
        replacement = prefix + text.slice(start, end) + ")";
        caret = start + prefix.length + end - start;
      } else {
        replacement = action.value;
        caret = start + replacement.length;
      }
      break;
    case "wrap":
      replacement = action.prefix + text.slice(start, end) + action.suffix;
      caret = start + action.prefix.length + end - start;
      break;
  }
  return {
    text: text.slice(0, start) + replacement + text.slice(end),
    start: caret,
    end: caret,
  };
}
