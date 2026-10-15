import { useEffect, useRef, useState } from "react";
import {
  MoreVertical,
  Copy,
  Trash2,
  Lock,
  Unlock,
  Focus,
  SlidersHorizontal,
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
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
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
          onClick={() => onSelect(fn.id)}
        >
          <label
            className="function-color"
            style={{ background: fn.color }}
            title="曲线颜色"
          >
            <input
              type="color"
              aria-label={`颜色 ${fn.name}`}
              value={fn.color}
              disabled={fn.locked}
              onChange={(e) => onChange({ ...fn, color: e.target.value })}
            />
          </label>
          <button
            className="function-formula"
            aria-label={`编辑 ${fn.name}`}
            disabled={fn.locked || fn.kind === "relation"}
            onClick={() => onEdit(fn)}
          >
            {fn.kind === "function" && (
              <span className="formula-name">
                {fn.alias ? `${fn.alias}(${fn.variable || "x"})` : "y"} ={" "}
              </span>
            )}
            <MathFormula expression={fn.currentExpression} />
          </button>
          <button
            className={`visibility-switch ${fn.visible ? "on" : ""}`}
            role="switch"
            aria-checked={fn.visible}
            aria-label={`显示隐藏 ${fn.name}`}
            onClick={() => onChange({ ...fn, visible: !fn.visible })}
          >
            <span />
          </button>
          <button
            className="function-delete"
            aria-label={`删除 ${fn.name}`}
            title={`删除 ${fn.name}`}
            disabled={fn.locked}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(fn.id);
            }}
          >
            <Trash2 size={17} />
          </button>
          <button
            className="function-more"
            aria-label={`更多操作 ${fn.name}`}
            aria-expanded={menu === fn.id}
            onClick={() => setMenu(menu === fn.id ? "" : fn.id)}
          >
            <MoreVertical size={19} />
          </button>
          {menu === fn.id && (
            <div className="function-menu">
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
              <button
                className="danger"
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
