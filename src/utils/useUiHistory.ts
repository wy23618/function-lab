import { useEffect, useRef, useState } from "react";
export type UiSnapshot = {
  panel: boolean;
  mode: string;
  keyboard: boolean;
  settings: boolean;
  help: boolean;
  palette: boolean;
  landscape: boolean;
};
const base: UiSnapshot = {
  panel: false,
  mode: "more",
  keyboard: false,
  settings: false,
  help: false,
  palette: false,
  landscape: false,
};
const mainTools = new Set(["translate", "symmetry", "compose", "more"]);
export function uiLayers(s: UiSnapshot): string[] {
  return [
    ...(s.landscape ? ["landscape"] : []),
    ...(s.panel ? ["panel"] : []),
    ...(s.panel && !mainTools.has(s.mode) ? ["subtool"] : []),
    ...(s.keyboard ? ["keyboard"] : []),
    ...(s.settings ? ["settings"] : []),
    ...(s.help ? ["help"] : []),
    ...(s.palette ? ["palette"] : []),
  ];
}
export function uiAtDepth(s: UiSnapshot, depth: number): UiSnapshot {
  const keys = new Set(uiLayers(s).slice(0, depth));
  return {
    landscape: keys.has("landscape"),
    panel: keys.has("panel"),
    mode: mainTools.has(s.mode) || keys.has("subtool") ? s.mode : "more",
    keyboard: keys.has("keyboard"),
    settings: keys.has("settings"),
    help: keys.has("help"),
    palette: keys.has("palette"),
  };
}
/** Each overlay gets a history frame; button dismissals don't reopen stale layers. */
export function useUiHistory(
  snapshot: UiSnapshot,
  onRestore: (s: UiSnapshot) => void,
) {
  const latest = useRef({ snapshot, onRestore });
  latest.current = { snapshot, onRestore };
  const previous = useRef(base),
    pending = useRef(false),
    initialized = useRef(false);
  const [revision, setRevision] = useState(0);
  const serialized = JSON.stringify(snapshot);
  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      const next: UiSnapshot = event.state?.functionLabState || base;
      previous.current = next;
      if (pending.current) {
        pending.current = false;
        setRevision((v) => v + 1);
      } else latest.current.onRestore(next);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const state = latest.current.snapshot;
    const write = (value: UiSnapshot, push = false) =>
      window.history[push ? "pushState" : "replaceState"](
        {
          ...window.history.state,
          functionLabOverlay: false,
          functionLabState: value,
        },
        "",
        window.location.href,
      );
    if (!initialized.current) {
      initialized.current = true;
      write(base);
    }
    if (pending.current) return;
    const oldDepth = uiLayers(previous.current).length,
      newDepth = uiLayers(state).length;
    if (newDepth < oldDepth) {
      pending.current = true;
      window.history.go(newDepth - oldDepth);
      return;
    }
    if (
      newDepth > oldDepth &&
      oldDepth > 0 &&
      uiLayers(previous.current).join("|") !==
        uiLayers(state).slice(0, oldDepth).join("|")
    )
      write(uiAtDepth(state, oldDepth));
    for (let depth = oldDepth + 1; depth <= newDepth; depth++)
      write(uiAtDepth(state, depth), true);
    write(state);
    previous.current = state;
  }, [serialized, revision]);
}
