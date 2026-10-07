import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { usePageTitle } from "../router.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { Async, EmptyState, Skeletons } from "../components/common/States.jsx";
import FestCard from "../components/fests/FestCard.jsx";
import EventCard from "../components/events/EventCard.jsx";
import TechHero from "../components/visual/TechHero.jsx";
import Card from "../components/common/Card.jsx";
import SectionHead from "../components/common/SectionHead.jsx";

// Three real figures under the hero, counted from the same lists the page shows. Nothing appears until all are loaded.
const LIST_LIMIT = 200;                                          // the most the events list returns in one call
const word = (n, one) => (n === 1 ? one : one + "s");
function HeroFacts({ events, fests, clubs, failed }) {
  if (failed) return null;                                       // a figure we cannot stand behind is not shown at all
  if (!events || !fests || !clubs) return <div className="hero-facts" aria-hidden="true" />;
  const open = events.filter((e) => e.registration_state === "open").length, running = fests.filter((f) => f.status !== "past").length;
  const items = [[open, `${word(open, "event")} open for registration`], [running, `${word(running, "fest")} live or coming up`], [clubs.length, `${word(clubs.length, "club")} on the platform`]];
  return <dl className="hero-facts">{items.map(([n, label], i) => <div key={label}><dt>{label}</dt><dd>{n}{i === 0 && events.length >= LIST_LIMIT ? "+" : ""}</dd></div>)}</dl>;
}

export default function Home() {
  usePageTitle("");
  const fests = useApi((signal) => api.fests({}, { signal }));
  const events = useApi((signal) => api.events({ limit: LIST_LIMIT }, { signal }));
  const clubs = useApi((signal) => api.clubs({ signal }));
  return (
    <div className="container page-enter home-top">
      <TechHero eyebrow="LIVE WITH TECH" title="Discover. Register. Participate." lead="Find fests and events run by the college clubs, register in a minute, and get a digital pass: no external forms.">
        <div className="row"><Button to="/events">Browse events <Icon name="arrow" /></Button><Button variant="secondary" to="/my-registrations">My registrations</Button></div>
        <HeroFacts events={events.data} fests={fests.data} clubs={clubs.data} failed={!!(events.error || fests.error || clubs.error)} />
      </TechHero>
      <section className="section" aria-labelledby="open-h">
        <SectionHead id="open-h" title="Open for registration" action={<Button variant="ghost" size="sm" to="/events">All events <Icon name="arrow" /></Button>} />
        <Async state={events} label="Loading events…" skeleton={<Skeletons count={3} />}
          isEmpty={(d) => !d.some((e) => e.registration_state === "open")}
          empty={<EmptyState icon="calendar" title="No events are open right now" message="Check back soon, or browse the clubs for upcoming fests." />}>
          {(d) => <div className="grid-cards">{d.filter((e) => e.registration_state === "open").slice(0, 6).map((e) => <EventCard key={e.id} event={e} />)}</div>}
        </Async>
      </section>
      <section className="section" aria-labelledby="fest-h">
        <SectionHead id="fest-h" title="Fests" action={<Button variant="ghost" size="sm" to="/clubs">All clubs <Icon name="arrow" /></Button>} />
        <Async state={fests} label="Loading fests…" skeleton={<Skeletons count={3} />}
          isEmpty={(d) => d.length === 0} empty={<EmptyState icon="calendar" title="No fests yet" message="Fests will appear here once a club publishes one." />}>
          {(d) => {
            const rank = { live: 0, upcoming: 1, past: 2 };
            return <div className="grid-cards">{[...d].sort((a, b) => rank[a.status] - rank[b.status]).slice(0, 6).map((f) => <FestCard key={f.id} fest={f} />)}</div>;
          }}
        </Async>
      </section>
      <section className="section" aria-labelledby="in-h">
        <SectionHead id="in-h" title="Get involved" />
        <div className="grid-cards">
          <Card to="/volunteer"><h3><Icon name="heart" /> Volunteer with the club</h3><p className="muted small flush">Help run events and projects in programming, design, AI, video or robotics.</p></Card>
          <Card to="/gallery"><h3><Icon name="image" /> Photo gallery</h3><p className="muted small flush">A growing archive of workshops, contests and fests.</p></Card>
          <Card to="/clubs"><h3><Icon name="users" /> Clubs</h3><p className="muted small flush">Every club on the platform and the fests it runs.</p></Card>
        </div>
      </section>
    </div>
  );
}
