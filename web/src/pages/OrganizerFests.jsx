import { useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { Link, useSearchParams, usePageTitle } from "../router.jsx";
import { formatRange } from "../lib/dates.js";
import { plural } from "../lib/format.js";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import Badge, { FestStatusBadge } from "../components/common/Badge.jsx";
import { Async, EmptyState } from "../components/common/States.jsx";
import { Field, Input, Select } from "../components/common/Field.jsx";
import SeatMeter from "../components/organizer/SeatMeter.jsx";
import EventsTabs from "../components/organizer/EventsTabs.jsx";

// `status` (live / upcoming / past) and `archived` both come from the backend; the chips only pick rows by them.
const VIEWS = [["", "All"], ["live", "Live now"], ["upcoming", "Upcoming"], ["past", "Past"], ["archived", "Archived"]];
const inView = (f, view) => !view || (view === "archived" ? f.archived : !f.archived && f.status === view);

// GET /api/admin/fests: every fest including archived ones, each with its club, its backend-computed status and
// totals over its events (event_count, capacity, taken). The API has no search or filter, so those run on the loaded list.
export default function OrganizerFests() {
  usePageTitle("Fests");
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some(([v]) => v === params.get("view")) ? params.get("view") : "", club = /^\d+$/.test(params.get("club") || "") ? params.get("club") : "";
  const [q, setQ] = useState("");
  const list = useApi((signal) => api.admin.fests({ signal }));
  const clubs = useMemo(() => { const m = new Map(); (list.data || []).forEach((f) => m.set(String(f.club_id), f.club_name)); return [...m.entries()]; }, [list.data]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list.data || []).filter((f) => inView(f, view) && (!club || String(f.club_id) === club) && (!s || [f.name, f.club_name, f.venue, f.description].some((x) => String(x || "").toLowerCase().includes(s))));
  }, [list.data, view, club, q]);
  const counts = useMemo(() => Object.fromEntries(VIEWS.map(([v]) => [v, (list.data || []).filter((f) => inView(f, v)).length])), [list.data]);
  const active = !!(q.trim() || view || club);
  const clear = () => { setQ(""); setParams({ view: "", club: "" }); };

  return (
    <div className="org-page">
      <EventsTabs><Button size="sm" variant="secondary" to="/organizer/fests/new"><Icon name="plus" /> Create fest</Button></EventsTabs>
      <p className="muted flush">A fest belongs to a club and holds events. Create the fest first, then add its events.</p>
      <section className="filter-bar glass" aria-label="Filter fests">
        <form className="filter-grid filter-grid-reg" role="search" onSubmit={(e) => e.preventDefault()}>
          <Field label="Search fests" hint="Name, club, venue or description">{(p) => <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
          <Field label="Club">{(p) => <Select {...p} value={club} onChange={(e) => setParams({ club: e.target.value })}><option value="">All clubs</option>{clubs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>}</Field>
        </form>
        <div className="chip-row" role="group" aria-label="Fest status">
          {VIEWS.map(([v, label]) => <button key={v || "all"} type="button" className="chip" aria-pressed={view === v} onClick={() => setParams({ view: v })}>{label}{v ? <span className="chip-n">{counts[v] || 0}</span> : null}</button>)}
        </div>
      </section>
      <div className="org-intro">
        <p className="muted small flush" role="status" aria-live="polite">{list.data ? `${plural(rows.length, "fest")}${active ? " match" : ""}` : " "}</p>
        <Button variant="ghost" size="sm" onClick={list.reload} disabled={list.loading}><Icon name="refresh" /> Refresh</Button>
      </div>
      <Async state={list} label="Loading fests…" isEmpty={() => rows.length === 0}
        empty={active
          ? <EmptyState icon="search" title="No fests match" message="Try a different word or clear a filter." action={<Button variant="secondary" onClick={clear}><Icon name="x" /> Clear filters</Button>} />
          : <EmptyState icon="ticket" title="No fests yet" message="Create your first fest, then add events to it." action={<Button to="/organizer/fests/new"><Icon name="plus" /> Create fest</Button>} />}>
        {() => (
          <div className="table-wrap">
            <table className="table table-stack reg-table">
              <thead><tr><th scope="col">Fest</th><th scope="col">Dates</th><th scope="col">Status</th><th scope="col">Events and seats</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <td data-label="Fest"><div><Link to={`/organizer/fests/${f.id}`} className="row-title">{f.name}</Link><div className="muted small">{f.club_name}</div></div></td>
                    <td data-label="Dates" className="cell-labelled"><div>{formatRange(f.starts_on, f.ends_on)}{f.venue && <div className="muted small">{f.venue}</div>}</div></td>
                    <td data-label="Status"><div className="row">{f.archived ? <Badge tone="muted" icon="archive">Archived</Badge> : <FestStatusBadge status={f.status} />}</div></td>
                    <td data-label="Events and seats"><div><div className="small">{plural(f.event_count, "event")}</div>{f.capacity > 0 && <SeatMeter taken={f.taken} capacity={f.capacity} compact />}</div></td>
                    <td data-label="Actions"><div className="row row-actions"><Button size="sm" variant="secondary" to={`/organizer/fests/${f.id}`} aria-label={`Manage ${f.name}`}>Manage</Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
    </div>
  );
}
