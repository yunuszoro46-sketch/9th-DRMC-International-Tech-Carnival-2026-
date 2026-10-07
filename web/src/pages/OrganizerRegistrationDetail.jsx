import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { Link } from "../router.jsx";
import { formatDate, formatTime, formatDateTime } from "../lib/dates.js";
import { REG_STATUS } from "../lib/format.js";
import { ACTIONS, ORGANIZER_NOTE, actionsFor, answerRows, passLabel } from "../lib/registrationAdmin.js";
import Card from "../components/common/Card.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { StateBadge, StatusBadge } from "../components/common/Badge.jsx";
import { Loading } from "../components/common/States.jsx";
import SeatMeter from "../components/organizer/SeatMeter.jsx";

// One registration, for an organizer. `reg` is a row from GET /api/admin/registrations (id, name, email, status, answers,
// created_at, pass_status, checked_in_at, event_id, event_title, fest_name). The event card and the answer labels come
// from GET /api/admin/events/:id. Only fields those two responses contain are shown.
export default function OrganizerRegistrationDetail({ reg, backTo, onAction, busy, onRefresh, refreshing, eventTick }) {
  // eventTick changes after every action so seats and state are re-read along with the registration.
  const event = useApi((signal) => api.admin.event(reg.event_id, { signal }), [reg.event_id, eventTick]);
  const e = event.data, note = ORGANIZER_NOTE[reg.status];
  const actions = actionsFor(reg.status);
  const answers = answerRows(e ? e.form_schema : [], reg.answers);
  const answersReady = !!e || !!event.error;      // labels come from the event; wait so raw keys never flash

  return (
    <div className="org-page">
      <div className="org-intro">
        <Link to={backTo} className="back-link"><Icon name="chevL" /> Back to registrations</Link>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" /> {refreshing ? "Refreshing…" : "Refresh"}</Button>
      </div>

      <header className="glass-panel reg-head">
        <div className="min0">
          <p className="tech-eyebrow reg-eyebrow">Registration #{reg.id}</p>
          <h2 id="reg-name">{reg.name}</h2>
          <p className="muted flush">{reg.event_title}{reg.fest_name ? ` · ${reg.fest_name}` : ""}</p>
        </div>
        <div className="reg-head-status"><StatusBadge status={reg.status} />{note && <p className="muted small flush">{note}</p>}</div>
        <div className="action-bar" role="group" aria-label="Actions for this registration">
          {actions.length === 0
            ? <p className="muted small flush"><Icon name="info" /> No further actions: a {(REG_STATUS[reg.status]?.label || reg.status).toLowerCase()} registration is final.</p>
            : actions.map((a) => (
              <Button key={a} variant={ACTIONS[a].variant} size="sm" disabled={busy} onClick={() => onAction(a, reg)}><Icon name={ACTIONS[a].icon} /> {ACTIONS[a].label}</Button>
            ))}
        </div>
      </header>

      <div className="detail-cards">
        <div className="detail-col">
          <Card as="section" aria-labelledby="p-h">
            <h3 id="p-h">Participant</h3>
            <dl className="facts">
              <div><dt>Name</dt><dd>{reg.name}</dd></div>
              <div><dt>Email</dt><dd><a href={`mailto:${reg.email}`}>{reg.email}</a></dd></div>
            </dl>
          </Card>

          <Card as="section" aria-labelledby="a-h">
            <h3 id="a-h">Submitted answers</h3>
            {!answersReady ? <Loading label="Loading answers…" />
              : answers.length === 0 ? <p className="muted flush">This event's form has no extra questions, or the participant left them blank.</p>
                : <dl className="facts">{answers.map((a) => <div key={a.key}><dt>{a.label}</dt><dd className="pre-line">{a.value}</dd></div>)}</dl>}
          </Card>
        </div>
        <div className="detail-col">
          <Card as="section" aria-labelledby="r-h">
            <h3 id="r-h">Registration</h3>
            <dl className="facts facts-2">
              <div><dt>Registration ID</dt><dd>#{reg.id}</dd></div>
              <div><dt>Status</dt><dd>{REG_STATUS[reg.status]?.label || reg.status}</dd></div>
              <div><dt>Registered</dt><dd>{formatDateTime(reg.created_at) || "Unknown"}</dd></div>
              <div><dt>Pass</dt><dd>{passLabel(reg.pass_status)}</dd></div>
              <div><dt>Checked in</dt><dd>{reg.checked_in_at ? formatDateTime(reg.checked_in_at) : "Not checked in"}</dd></div>
            </dl>
          </Card>

          <Card as="section" aria-labelledby="e-h">
            <h3 id="e-h">Event</h3>
            {e ? (
              <>
                <div className="row spaced-bottom-sm"><StateBadge state={e.registration_state} /><span className="muted small">{e.auto_confirm ? "Registrations are confirmed instantly" : "Registrations need approval"}</span></div>
                <dl className="facts facts-2">
                  <div><dt>Event</dt><dd>{e.title}</dd></div>
                  <div><dt>Club · Fest</dt><dd>{[e.club_name, e.fest_name].filter(Boolean).join(" · ")}</dd></div>
                  <div><dt>Date</dt><dd>{formatDate(e.starts_at)}</dd></div>
                  <div><dt>Time</dt><dd>{formatTime(e.starts_at)}</dd></div>
                  {e.venue && <div><dt>Venue</dt><dd>{e.venue}</dd></div>}
                </dl>
                <div className="spaced-top"><SeatMeter taken={e.taken} capacity={e.capacity} /></div>
                {!e.archived && <p className="small spaced-top flush"><Link to={`/events/${e.id}`}>Open the public event page</Link></p>}
              </>
            ) : event.error ? (
              <>
                <dl className="facts"><div><dt>Event</dt><dd>{reg.event_title}</dd></div>{reg.fest_name && <div><dt>Fest</dt><dd>{reg.fest_name}</dd></div>}</dl>
                <div className="alert alert-warn spaced-top" role="status"><Icon name="alert" /><div>The rest of the event details couldn't be loaded. {event.error.message} <button type="button" className="link-btn" onClick={event.reload}>Try again</button></div></div>
              </>
            ) : <Loading label="Loading event…" />}
          </Card>
        </div>
      </div>
    </div>
  );
}
