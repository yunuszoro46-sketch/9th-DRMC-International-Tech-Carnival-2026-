import Icon from "./Icon.jsx";
import Button from "./Button.jsx";

export function Loading({ label = "Loading…" }) {
  return <div className="state" role="status" aria-live="polite"><div className="spinner" aria-hidden="true" /><p>{label}</p></div>;
}
export function Skeletons({ count = 6 }) {
  return <div className="grid-cards" role="status" aria-label="Loading"><span className="sr-only">Loading…</span>{Array.from({ length: count }, (_, i) => <div key={i} className="skeleton" aria-hidden="true" />)}</div>;
}
export function EmptyState({ title = "Nothing here yet", message, action, icon = "info" }) {
  return <div className="state"><Icon name={icon} className="state-icon" /><h2>{title}</h2>{message && <p>{message}</p>}{action}</div>;
}
// Shows the ApiError's own (person-safe) message. "Try again" appears only where retrying can help (network, timeout, 5xx, 429).
// `level={1}` when the error is the whole page (e.g. the 404 route), so the page still has a top-level heading.
export function ErrorState({ error, onRetry, title, level = 2 }) {
  const H = level === 1 ? "h1" : "h2";
  const retryable = !error || error.isNetwork || !error.status || error.status >= 500 || error.status === 429;
  const missing = error?.status === 404;
  return (
    <div className="state" role="alert">
      <Icon name="alert" className="state-icon" />
      <H>{title || (missing ? "Not found" : "Something went wrong")}</H>
      <p>{error?.message || "We couldn't load this page. Please try again."}</p>
      {retryable && onRetry && <Button variant="secondary" onClick={onRetry}><Icon name="refresh" /> Try again</Button>}
      {missing && <Button variant="secondary" to="/">Back to home</Button>}
    </div>
  );
}
// One place that turns a useApi() result into loading / error / empty / content.
// Stale data stays visible while a refresh runs, so lists never flash empty.
export function Async({ state, children, label, skeleton, isEmpty, empty }) {
  if (state.data === undefined && state.loading) return skeleton || <Loading label={label} />;
  if (state.data === undefined && state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.data === undefined) return null;
  if (isEmpty && isEmpty(state.data)) return empty;
  return children(state.data);
}
