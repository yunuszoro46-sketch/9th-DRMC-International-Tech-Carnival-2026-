import { useMemo } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { Link, usePageTitle } from "../router.jsx";
import { formatShort, timeAgo } from "../lib/dates.js";
import { plural } from "../lib/format.js";
import Icon from "../components/common/Icon.jsx";
import Button from "../components/common/Button.jsx";
import { StateBadge, StatusBadge } from "../components/common/Badge.jsx";
import { Async, EmptyState, Skeletons } from "../components/common/States.jsx";
import SeatMeter from "../components/organizer/SeatMeter.jsx";

const REGS = "/organizer/registrations";

function Stat({ label, value, sub, icon, to, attention = false }) {
  const body = (
    <>
      <span className="stat-label"><Icon name={icon} />{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </>
  );
  const cls = `stat${attention ? " stat-attn" : ""}`;
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

// Everything on this page is read from three organizer endpoints:
//   GET /api/admin/stats                    counts by registration status, events, fests, seats
//   GET /api/admin/events                   each event with its backend registration_state (open/full/closed/ended/archived)
//   GET /api/admin/registrations?limit=6    the six newest registrations
// "Open for registration" and "Coming up" are read off the events' own registration_state and starts_at; nothing is invented.
export default function OrganizerDashboard() {
  usePageTitle("Dashboard");
  const stats = useApi((signal) => api.admin.stats({ signal }));
  const events = useApi((signal) => api.admin.events({ limit: 500 }, { signal }));
  const recent = useApi((signal) => api.admin.registrations({ limit: 6 }, { signal }));
  const live = useMemo(() => (events.data || []).filter((e) => !e.archived), [events.data]);
  const openCount = useMemo(() => live.filter((e) => e.registration_state === "open").length, [live]);
  // The API returns events ordered by start time, so the first ones that haven't started are the next ones up.
  const upcoming = useMemo(() => live.filter((e) => e.registration_state !== "ended").slice(0, 5), [live]);
  const refreshing = stats.loading || events.loading || recent.loading;
  const refresh = () => { stats.reload(); events.reload(); recent.reload(); };

  return (
    <div className="org-page">
      <div className="org-intro">
        <p className="muted flush">Registrations, seats and events across every club, straight from the live data.</p>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={refreshing}><Icon name="refresh" /> {refreshing ? "Refreshing…" : "Refresh"}</Button>
      </div>

      <nav className="quick-actions" aria-label="Quick actions">
        <Button size="sm" to="/organizer/events/new"><Icon name="plus" /> New event</Button>
        <Button variant="secondary" size="sm" to="/organizer/fests/new"><Icon name="plus" /> New fest</Button>
        <Button variant="secondary" size="sm" to={`${REGS}?status=PENDING`}><Icon name="clock" /> Review pending</Button>
        <Button variant="secondary" size="sm" to="/organizer/volunteers"><Icon name="users" /> Volunteers</Button>
      </nav>

      <section aria-labelledby="stats-h">
        <h2 id="stats-h" className="sr-only">Registration statistics</h2>
        <Async state={stats} label="Loading statistics…" skeleton={<Skeletons count={6} />}>
          {(s) => {
            const r = s.registrations;
            return (
              <div className="stat-grid">
                <Stat label="Pending approval" icon="clock" value={r.PENDING} to={`${REGS}?status=PENDING`} attention={r.PENDING > 0} sub={r.PENDING > 0 ? "Waiting for a decision" : "Nothing waiting"} />
                <Stat label="Confirmed" icon="check" value={r.CONFIRMED} to={`${REGS}?status=CONFIRMED`} sub="Hold a valid pass" />
                <Stat label="Checked in" icon="scan" value={r.CHECKED_IN} to={`${REGS}?status=CHECKED_IN`} sub="Attended" />
                <Stat label="All registrations" icon="list" value={r.total} to={REGS} sub={`${r.REJECTED} rejected · ${r.CANCELLED} cancelled`} />
                <Stat label="Events" icon="calendar" value={s.events} to="/organizer/events" sub={events.data ? `${openCount} open for registration · ${plural(s.fests, "fest")}` : plural(s.fests, "fest")} />
                <div className="stat">
                  <span className="stat-label"><Icon name="users" />Seats</span>
                  <span className="stat-value">{s.seats.taken}<small> / {s.seats.capacity}</small></span>
                  <SeatMeter taken={s.seats.taken} capacity={s.seats.capacity} compact />
                  <span className="stat-sub">{s.seats.remaining} remaining</span>
                </div>
              </div>
            );
          }}
        </Async>
      </section>

      <div className="org-columns">
        <section className="card org-panel" aria-labelledby="recent-h">
          <div className="section-head"><h2 id="recent-h">Recent registrations</h2><Button variant="ghost" size="sm" to={REGS}>View all <Icon name="arrow" /></Button></div>
          <Async state={recent} label="Loading registrations…" isEmpty={(d) => d.items.length === 0}
            empty={<EmptyState icon="ticket" title="No registrations yet" message="They will appear here as soon as someone registers for an event." />}>
            {(d) => (
              <ul className="rows">
                {d.items.map((r) => (
                  <li key={r.id}>
                    <div className="min0">
                      <Link to={`${REGS}?reg=${r.id}`} className="row-title">{r.name}</Link>
                      <p className="muted small flush">{r.event_title} · {timeAgo(r.created_at)}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </section>

        <section className="card org-panel" aria-labelledby="next-h">
          <div className="section-head"><h2 id="next-h">Coming up</h2><Button variant="ghost" size="sm" to="/organizer/events">All events <Icon name="arrow" /></Button></div>
          <Async state={events} label="Loading events…" isEmpty={() => upcoming.length === 0}
            empty={<EmptyState icon="calendar" title="No upcoming events" message="Every event has already started, or none has been published yet." />}>
            {() => (
              <ul className="rows">
                {upcoming.map((e) => (
                  <li key={e.id}>
                    <div className="min0 grow">
                      <Link to={`${REGS}?event=${e.id}`} className="row-title">{e.title}</Link>
                      <p className="muted small flush">{formatShort(e.starts_at)}{e.venue ? ` · ${e.venue}` : ""}</p>
                      <SeatMeter taken={e.taken} capacity={e.capacity} compact />
                    </div>
                    <StateBadge state={e.registration_state} />
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </section>
      </div>
    </div>
  );
}
