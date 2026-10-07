import Icon from "../common/Icon.jsx";
// Previous / next for a paged API ({ total, limit, offset }). `onPage` receives the 1-based page number.
export default function Pager({ total, limit, offset, onPage, noun = "result" }) {
  if (!total) return null;
  const page = Math.floor(offset / limit) + 1, pages = Math.max(1, Math.ceil(total / limit));
  const from = offset + 1, to = Math.min(total, offset + limit);
  return (
    <nav className="pager" aria-label="Pages">
      <p className="muted small flush" role="status" aria-live="polite">Showing {from}–{to} of {total} {total === 1 ? noun : noun + "s"}</p>
      {pages > 1 && (
        <div className="row">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPage(page - 1)} disabled={page <= 1}><Icon name="chevL" /> Previous</button>
          <span className="muted small">Page {page} of {pages}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>Next <Icon name="chevR" /></button>
        </div>
      )}
    </nav>
  );
}
