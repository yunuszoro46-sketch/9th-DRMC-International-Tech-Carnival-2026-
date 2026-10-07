import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { usePageTitle } from "../router.jsx";
import PageContainer, { PageHead } from "../components/common/PageContainer.jsx";
import Icon from "../components/common/Icon.jsx";
import { Async, EmptyState } from "../components/common/States.jsx";
import { FestStatusBadge } from "../components/common/Badge.jsx";
import SectionHead from "../components/common/SectionHead.jsx";
import EventCard from "../components/events/EventCard.jsx";
import { formatRange } from "../lib/dates.js";

export default function FestPage({ id }) {
  const fest = useApi((signal) => api.fest(id, { signal }), [id]);
  usePageTitle(fest.data?.name);
  return (
    <PageContainer>
      <Async state={fest} label="Loading fest…">
        {(f) => (
          <>
            <PageHead title={f.name} subtitle={f.description}
              crumbs={[{ label: "Clubs", to: "/clubs" }, ...(f.club_id ? [{ label: f.club_name || "Club", to: `/clubs/${f.club_id}` }] : []), { label: f.name }]} />
            <ul className="meta spaced-bottom">
              <li><FestStatusBadge status={f.status} /></li><li><Icon name="calendar" />{formatRange(f.starts_on, f.ends_on)}</li>{f.venue && <li><Icon name="pin" />{f.venue}</li>}
            </ul>
            <SectionHead title="Events" />
            {f.events.length === 0
              ? <EmptyState icon="ticket" title="No events yet" message="Events for this fest will be listed here." />
              : <div className="grid-cards">{f.events.map((e) => <EventCard key={e.id} event={e} />)}</div>}
          </>
        )}
      </Async>
    </PageContainer>
  );
}
