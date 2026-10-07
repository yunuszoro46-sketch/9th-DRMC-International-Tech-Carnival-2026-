import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { usePageTitle } from "../router.jsx";
import PageContainer, { PageHead } from "../components/common/PageContainer.jsx";
import Card from "../components/common/Card.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { Async } from "../components/common/States.jsx";
import { StateBadge } from "../components/common/Badge.jsx";
import { formatDate, formatTime, formatDateTime } from "../lib/dates.js";
import { stateInfo } from "../lib/format.js";
import { whyClosed } from "../lib/eventState.js";

export default function EventPage({ id }) {
  const event = useApi((signal) => api.event(id, { signal }), [id]);
  usePageTitle(event.data?.title);
  return (
    <PageContainer>
      <Async state={event} label="Loading event…">
        {(e) => {
          const info = stateInfo(e.registration_state);
          return (
            <>
              <PageHead title={e.title} crumbs={[{ label: "Clubs", to: "/clubs" }, ...(e.club_id ? [{ label: e.club_name || "Club", to: `/clubs/${e.club_id}` }] : []), { label: e.fest_name, to: `/fests/${e.fest_id}` }, { label: e.title }]} />
              <div className="row event-tags"><StateBadge state={e.registration_state} />{e.category && <span className="muted">{e.category}</span>}</div>
              <div className="detail-grid detail-grid-lead">
                <div className="stack">
                  {e.description && <p>{e.description}</p>}
                  {e.rules && <Card><h2>Rules &amp; information</h2><p className="pre-line flush">{e.rules}</p></Card>}
                </div>
                <aside className="detail-aside">
                  <Card>
                    <dl className="facts">
                      <div><dt>Date</dt><dd>{formatDate(e.starts_at)}</dd></div>
                      <div><dt>Time</dt><dd>{formatTime(e.starts_at)}</dd></div>
                      {e.venue && <div><dt>Venue</dt><dd>{e.venue}</dd></div>}
                      <div><dt>Seats</dt><dd>{e.remaining} left of {e.capacity}</dd></div>
                      {e.deadline && <div><dt>Register by</dt><dd>{formatDateTime(e.deadline)}</dd></div>}
                      <div><dt>Registration</dt><dd>{e.auto_confirm ? "Confirmed instantly" : "Needs organizer approval"}</dd></div>
                    </dl>
                    <div className="spaced-top">
                      {e.registration_state === "open"
                        ? <Button block to={`/events/${e.id}/register`}>{e.auto_confirm ? info.cta : "Request a Seat"} <Icon name="arrow" /></Button>
                        : <div className="alert alert-warn" role="status"><Icon name="info" /><div><strong>{info.cta}.</strong> {whyClosed(e)}</div></div>}
                    </div>
                  </Card>
                </aside>
              </div>
            </>
          );
        }}
      </Async>
    </PageContainer>
  );
}
