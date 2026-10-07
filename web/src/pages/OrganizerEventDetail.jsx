import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { Link, useNavigate, usePageTitle } from "../router.jsx";
import { formatDate, formatTime, formatDateTime } from "../lib/dates.js";
import { FIELD_TYPES } from "../lib/format.js";
import { whyClosed } from "../lib/eventState.js";
import Card from "../components/common/Card.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import Badge, { StateBadge } from "../components/common/Badge.jsx";
import { Async } from "../components/common/States.jsx";
import SeatMeter from "../components/organizer/SeatMeter.jsx";
import { useConfirmAction } from "../components/organizer/useConfirmAction.jsx";
import { eventActions } from "../components/organizer/lifecycle.js";

const typeLabel = (t) => FIELD_TYPES.find((x) => x.value === t)?.label || t;

// GET /api/admin/events/:id. `registration_state` (open / full / closed / ended / archived) is the backend's one state
// for an event; `archived_at` is the event's own archive flag and `fest_archived_at` its fest's.
export default function OrganizerEventDetail({ id }) {
  const navigate = useNavigate();
  const event = useApi((signal) => api.admin.event(id, { signal }), [id]);
  const confirm = useConfirmAction();
  usePageTitle(event.data ? event.data.title : "Event");
  return (
    <div className="org-page">
      <div className="org-intro">
        <Link to="/organizer/events" className="back-link"><Icon name="chevL" /> Back to events</Link>
        <Button variant="ghost" size="sm" onClick={event.reload} disabled={event.loading}><Icon name="refresh" /> {event.loading && event.data ? "Refreshing…" : "Refresh"}</Button>
      </div>
      <Async state={event} label="Loading event…">
        {(e) => {
          const a = eventActions(e), after = { onDone: event.reload }, ownArchived = !!e.archived_at, festArchived = !!e.fest_archived_at;
          const reason = e.registration_state === "open" ? "People can register now." : e.registration_state === "archived" ? "Hidden from the public site." : whyClosed(e);
          return (
            <>
              <header className="glass-panel reg-head">
                <div className="min0">
                  <p className="tech-eyebrow reg-eyebrow">Event · {e.category}</p>
                  <h2 id="event-name">{e.title}</h2>
                  <p className="muted flush"><Link to={`/organizer/fests/${e.fest_id}`}>{e.fest_name}</Link>{e.club_name ? ` · ${e.club_name}` : ""}</p>
                </div>
                <div className="reg-head-status"><StateBadge state={e.registration_state} /><p className="muted small flush">{reason}</p></div>
                <div className="action-bar" role="group" aria-label="Actions for this event">
                  <Button size="sm" to={`/organizer/events/${e.id}/edit`}><Icon name="edit" /> Edit event</Button>
                  <Button size="sm" variant="secondary" to={`/organizer/registrations?event=${e.id}`}><Icon name="list" /> View registrations</Button>
                  <Button size="sm" variant="secondary" to="/organizer/check-in"><Icon name="scan" /> Check-in</Button>
                  {!e.archived && <Button size="sm" variant="secondary" to={`/events/${e.id}`}>Public page</Button>}
                  {ownArchived
                    ? <Button size="sm" variant="secondary" onClick={() => confirm.ask({ ...a.restore, ...after })}><Icon name="undo" /> Restore</Button>
                    : <Button size="sm" variant="secondary" onClick={() => confirm.ask({ ...a.archive, ...after })}><Icon name="archive" /> Archive</Button>}
                  {e.taken === 0 && <Button size="sm" variant="danger" onClick={() => confirm.ask({ ...a.remove, onDone: () => navigate("/organizer/events", { replace: true }) })}><Icon name="trash" /> Delete</Button>}
                </div>
              </header>
              {festArchived && <div className="alert alert-warn" role="status"><Icon name="alert" /><div>The fest <Link to={`/organizer/fests/${e.fest_id}`}>{e.fest_name}</Link> is archived, so this event is hidden too{ownArchived ? "" : " even though the event itself is not archived"}. Restore the fest to bring it back.</div></div>}

              <div className="detail-cards">
                <div className="detail-col">
                  <Card as="section" aria-labelledby="ed-h">
                    <h3 id="ed-h">Event</h3>
                    <dl className="facts facts-2">
                      <div><dt>Date</dt><dd>{formatDate(e.starts_at)}</dd></div>
                      <div><dt>Starts</dt><dd>{formatTime(e.starts_at)}</dd></div>
                      <div><dt>Venue</dt><dd>{e.venue}</dd></div>
                      <div><dt>Category</dt><dd>{e.category}</dd></div>
                      <div><dt>Fest</dt><dd>{e.fest_name}</dd></div>
                      <div><dt>Club</dt><dd>{e.club_name}</dd></div>
                    </dl>
                    {e.description && <p className="spaced-top flush pre-line">{e.description}</p>}
                  </Card>
                  {e.rules && <Card as="section" aria-labelledby="er-h"><h3 id="er-h">Rules and information</h3><p className="pre-line flush">{e.rules}</p></Card>}
                </div>
                <div className="detail-col">
                  <Card as="section" aria-labelledby="es-h">
                    <h3 id="es-h">Registration</h3>
                    <SeatMeter taken={e.taken} capacity={e.capacity} />
                    <dl className="facts facts-2 spaced-top">
                      <div><dt>State</dt><dd><StateBadge state={e.registration_state} /></dd></div>
                      <div><dt>Seats left</dt><dd>{e.remaining} of {e.capacity}</dd></div>
                      <div><dt>Registration closes</dt><dd>{formatDateTime(e.deadline)}</dd></div>
                      <div><dt>Acceptance</dt><dd>{e.auto_confirm ? "Confirmed instantly" : "Organizer approves each request"}</dd></div>
                    </dl>
                    {e.taken > 0 && <p className="muted small spaced-top flush"><Icon name="info" /> An event with registrations can't be deleted. Archive it to take it off the public site.</p>}
                  </Card>
                  <Card as="section" aria-labelledby="ef-h">
                    <h3 id="ef-h">Registration form</h3>
                    <ol className="form-fields">
                      <li><span>Full name</span><Badge tone="muted">Short text</Badge><Badge tone="info">Required</Badge></li>
                      <li><span>Email</span><Badge tone="muted">Email</Badge><Badge tone="info">Required</Badge></li>
                      {e.form_schema.map((f) => <li key={f.key}><span>{f.label}{f.type === "select" && <small className="muted"> ({f.options.join(", ")})</small>}</span><Badge tone="muted">{typeLabel(f.type)}</Badge>{f.required ? <Badge tone="info">Required</Badge> : <Badge tone="muted">Optional</Badge>}</li>)}
                    </ol>
                    <p className="small spaced-top flush"><Link to={`/organizer/events/${e.id}/edit`}>Edit the form</Link></p>
                  </Card>
                </div>
              </div>
            </>
          );
        }}
      </Async>
      {confirm.dialog}
    </div>
  );
}
