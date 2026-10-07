import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Icon from "./Icon.jsx";
// App-wide feedback for actions ("Event archived") and failures. Polite live region, auto-dismiss, no alert().
const Ctx = createContext({ success() {}, error() {}, info() {} });
export const useToast = () => useContext(Ctx);
let seq = 0;
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((tone, message, ms) => { const id = ++seq; setItems((l) => [...l.slice(-3), { id, tone, message }]); setTimeout(() => dismiss(id), ms); }, [dismiss]);
  const api = useMemo(() => ({ success: (m) => push("ok", m, 4500), info: (m) => push("info", m, 4500), error: (m) => push("bad", m, 8000) }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === "bad" ? "alert" : "check"} /><span>{t.message}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismiss(t.id)} aria-label="Dismiss notification"><Icon name="x" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
