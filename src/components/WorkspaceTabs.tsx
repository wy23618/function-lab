export type WorkspaceMode = "graph" | "derivative" | "integral" | "taylor";
const modes = [
  ["graph", "画图", "ƒ"],
  ["derivative", "导数", "d"],
  ["integral", "积分", "∫"],
  ["taylor", "泰勒", "Σ"],
] as const;
export default function WorkspaceTabs({
  mode,
  onChange,
  compact = false,
}: {
  mode: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
  compact?: boolean;
}) {
  return (
    <nav
      className={compact ? "landscape-workspace-mode" : "workspace-mode"}
      aria-label="工作台模式"
    >
      <div role="tablist" aria-label="研究方式">
        {modes.map(([key, title, symbol]) => (
          <button
            key={key}
            role="tab"
            aria-label={title}
            tabIndex={mode === key ? 0 : -1}
            aria-selected={mode === key}
            aria-pressed={mode === key}
            onClick={() => onChange(key)}
            onKeyDown={(e) => {
              const index = modes.findIndex(([value]) => value === key);
              const next =
                e.key === "ArrowRight"
                  ? (index + 1) % 4
                  : e.key === "ArrowLeft"
                    ? (index + 3) % 4
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? 3
                        : -1;
              if (next < 0) return;
              e.preventDefault();
              onChange(modes[next][0]);
              const target =
                e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  "button",
                )[next];
              requestAnimationFrame(() => target?.focus());
            }}
          >
            <i aria-hidden="true">{symbol}</i>
            {title}
          </button>
        ))}
      </div>
    </nav>
  );
}
