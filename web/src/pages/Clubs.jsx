import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { usePageTitle } from "../router.jsx";
import PageContainer, { PageHead } from "../components/common/PageContainer.jsx";
import Card from "../components/common/Card.jsx";
import Icon from "../components/common/Icon.jsx";
import { Async, EmptyState, Skeletons } from "../components/common/States.jsx";
import { plural } from "../lib/format.js";

export default function Clubs() {
  usePageTitle("Clubs");
  const clubs = useApi((signal) => api.clubs({ signal }));
  return (
    <PageContainer>
      <PageHead title="Clubs" subtitle="Every club at the college and the fests it runs." />
      <Async state={clubs} label="Loading clubs…" skeleton={<Skeletons count={6} />} isEmpty={(d) => d.length === 0}
        empty={<EmptyState icon="users" title="No clubs yet" message="Clubs will appear here once they are set up." />}>
        {(d) => (
          <div className="grid-cards">
            {d.map((c) => (
              <Card key={c.id} to={`/clubs/${c.id}`}>
                <h3><span aria-hidden="true">{c.emoji} </span>{c.name}</h3>
                {c.description && <p className="muted small">{c.description}</p>}
                <ul className="meta"><li><Icon name="calendar" />{plural(c.fest_count, "fest")}</li><li><Icon name="ticket" />{plural(c.event_count, "event")}</li></ul>
              </Card>
            ))}
          </div>
        )}
      </Async>
    </PageContainer>
  );
}
