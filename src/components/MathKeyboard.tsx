import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { MathInputAction } from "../utils/mathInput";
import { Delete } from "lucide-react";
const groups = ["常用", "字母", "函数", "符号"] as const;
type Key = { label: string; action: MathInputAction };
const textKey = (label: string, value = label): Key => ({
  label,
  action: { type: "insert", value },
});
const functionKey = (name: string, label = name): Key => ({
  label,
  action: { type: "wrap", prefix: name + "(", suffix: ")" },
});
const numbers: Key[] = [
  textKey("7"),
  textKey("8"),
  textKey("9"),
  textKey("÷", "/"),
  textKey("xʸ", "^"),
  functionKey("sqrt", "√"),
  textKey("4"),
  textKey("5"),
  textKey("6"),
  textKey("×", "*"),
  textKey("("),
  textKey(")"),
  textKey("1"),
  textKey("2"),
  textKey("3"),
  textKey("−", "-"),
  textKey("x"),
  textKey("y"),
  textKey("0"),
  textKey("."),
  textKey("+"),
  textKey("π"),
  textKey("e"),
  functionKey("ln"),
  functionKey("sin"),
  functionKey("cos"),
  functionKey("tan"),
  textKey("x²", "^2"),
  functionKey("abs", "|a|"),
  textKey("="),
];
const functions = [
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "ln",
  "log",
  "exp",
  "sqrt",
  "abs",
  "sign",
  "sinh",
  "cosh",
  "tanh",
  "asinh",
  "floor",
  "ceil",
  "round",
  "min",
  "max",
].map((name) =>
  functionKey(name, name === "sqrt" ? "√" : name === "abs" ? "|a|" : name),
);
const symbols: Key[] = [
  { label: "a/b", action: { type: "template", value: "($)/(1)", select: "1" } },
  textKey("<"),
  textKey("≤", "<="),
  textKey("?"),
  textKey(":"),
  textKey("t"),
  textKey("("),
  textKey(")"),
  textKey(","),
  textKey("="),
  textKey("π"),
  textKey("e"),
  functionKey("sqrt", "√"),
  functionKey("abs", "|a|"),
  textKey("x²", "^2"),
  textKey("x³", "^3"),
  { label: "xʸ", action: { type: "wrap", prefix: "^(", suffix: ")" } },
  textKey("%"),
  functionKey("f", "f( )"),
  functionKey("g", "g( )"),
  { label: "(a)", action: { type: "wrap", prefix: "(", suffix: ")" } },
  textKey("÷", "/"),
  textKey("×", "*"),
  textKey("−", "-"),
  textKey("+"),
  textKey("空格", " "),
  { label: "行首", action: { type: "home" } },
  { label: "行尾", action: { type: "end" } },
  { label: "全选", action: { type: "selectAll" } },
  { label: "Del", action: { type: "delete" } },
];
export default function MathKeyboard({
  edit,
}: {
  edit: (action: MathInputAction, touchInput: boolean) => void;
}) {
  const [group, setGroup] = useState<(typeof groups)[number]>("常用");
  const [upper, setUpper] = useState(false);
  const touchInput = useRef(false);
  const keys =
    group === "常用"
      ? numbers
      : group === "函数"
        ? functions
        : group === "符号"
          ? symbols
          : Array.from(
              new Set(
                upper
                  ? "XTMNABQWERTYUIOPASDFGHJKLZXCVBNM"
                  : "xtmnabqwertyuiopasdfghjklzxcvbnm",
              ),
            ).map((letter) => textKey(letter));
  function press(action: MathInputAction) {
    edit(
      action,
      touchInput.current ||
        window.matchMedia("(any-pointer: coarse)").matches ||
        window.matchMedia("(max-width: 800px)").matches,
    );
    touchInput.current = false;
  }
  const buttonEvents = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      touchInput.current = e.pointerType === "touch" || e.pointerType === "pen";
      if (e.currentTarget.disabled) return;
    },
  };
  return (
    <div className="keyboard" aria-label="数学输入键盘">
      <div className="keyboard-top-row">
        <div className="keyboard-tabs" role="tablist" aria-label="数学按键分类">
          {groups.map((g) => (
            <button
              type="button"
              role="tab"
              aria-selected={group === g}
              key={g}
              {...buttonEvents}
              onClick={() => setGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div
        className="keyboard-keys"
        role="tabpanel"
        aria-label={`${group}按键`}
      >
        {keys.map((key, i) => (
          <button
            type="button"
            key={`${group}-${i}`}
            {...buttonEvents}
            onClick={() => press(key.action)}
          >
            {key.label}
          </button>
        ))}
        {group === "字母" && (
          <button
            type="button"
            className={upper ? "active" : ""}
            {...buttonEvents}
            onClick={() => setUpper(!upper)}
            aria-label="切换大小写"
          >
            {upper ? "小写" : "大写"}
          </button>
        )}
      </div>
      <div className="keyboard-edit-tools">
        <button
          type="button"
          aria-label="光标左移"
          {...buttonEvents}
          onClick={() => press({ type: "left" })}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="光标右移"
          {...buttonEvents}
          onClick={() => press({ type: "right" })}
        >
          →
        </button>
        <button
          type="button"
          aria-label="跳出括号"
          {...buttonEvents}
          onClick={() => press({ type: "nextSlot" })}
        >
          跳出
        </button>
        <button
          type="button"
          className="keyboard-backspace"
          aria-label="退格删除一个字符"
          {...buttonEvents}
          onClick={() => press({ type: "backspace" })}
        >
          <Delete size={19} />
          退格
        </button>
      </div>
    </div>
  );
}
