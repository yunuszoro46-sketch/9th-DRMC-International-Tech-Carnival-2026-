import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { Link, useRouter, useSearchParams, usePageTitle } from "../router.jsx";
import { formatDateTime } from "../lib/dates.js";
import { REG_STATUS } from "../lib/format.js";
import { PAGE_SIZE, STATUSES } from "../lib/registrationAdmin.js";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { StatusBadge } from "../components/common/Badge.jsx";
import { Async, EmptyState, Loading } from "../components/common/States.jsx";
import { Field, Input, Select } from "../components/common/Field.jsx";
import { useToast } from "../components/common/Toast.jsx";
import Pager from "../components/organizer/Pager.jsx";
import { useRegistrationActions } from "../components/organizer/useRegistrationActions.jsx";
import OrganizerRegistrationDetail from "./OrganizerRegistrationDetail.jsx";

const digits = (v) => (/^\d{1,9}$/.test(v || "") ? v : "");

// Organizer registration management on GET /api/admin/registrations (?event, ?status, ?q on name/email, ?limit, ?offset;
// newest first; returns { items, total, limit, offset }). Filters, page and the open registration all live in the URL:
//   /organizer/registrations?status=PENDING&event=12&q=rahim&page=2&reg=345
// There is no "get one registration" endpoint, so the detail view (?reg=) shows the row from the loaded page and, after
// an action, re-reads that one registration through the same list endpoint (its event + email).
export default function OrganizerRegistrations() {
  const { path } = useRouter(), toast = useToast();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "", event = digits(params.get("event")), regId = Number(digits(params.get("reg"))) || null;
  const status = STATUSES.includes(params.get("status")) ? params.get("status") : "";
  const page = Math.max(1, Number(digits(params.get("page"))) || 1);

  const [text, setText] = useState(q);
  const debounced = useDebounce(text, 300);
  useEffect(() => { if (debounced.trim() !== q) setParams({ q: debounced.trim(), page: "" }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [debounced]);
  useEffect(() => { setText(q); }, [q]);

  const list = useApi((signal) => api.admin.registrations({ event, status, q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, { signal }), [event, status, q, page]);
  const events = useApi((signal) => api.admin.events({ limit: 500 }, { signal }));          // the event filter's options
  const byFest = useMemo(() => {
    const groups = new Map();
    for (const e of events.data || []) { if (!groups.has(e.fest_id)) groups.set(e.fest_id, { name: e.fest_name, items: [] }); groups.get(e.fest_id).items.push(e); }
    return [...groups.values()];
  }, [events.data]);
  const chosenEvent = event && (events.data || []).find((e) => String(e.id) === event);

  // A page past the end (the list shrank, or a hand-edited URL) snaps back to the last real page.
  useEffect(() => {
    const d = list.data; if (!d || list.loading) return;
    if (d.items.length === 0 && d.total > 0 && page > 1) setParams({ page: String(Math.max(1, Math.ceil(d.total / PAGE_SIZE))) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, list.loading]);

  // ---- the open registration -------------------------------------------------------------------------------------
  const [snap, setSnap] = useState(null);                 // latest server copy of the registration being viewed
  const [eventTick, setEventTick] = useState(0), [refreshingOne, setRefreshingOne] = useState(false);
  const inList = regId ? (list.data?.items || []).find((r) => r.id === regId) : null;
  useEffect(() => { if (inList) setSnap(inList); }, [inList]);
  useEffect(() => { if (!regId) setSnap(null); }, [regId]);
  const open = regId ? (snap && snap.id === regId ? snap : inList || null) : null;
  const openRef = useRef(null); openRef.current = open;

  const refreshOne = useCallback(async (reg) => {
    setRefreshingOne(true);
    try {
      const d = await api.admin.registrations({ event: reg.event_id, q: reg.email, limit: 200 });
      const fresh = d.items.find((r) => r.id === reg.id);
      if (fresh) setSnap((s) => (s && s.id === reg.id ? fresh : s));
    } catch (e) { if (e?.status !== 401) toast.error("Couldn't refresh this registration. " + (e?.message || "")); }
    finally { setRefreshingOne(false); }
  }, [toast]);
  const settle = useCallback((reg) => {
    list.reload();
    if (openRef.current && openRef.current.id === reg.id) { refreshOne(reg); setEventTick((t) => t + 1); }
  }, [list, refreshOne]);
  const actions = useRegistrationActions({ onSettled: settle });

  // Switching between the list and one registration is a new "page": start at the top with focus on the content.
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) { firstView.current = false; return; }
    window.scrollTo(0, 0); document.getElementById("main")?.focus({ preventScroll: true });
  }, [regId]);

  usePageTitle(open ? `${open.name} · Registration` : "Registrations");
  const hrefWith = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v === "" || v == null ? next.delete(k) : next.set(k, v));
    const s = next.toString(); return path + (s ? "?" + s : "");
  };

  async function exportCsv() {
    try {
      const { text: csv, filename } = await api.admin.csv(event);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("CSV downloaded.");
    } catch (e) { if (e?.status !== 401) toast.error(e?.message || "The export failed. Please try again."); }
  }

  if (regId) {
    if (open) return <>
      <OrganizerRegistrationDetail reg={open} backTo={hrefWith({ reg: "" })} onAction={actions.start} busy={actions.busyId != null} eventTick={eventTick}
        onRefresh={() => { list.reload(); refreshOne(open); setEventTick((t) => t + 1); }} refreshing={refreshingOne} />
      {actions.dialog}
    </>;
    if (list.data === undefined && list.loading) return <Loading label="Loading registration…" />;
    return (
      <div className="org-page">
        <EmptyState icon="search" title={`Registration #${regId} isn't in these results`}
          message={list.error ? list.error.message : "It may be on another page, hidden by the current filters, or it may not exist. Find the participant in the list and open it from there."}
          action={<div className="row center-row">{list.error && <Button variant="secondary" onClick={list.reload}><Icon name="refresh" /> Try again</Button>}<Button variant="secondary" to={path}>Show all registrations</Button></div>} />
      </div>
    );
  }

  const active = !!(q || event || status);
  return (
    <div className="org-page">
      <section className="filter-bar glass" aria-label="Filter registrations">
        <form className="filter-grid filter-grid-reg" role="search" onSubmit={(e) => e.preventDefault()}>
          <Field label="Search" hint="Participant name or email">{(p) => <Input {...p} type="search" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
          <Field label="Event">{(p) => (
            <Select {...p} value={event} onChange={(e) => setParams({ event: e.target.value, page: "" })}>
              <option value="">All events</option>
              {event && !chosenEvent && <option value={event}>Event #{event}</option>}
              {byFest.map((g) => <optgroup key={g.name} label={g.name}>{g.items.map((e) => <option key={e.id} value={e.id}>{e.title}{e.archived ? " (archived)" : ""}</option>)}</optgroup>)}
            </Select>
          )}</Field>
        </form>
        <div className="chip-row" role="group" aria-label="Registration status">
          <button type="button" className="chip" aria-pressed={!status} onClick={() => setParams({ status: "", page: "" })}>All</button>
          {STATUSES.map((s) => <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setParams({ status: status === s ? "" : s, page: "" })}>{REG_STATUS[s].label}</button>)}
        </div>
      </section>

      <div className="org-intro">
        <p className="muted small flush" role="status" aria-live="polite">{list.data ? `${list.data.total} ${list.data.total === 1 ? "registration" : "registrations"}${active ? " match" : ""}${list.loading ? " · updating…" : ""}` : " "}</p>
        <div className="row">
          {active && <Button variant="ghost" size="sm" onClick={() => setParams({ q: "", event: "", status: "", page: "" })}><Icon name="x" /> Clear filters</Button>}
          {event && <Button variant="secondary" size="sm" onClick={exportCsv}><Icon name="list" /> Export this event (CSV)</Button>}
          <Button variant="ghost" size="sm" onClick={list.reload} disabled={list.loading}><Icon name="refresh" /> Refresh</Button>
        </div>
      </div>

      <Async state={list} label="Loading registrations…" isEmpty={(d) => d.total === 0}
        empty={<EmptyState icon={active ? "search" : "ticket"} title={active ? "No registrations match" : "No registrations yet"}
          message={active ? "Try a different name or email, or clear a filter." : "Registrations appear here as soon as someone registers for an event."}
          action={active ? <Button variant="secondary" onClick={() => setParams({ q: "", event: "", status: "", page: "" })}><Icon name="x" /> Clear filters</Button> : <Button variant="secondary" to="/organizer/events">See events</Button>} />}>
        {(d) => (
          <>
            {list.error && <div className="alert alert-warn spaced-bottom" role="alert"><Icon name="alert" /><div>This list couldn't be refreshed, so it may be out of date. {list.error.message} <button type="button" className="link-btn" onClick={list.reload}>Try again</button></div></div>}
            <div className="table-wrap">
              <table className="table table-stack reg-table">
                <thead><tr><th scope="col">Participant</th><th scope="col">Event</th><th scope="col">Status</th><th scope="col">Registered</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {d.items.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Participant"><div><Link to={hrefWith({ reg: String(r.id) })} className="row-title">{r.name}</Link><div className="muted small">{r.email}</div></div></td>
                      <td data-label="Event"><div>{r.event_title}<div className="muted small">{r.fest_name}</div></div></td>
                      <td data-label="Status"><div><StatusBadge status={r.status} />{r.checked_in_at && <div className="muted small">{formatDateTime(r.checked_in_at)}</div>}</div></td>
                      <td data-label="Registered" className="nowrap-md cell-labelled">{formatDateTime(r.created_at)}</td>
                      <td data-label="Actions"><div className="row row-actions">
                        {r.status === "PENDING" && <Button size="sm" onClick={() => actions.start("approve", r)} disabled={actions.busyId != null} aria-label={`Approve ${r.name}`}><Icon name="check" /> {actions.busyId === r.id ? "Approving…" : "Approve"}</Button>}
                        <Button size="sm" variant="secondary" to={hrefWith({ reg: String(r.id) })} aria-label={`View ${r.name}'s registration`}>View</Button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={d.total} limit={PAGE_SIZE} offset={d.offset} noun="registration" onPage={(n) => { setParams({ page: n > 1 ? String(n) : "" }, { replace: false }); window.scrollTo(0, 0); }} />
          </>
        )}
      </Async>
      {actions.dialog}
    </div>
  );
}
