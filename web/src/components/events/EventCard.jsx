import Icon from "../common/Icon.jsx";
import Button from "../common/Button.jsx";
import { Link } from "../../router.jsx";
import { StateBadge } from "../common/Badge.jsx";
import { formatShort } from "../../lib/dates.js";
import { stateInfo } from "../../lib/format.js";

// The badge and the action come straight from the backend's registration_state: Register appears only for "open".
// The whole card opens the event (stretched title link); the Register button sits above it as its own control.
export default function EventCard({ event }) {
  const s = event.registration_state, open = s === "open", info = stateInfo(s);
  const seats = open ? `${event.remaining} of ${event.capacity} seats left` : s === "full" ? "All seats taken" : `${event.capacity} seats`;
  return (
    <article className={`card event-card state-${s}`}>
      <div className="row"><StateBadge state={s} />{event.category && <span className="muted small">{event.category}</span>}</div>
      <h3><Link to={`/events/${event.id}`} className="card-stretch">{event.title}</Link></h3>
      {(event.club_name || event.fest_name) && <p className="muted small flush">{[event.club_name, event.fest_name].filter(Boolean).join(" · ")}</p>}
      <ul className="meta">
        <li><Icon name="calendar" />{formatShort(event.starts_at)}</li>
        {event.venue && <li><Icon name="pin" />{event.venue}</li>}
        <li><Icon name="users" />{seats}</li>
      </ul>
      <div className="event-card-foot">
        {open ? <Button size="sm" to={`/events/${event.id}/register`}>{event.auto_confirm ? "Register" : "Request a seat"} <Icon name="arrow" /></Button> : <span className="muted small">{info.cta}</span>}
      </div>
    </article>
  );
}
