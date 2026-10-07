import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { usePageTitle } from "../router.jsx";
import PageContainer, { PageHead } from "../components/common/PageContainer.jsx";
import { Async, EmptyState } from "../components/common/States.jsx";
import FestCard from "../components/fests/FestCard.jsx";

export default function ClubPage({ id }) {
  const club = useApi((signal) => api.club(id, { signal }), [id]);
  usePageTitle(club.data?.name);
  return (
    <PageContainer>
      <Async state={club} label="Loading club…">
        {(c) => (
          <>
            <PageHead title={`${c.emoji || ""} ${c.name}`.trim()} subtitle={c.description} crumbs={[{ label: "Clubs", to: "/clubs" }, { label: c.name }]} />
            {c.fests.length === 0
              ? <EmptyState icon="calendar" title="No fests yet" message="This club hasn't published a fest." />
              : <div className="grid-cards">{c.fests.map((f) => <FestCard key={f.id} fest={{ ...f, club_name: "" }} />)}</div>}
          </>
        )}
      </Async>
    </PageContainer>
  );
}
