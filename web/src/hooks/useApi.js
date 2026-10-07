import { useCallback, useEffect, useRef, useState } from "react";

// Loads data with `fn(signal)`. Race-safe: each run owns an AbortController, and the cleanup aborts it, so when deps
// change (or the page unmounts) an older, slower response can never overwrite a newer one.
// reload() re-fetches while keeping the current data on screen; a deps change clears it (a different record).
export function useApi(fn, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn); fnRef.current = fn;
  const lastDeps = useRef(null), lastTick = useRef(0);

  useEffect(() => {
    if (!enabled) { setState({ data: undefined, error: null, loading: false }); return undefined; }
    const depsKey = JSON.stringify(deps), isReload = lastDeps.current === depsKey && lastTick.current !== tick;
    lastDeps.current = depsKey; lastTick.current = tick;
    const ctrl = new AbortController();
    setState((s) => ({ data: isReload ? s.data : undefined, error: null, loading: true }));
    fnRef.current(ctrl.signal).then(
      (data) => { if (!ctrl.signal.aborted) setState({ data, error: null, loading: false }); },
      (error) => { if (ctrl.signal.aborted || error?.name === "AbortError") return; setState((s) => ({ data: s.data, error, loading: false })); },
    );
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === "function" ? updater(s.data) : updater })), []);
  return { ...state, reload, setData };
}
