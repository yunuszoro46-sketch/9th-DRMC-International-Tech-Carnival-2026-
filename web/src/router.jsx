// A small History-API router: real URLs, back/forward, deep links, refresh-safe (the Node server falls back to index.html
// for extension-less paths). Written in-house to avoid a dependency for ~100 lines of behaviour.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const Ctx = createContext(null);
const read = () => ({ path: window.location.pathname.replace(/\/+$/, "") || "/", search: window.location.search });

export function RouterProvider({ children }) {
  const [loc, setLoc] = useState(read);
  useEffect(() => { const on = () => setLoc(read()); window.addEventListener("popstate", on); return () => window.removeEventListener("popstate", on); }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    const u = new URL(to, window.location.origin);
    window.history[replace ? "replaceState" : "pushState"](null, "", u.pathname + u.search + u.hash);
    setLoc(read());
  }, []);
  const value = useMemo(() => ({ ...loc, navigate }), [loc, navigate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useRouter = () => useContext(Ctx);
export const useNavigate = () => useContext(Ctx).navigate;

export function useSearchParams() {
  const { search, path, navigate } = useContext(Ctx);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const set = useCallback((patch, { replace = true } = {}) => {
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) (v === "" || v == null ? next.delete(k) : next.set(k, v));
    const s = next.toString();
    navigate(path + (s ? "?" + s : ""), { replace });
  }, [path, navigate]);
  return [params, set];
}

function match(pattern, path) {
  const a = pattern.split("/").filter(Boolean), b = path.split("/").filter(Boolean), params = {};
  if (a.length !== b.length) return null;
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) { try { params[a[i].slice(1)] = decodeURIComponent(b[i]); } catch { return null; } } else if (a[i] !== b[i]) return null;
  }
  return params;
}

// routes: [{ path: "/events/:eventId", render: (params) => <Element/> }]. First match wins; otherwise `fallback`.
export function Routes({ routes, fallback }) {
  const { path } = useContext(Ctx), first = useRef(true);
  let found = null;
  for (const r of routes) { const params = match(r.path, path); if (params) { found = { r, params }; break; } }
  // New page: scroll to top and move focus to <main> so keyboard / screen-reader users start at the content.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [path]);
  return found ? found.r.render(found.params) : fallback;
}

export function Link({ to, replace, children, onClick, ...rest }) {
  const { navigate } = useContext(Ctx);
  const handle = (e) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === "_blank") return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={to} onClick={handle} {...rest}>{children}</a>;
}
export function Navigate({ to }) {
  const { navigate } = useContext(Ctx);
  useEffect(() => { navigate(to, { replace: true }); }, [to, navigate]);
  return null;
}
export function usePageTitle(title) {
  useEffect(() => { document.title = title ? `${title} · DRMC IT Club` : "DRMC IT Club | Live with Tech"; }, [title]);
}
