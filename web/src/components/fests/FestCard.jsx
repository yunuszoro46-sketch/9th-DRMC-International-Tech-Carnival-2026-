import Card from "../common/Card.jsx";
import Icon from "../common/Icon.jsx";
import { FestStatusBadge } from "../common/Badge.jsx";
import { formatRange } from "../../lib/dates.js";
import { plural } from "../../lib/format.js";
export default function FestCard({ fest }) {
  return (
    <Card to={`/fests/${fest.id}`}>
      <div className="row"><FestStatusBadge status={fest.status} />{fest.club_name && <span className="muted small">{fest.club_emoji && <span aria-hidden="true">{fest.club_emoji} </span>}{fest.club_name}</span>}</div>
      <h3>{fest.name}</h3>
      {fest.description && <p className="muted small">{fest.description}</p>}
      <ul className="meta">
        <li><Icon name="calendar" />{formatRange(fest.starts_on, fest.ends_on)}</li>
        {fest.venue && <li><Icon name="pin" />{fest.venue}</li>}
        <li><Icon name="ticket" />{plural(fest.event_count, "event")}</li>
      </ul>
    </Card>
  );
}
