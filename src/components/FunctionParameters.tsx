import type { FunctionDefinition } from "../types/function";
import { useState } from "react";
function ParameterRow({
  name,
  value,
  locked,
  onChange,
}: {
  name: string;
  value: number;
  locked: boolean;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false),
    [text, setText] = useState(String(value));
  return (
    <label>
      <span>{name}</span>
      <input
        aria-label={`调节参数 ${name}`}
        type="range"
        min={Math.min(-5, value)}
        max={Math.max(5, value)}
        step="0.01"
        value={value}
        disabled={locked}
        onChange={(e) => {
          setEditing(false);
          onChange(Number(e.target.value));
        }}
      />
      <input
        aria-label={`参数 ${name} 数值`}
        type="number"
        step="any"
        value={editing ? text : value}
        disabled={locked}
        onFocus={() => {
          setText(String(value));
          setEditing(true);
        }}
        onBlur={() => setEditing(false)}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value && Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}
export default function FunctionParameters({
  fn,
  onChange,
}: {
  fn?: FunctionDefinition;
  onChange: (fn: FunctionDefinition) => void;
}) {
  if (!fn || !Object.keys(fn.parameters ?? {}).length || fn.calculusLink)
    return null;
  return (
    <div className="composer-parameters" aria-label="当前函数参数">
      {Object.entries(fn.parameters ?? {}).map(([name, value]) => {
        const update = (next: number) => {
          if (Number.isFinite(next))
            onChange({ ...fn, parameters: { ...fn.parameters, [name]: next } });
        };
        return (
          <ParameterRow
            key={`${fn.id}:${name}`}
            name={name}
            value={value}
            locked={fn.locked}
            onChange={update}
          />
        );
      })}
    </div>
  );
}
