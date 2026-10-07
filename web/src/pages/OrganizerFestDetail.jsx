import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { Link, useNavigate, usePageTitle } from "../router.jsx";
import { formatRange, formatShort } from "../lib/dates.js";
import { plural } from "../lib/format.js";
import Card from "../components/common/Card.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import Badge, { FestStatusBadge, StateBadge } from "../components/common/Badge.jsx";
import { Async, EmptyState } from "../components/common/States.jsx";
import SeatMeter from "../components/organizer/SeatMeter.jsx";
import { useConfirmAction } from "../components/organizer/useConfirmAction.jsx";
import { festActions } from "../components/organizer/lifecycle.js";

// GET /api/admin/fests/:id: the fest plus every event in it (archived events included).
export default function OrganizerFestDetail({ id }) {
  const navigate = useNavigate();
  const fest = useApi((signal) => api.admin.fest(id, { signal }), [id]);
  const confirm = useConfirmAction();
  usePageTitle(fest.data ? fest.data.name : "Fest");
  return (
    <div className="org-page">
      <div className="org-intro">
        <Link to="/organizer/fests" className="back-link"><Icon name="chevL" /> Back to fests</Link>
        <Button variant="ghost" size="sm" onClick={fest.reload} disabled={fest.loading}><Icon name="refresh" /> {fest.loading && fest.data ? "Refreshing…" : "Refresh"}</Button>
      </div>
      <Async state={fest} label="Loading fest…">
        {(f) => {
          const a = festActions(f), after = { onDone: fest.reload };
          return (
            <>
              <header className="glass-panel reg-head">
                <div className="min0">
                  <p className="tech-eyebrow reg-eyebrow">Fest · {f.club_name}</p>
                  <h2 id="fest-name">{f.name}</h2>
                  <p className="muted flush">{formatRange(f.starts_on, f.ends_on)}{f.venue ? ` · ${f.venue}` : ""}</p>
                </div>
                <div className="reg-head-status">{f.archived ? <Badge tone="muted" icon="archive">Archived</Badge> : <FestStatusBadge status={f.status} />}
                  <p className="muted small flush">{f.archived ? "Hidden from the public site, with all of its events." : "Visible on the public site."}</p></div>
                <div className="action-bar" role="group" aria-label="Actions for this fest">
                  <Button size="sm" to={`/organizer/fests/${f.id}/edit`}><Icon name="edit" /> Edit fest</Button>
                  {!f.archived && <Button size="sm" variant="secondary" to={`/organizer/events/new?fest=${f.id}`}><Icon name="plus" /> Add event</Button>}
                  {!f.archived && <Button size="sm" variant="secondary" to={`/fests/${f.id}`}>Public page</Button>}
                  {f.archived
                    ? <Button size="sm" variant="secondary" onClick={() => confirm.ask({ ...a.restore, ...after })}><Icon name="undo" /> Restore</Button>
                    : <Button size="sm" variant="secondary" onClick={() => confirm.ask({ ...a.archive, ...after })}><Icon name="archive" /> Archive</Button>}
                  {f.events.length === 0 && <Button size="sm" variant="danger" onClick={() => confirm.ask({ ...a.remove, onDone: () => navigate("/organizer/fests", { replace: true }) })}><Icon name="trash" /> Delete</Button>}
                </div>
              </header>

              <div className="detail-cards">
                <div className="detail-col">
                  <Card as="section" aria-labelledby="fd-h">
                    <h3 id="fd-h">Fest details</h3>
                    <dl className="facts facts-2">
                      <div><dt>Club</dt><dd>{f.club_name}</dd></div>
                      <div><dt>Dates</dt><dd>{formatRange(f.starts_on, f.ends_on)}</dd></div>
                      <div><dt>Venue</dt><dd>{f.venue || "Not set"}</dd></div>
                      <div><dt>Events</dt><dd>{plural(f.events.length, "event")}{f.events.length !== f.event_count ? ` (${f.event_count} not archived)` : ""}</dd></div>
                    </dl>
                    {f.description && <p className="spaced-top flush pre-line">{f.description}</p>}
                  </Card>
                </div>
                <div className="detail-col">
                  <Card as="section" aria-labelledby="fs-h">
                    <h3 id="fs-h">Seats across its events</h3>
                    {f.capacity > 0 ? <SeatMeter taken={f.taken} capacity={f.capacity} /> : <p className="muted flush">No seats yet: this fest has no active events.</p>}
                    {f.events.length > 0 && <p className="muted small spaced-top flush"><Icon name="info" /> A fest with events can't be deleted. Archive it to take it off the public site.</p>}
                  </Card>
                </div>
              </div>

              <section className="card org-panel" aria-labelledby="fe-h">
                <div className="section-head"><h2 id="fe-h">Events in this fest</h2>{!f.archived && <Button size="sm" variant="ghost" to={`/organizer/events/new?fest=${f.id}`}><Icon name="plus" /> Add event</Button>}</div>
                {f.events.length === 0
                  ? <EmptyState icon="calendar" title="No events in this fest yet" message={f.archived ? "Restore the fest to add events to it." : "Add the first event to open it for registration."} action={!f.archived ? <Button to={`/organizer/events/new?fest=${f.id}`}><Icon name="plus" /> Add event</Button> : null} />
                  : <ul className="rows">{f.events.map((e) => (
                    <li key={e.id}>
                      <div className="min0 grow">
                        <Link to={`/organizer/events/${e.id}`} className="row-title">{e.title}</Link>
                        <p className="muted small flush">{formatShort(e.starts_at)}{e.venue ? ` · ${e.venue}` : ""}</p>
                        <SeatMeter taken={e.taken} capacity={e.capacity} compact />
                      </div>
                      <StateBadge state={e.registration_state} />
                    </li>
                  ))}</ul>}
              </section>
            </>
          );
        }}
      </Async>
      {confirm.dialog}
    </div>
  );
}
