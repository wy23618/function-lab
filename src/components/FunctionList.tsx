import { useEffect, useRef, useState } from "react";
import {
  MoreVertical,
  Copy,
  Trash2,
  Lock,
  Unlock,
  Focus,
  SlidersHorizontal,
  Pencil,
} from "lucide-react";
import type { FunctionDefinition } from "../types/function";
import MathFormula from "./MathFormula";
export default function FunctionList({
  functions,
  selected,
  onSelect,
  onChange,
  onDelete,
  onCopy,
  onSolo,
  onEdit,
  onTools,
}: {
  functions: FunctionDefinition[];
  selected: string;
  onSelect: (id: string) => void;
  onChange: (fn: FunctionDefinition) => void;
  onDelete: (id: string) => void;
  onCopy: (fn: FunctionDefinition) => void;
  onSolo: (id: string) => void;
  onEdit: (fn: FunctionDefinition) => void;
  onTools: (fn: FunctionDefinition) => void;
}) {
  const [menu, setMenu] = useState("");
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) setMenu("");
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu("");
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const run = (action: () => void) => {
    action();
    setMenu("");
  };
  return (
    <div className="function-list" ref={host}>
      {functions.map((fn) => (
        <article
          key={fn.id}
          className={`function-item ${selected === fn.id ? "selected" : ""}`}
          style={{ "--function-color": fn.color } as React.CSSProperties}
          tabIndex={0}
          aria-label={`选择函数 ${fn.alias || fn.name}`}
          aria-current={selected === fn.id ? "true" : undefined}
          onKeyDown={(event) => {
            if (
              event.target === event.currentTarget &&
              event.key === "Delete"
            ) {
              event.preventDefault();
              if (!fn.locked) onDelete(fn.id);
              return;
            }
            if (
              event.target === event.currentTarget &&
              ["Enter", " "].includes(event.key)
            ) {
              event.preventDefault();
              onSelect(fn.id);
            }
          }}
          onClick={() => onSelect(fn.id)}
        >
          <button
            className={`visibility-switch function-visibility ${fn.visible ? "on" : ""}`}
            style={{ color: fn.color }}
            role="switch"
            aria-checked={fn.visible}
            aria-label={`显示隐藏 ${fn.name}`}
            title={fn.visible ? "隐藏曲线" : "显示曲线"}
            onClick={(event) => {
              event.stopPropagation();
              onChange({ ...fn, visible: !fn.visible });
            }}
          >
            <span />
          </button>
          <button
            className="function-formula"
            aria-label={`查看 ${fn.name}`}
            aria-pressed={selected === fn.id}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(fn.id);
            }}
          >
            {fn.kind === "function" && (
              <span className="formula-name">
                {fn.alias ? `${fn.alias}(${fn.variable || "x"})` : "y"} ={" "}
              </span>
            )}
            <MathFormula
              expression={fn.currentExpression}
              knownFunctionNames={Object.keys(fn.bindings ?? {})}
            />
          </button>
          <button
            className="function-edit"
            aria-label={`编辑 ${fn.name}`}
            title="编辑公式"
            disabled={fn.locked || (fn.kind === "relation" && !fn.inputAxis)}
            onClick={(event) => {
              event.stopPropagation();
              onEdit(fn);
            }}
          >
            <Pencil size={15} />
          </button>
          <button
            className="function-delete-direct"
            aria-label={`删除 ${fn.name}`}
            title={fn.locked ? "已锁定，请先解锁" : "删除函数，可撤销"}
            disabled={fn.locked}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(fn.id);
            }}
          >
            <Trash2 size={15} />
          </button>
          <button
            className="function-more"
            aria-label={`更多操作 ${fn.name}`}
            aria-expanded={menu === fn.id}
            onClick={(event) => {
              event.stopPropagation();
              setMenu(menu === fn.id ? "" : fn.id);
            }}
          >
            <MoreVertical size={19} />
          </button>
          {fn.calculusLink && (
            <div className="function-link-note" title={fn.calculusLink.error}>
              {fn.calculusLink.error
                ? "来源不满足条件 · 暂不可用"
                : fn.calculusLink.frozen
                  ? "来源已删除 · 保留最后结果"
                  : `${fn.calculusLink.kind === "derivative" ? `${fn.calculusLink.order} 阶导数` : `${fn.calculusLink.order} 阶泰勒`} · 跟随来源更新`}
            </div>
          )}
          {menu === fn.id && (
            <div
              className="function-menu"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                disabled={
                  fn.locked || (fn.kind === "relation" && !fn.inputAxis)
                }
                onClick={() => run(() => onEdit(fn))}
              >
                <Pencil size={16} />
                编辑公式
              </button>
              <button onClick={() => run(() => onTools(fn))}>
                <SlidersHorizontal size={16} />
                变换与分析
              </button>
              <button onClick={() => run(() => onSolo(fn.id))}>
                <Focus size={16} />
                只看此函数
              </button>
              <button onClick={() => run(() => onCopy(fn))}>
                <Copy size={16} />
                复制函数
              </button>
              <button
                onClick={() =>
                  run(() => onChange({ ...fn, locked: !fn.locked }))
                }
              >
                {fn.locked ? <Unlock size={16} /> : <Lock size={16} />}{" "}
                {fn.locked ? "解锁" : "锁定"}
              </button>
              <label className="function-color-picker">
                曲线颜色
                <input
                  type="color"
                  aria-label={`颜色 ${fn.name}`}
                  value={fn.color}
                  disabled={fn.locked}
                  onChange={(event) =>
                    onChange({ ...fn, color: event.target.value })
                  }
                />
              </label>
              <button
                className="danger function-delete"
                disabled={fn.locked}
                onClick={() => run(() => onDelete(fn.id))}
              >
                <Trash2 size={16} />
                删除函数
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
