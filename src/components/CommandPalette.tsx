import { useEffect, useRef, useState } from "react";

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
/** A keyboard-operable tool finder; focus returns to its entry point on dismissal. */
export default function CommandPalette({
  onAction,
  onClose,
}: {
  onAction: (key: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const results = commands.filter(([, label]) =>
    label
      .toLowerCase()
      .replaceAll(" ", "")
      .includes(query.toLowerCase().replaceAll(" ", "")),
  );
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    host.current?.querySelector("input")?.focus();
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    host.current
      ?.querySelector(`#command-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const run = (key: string) => {
    onClose();
    onAction(key);
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="command-palette"
        ref={host}
        role="dialog"
        aria-modal="true"
        aria-label="搜索数学工具"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
          if (e.key === "Tab") {
            const items =
              host.current?.querySelectorAll<HTMLElement>("input, button");
            if (!items?.length) return;
            const first = items[0],
              last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <input
          placeholder="搜索对称、反函数、切线、定义域…"
          aria-label="搜索工具名称"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="tool-results"
          aria-activedescendant={
            results.length ? `command-${active}` : undefined
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              if (results.length)
                setActive(
                  (index) =>
                    (index +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      results.length) %
                    results.length,
                );
            }
            if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              run(results[active][0]);
            }
          }}
        />
        <div id="tool-results" role="listbox" aria-label="匹配的工具">
          {results.map(([key, label], index) => (
            <button
              id={`command-${index}`}
              key={key}
              role="option"
              aria-selected={index === active}
              onClick={() => run(key)}
            >
              {label}
              <span>↵</span>
            </button>
          ))}
          {!results.length && (
            <p className="command-empty">
              没有找到工具，试试「零点」或「对称」。
            </p>
          )}
        </div>
        <div className="command-footer">
          <small>↑ ↓ 选择 · Enter 打开</small>
          <button onClick={onClose}>
            关闭 <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
