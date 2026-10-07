import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { Link, useSearchParams, usePageTitle } from "../router.jsx";
import { formatShort } from "../lib/dates.js";
import { EVENT_STATE, plural } from "../lib/format.js";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { StateBadge } from "../components/common/Badge.jsx";
import { Async, EmptyState } from "../components/common/States.jsx";
import { Field, Input, Select } from "../components/common/Field.jsx";
import SeatMeter from "../components/organizer/SeatMeter.jsx";
import EventsTabs from "../components/organizer/EventsTabs.jsx";

const STATES = ["open", "full", "closed", "ended", "archived"];          // the backend's registration_state values
const RANK = { open: 0, full: 1, closed: 2, ended: 3, archived: 4 };
const SORTS = { date: ["Start date", (a, b) => String(a.starts_at).localeCompare(String(b.starts_at)) || a.id - b.id], name: ["Name", (a, b) => a.title.localeCompare(b.title)],
  state: ["State", (a, b) => (RANK[a.registration_state] ?? 9) - (RANK[b.registration_state] ?? 9) || String(a.starts_at).localeCompare(String(b.starts_at))] };
const digits = (v) => (/^\d{1,9}$/.test(v || "") ? v : "");

// Event management list on GET /api/admin/events (archived events included). `?q`, `?fest` and `?club` are sent to the
// API; category, state and sorting work on the rows it returns (the API has no such parameters). All of it is in the URL.
export default function OrganizerEvents() {
  usePageTitle("Events");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "", fest = digits(params.get("fest")), club = digits(params.get("club")), category = params.get("category") || "";
  const state = STATES.includes(params.get("state")) ? params.get("state") : "", sort = SORTS[params.get("sort")] ? params.get("sort") : "date";
  const [text, setText] = useState(q);
  const debounced = useDebounce(text, 300);
  useEffect(() => { if (debounced.trim() !== q) setParams({ q: debounced.trim() }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [debounced]);
  useEffect(() => { setText(q); }, [q]);

  const list = useApi((signal) => api.admin.events({ q, fest, club, limit: 500 }, { signal }), [q, fest, club]);
  const fests = useApi((signal) => api.admin.fests({ signal }));                         // options for the fest and club filters
  const clubs = useMemo(() => { const m = new Map(); (fests.data || []).forEach((f) => m.set(String(f.club_id), f.club_name)); return [...m.entries()]; }, [fests.data]);
  const festOptions = useMemo(() => (fests.data || []).filter((f) => !club || String(f.club_id) === club), [fests.data, club]);
  const categories = useMemo(() => [...new Set((list.data || []).map((e) => e.category).filter(Boolean))].sort(), [list.data]);
  const rows = useMemo(() => (list.data || []).filter((e) => (!state || e.registration_state === state) && (!category || e.category === category)).sort(SORTS[sort][1]), [list.data, state, category, sort]);
  const counts = useMemo(() => { const c = {}; (list.data || []).forEach((e) => { if (!category || e.category === category) c[e.registration_state] = (c[e.registration_state] || 0) + 1; }); return c; }, [list.data, category]);
  const active = !!(q || fest || club || category || state);
  const clear = () => setParams({ q: "", fest: "", club: "", category: "", state: "" });

  return (
    <div className="org-page">
      <EventsTabs><Button size="sm" variant="secondary" to="/organizer/fests"><Icon name="ticket" /> Manage fests</Button></EventsTabs>
      <p className="muted flush">Create and edit events, set their seats, deadline and registration form, and open each event's registrations.</p>
      <section className="filter-bar glass" aria-label="Filter events">
        <form className="filter-grid filter-grid-events" role="search" onSubmit={(e) => e.preventDefault()}>
          <Field label="Search events" hint="Title or description">{(p) => <Input {...p} type="search" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
          <Field label="Club">{(p) => <Select {...p} value={club} onChange={(e) => setParams({ club: e.target.value, fest: "" })}><option value="">All clubs</option>{clubs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>}</Field>
          <Field label="Fest">{(p) => <Select {...p} value={fest} onChange={(e) => setParams({ fest: e.target.value })}><option value="">All fests</option>{fest && !festOptions.some((f) => String(f.id) === fest) && <option value={fest}>Fest #{fest}</option>}{festOptions.map((f) => <option key={f.id} value={f.id}>{f.name}{f.archived ? " (archived)" : ""}</option>)}</Select>}</Field>
          <Field label="Category">{(p) => <Select {...p} value={category} onChange={(e) => setParams({ category: e.target.value })}><option value="">All categories</option>{category && !categories.includes(category) && <option value={category}>{category}</option>}{categories.map((c) => <option key={c} value={c}>{c}</option>)}</Select>}</Field>
          <Field label="Sort by">{(p) => <Select {...p} value={sort} onChange={(e) => setParams({ sort: e.target.value === "date" ? "" : e.target.value })}>{Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}</Select>}</Field>
        </form>
        <div className="chip-row" role="group" aria-label="Registration state">
          <button type="button" className="chip" aria-pressed={!state} onClick={() => setParams({ state: "" })}>All</button>
          {STATES.filter((s) => counts[s] || state === s).map((s) => <button key={s} type="button" className="chip" aria-pressed={state === s} onClick={() => setParams({ state: state === s ? "" : s })}>{EVENT_STATE[s].label}<span className="chip-n">{counts[s] || 0}</span></button>)}
        </div>
      </section>
      <div className="org-intro">
        <p className="muted small flush" role="status" aria-live="polite">{list.data ? `${plural(rows.length, "event")}${active ? " match" : ""}${list.loading ? " · updating…" : ""}` : " "}</p>
        <div className="row">
          {active && <Button variant="ghost" size="sm" onClick={clear}><Icon name="x" /> Clear filters</Button>}
          <Button variant="ghost" size="sm" onClick={list.reload} disabled={list.loading}><Icon name="refresh" /> Refresh</Button>
        </div>
      </div>
      <Async state={list} label="Loading events…" isEmpty={() => rows.length === 0}
        empty={active
          ? <EmptyState icon="search" title="No events match" message="Try a different word or clear a filter." action={<Button variant="secondary" onClick={clear}><Icon name="x" /> Clear filters</Button>} />
          : <EmptyState icon="calendar" title="No events yet" message="Create your first event. Every event belongs to a fest, so start with a fest if there is none." action={<div className="row center-row"><Button to="/organizer/events/new"><Icon name="plus" /> Create your first event</Button><Button variant="secondary" to="/organizer/fests">Manage fests</Button></div>} />}>
        {() => (
          <>
            {list.error && <div className="alert alert-warn" role="alert"><Icon name="alert" /><div>This list couldn't be refreshed, so it may be out of date. {list.error.message} <button type="button" className="link-btn" onClick={list.reload}>Try again</button></div></div>}
            <div className="table-wrap">
              <table className="table table-stack reg-table">
                <thead><tr><th scope="col">Event</th><th scope="col">Starts</th><th scope="col">State</th><th scope="col">Seats</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td data-label="Event"><div><Link to={`/organizer/events/${e.id}`} className="row-title">{e.title}</Link><div className="muted small">{[e.club_name, e.fest_name, e.category].filter(Boolean).join(" · ")}</div></div></td>
                      <td data-label="Starts" className="cell-labelled"><div><span className="nowrap">{formatShort(e.starts_at)}</span>{e.venue && <div className="muted small">{e.venue}</div>}</div></td>
                      <td data-label="State"><div><StateBadge state={e.registration_state} /><div className="muted small">{e.auto_confirm ? "Instant confirmation" : "Needs approval"}</div></div></td>
                      <td data-label="Seats"><SeatMeter taken={e.taken} capacity={e.capacity} compact /></td>
                      <td data-label="Actions"><div className="row row-actions">
                        <Button size="sm" variant="secondary" to={`/organizer/registrations?event=${e.id}`} aria-label={`Registrations for ${e.title}`}>Registrations</Button>
                        <Button size="sm" variant="secondary" to={`/organizer/events/${e.id}`} aria-label={`Manage ${e.title}`}>Manage</Button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
