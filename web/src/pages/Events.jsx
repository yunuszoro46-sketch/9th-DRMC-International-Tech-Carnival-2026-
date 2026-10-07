import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { useSearchParams, usePageTitle } from "../router.jsx";
import { EVENT_STATE, plural } from "../lib/format.js";
import PageContainer, { PageHead } from "../components/common/PageContainer.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { Async, EmptyState, Skeletons } from "../components/common/States.jsx";
import { Field, Input, Select } from "../components/common/Field.jsx";
import EventCard from "../components/events/EventCard.jsx";

const STATES = ["open", "full", "closed", "ended"];     // archived events are never returned by the public API
const RANK = { open: 0, full: 1, closed: 2, ended: 3, archived: 4 };

export default function Events() {
  usePageTitle("Events");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "", club = params.get("club") || "", category = params.get("category") || "", state = params.get("state") || "";
  // Typing updates the box at once and the URL/request a moment later.
  const [text, setText] = useState(q);
  const debounced = useDebounce(text, 300);
  useEffect(() => { if (debounced.trim() !== q) setParams({ q: debounced.trim() }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [debounced]);
  useEffect(() => { setText(q); }, [q]);                  // back/forward or "Clear filters" resets the box

  const clubs = useApi((signal) => api.clubs({ signal }));
  const all = useApi((signal) => api.events({ limit: 200 }, { signal }));                 // unfiltered: source of the category list
  const list = useApi((signal) => api.events({ q, club, category, limit: 200 }, { signal }), [q, club, category]);
  const categories = useMemo(() => [...new Set((all.data || []).map((e) => e.category).filter(Boolean))].sort(), [all.data]);
  const filtered = useMemo(() => (list.data || []).filter((e) => !state || e.registration_state === state).sort((a, b) => (RANK[a.registration_state] ?? 9) - (RANK[b.registration_state] ?? 9)), [list.data, state]);
  const counts = useMemo(() => { const c = {}; (list.data || []).forEach((e) => { c[e.registration_state] = (c[e.registration_state] || 0) + 1; }); return c; }, [list.data]);
  const active = !!(q || club || category || state);
  const clear = () => setParams({ q: "", club: "", category: "", state: "" });

  return (
    <PageContainer>
      <PageHead title="Events" subtitle="Every event from every club. Register where a seat is open." />
      <section className="filter-bar glass" aria-label="Filter events">
        <form className="filter-grid" role="search" onSubmit={(e) => e.preventDefault()}>
          <Field label="Search">{(p) => <Input {...p} type="search" placeholder="Title or keyword" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
          <Field label="Club">{(p) => <Select {...p} value={club} onChange={(e) => setParams({ club: e.target.value })}><option value="">All clubs</option>{(clubs.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
          <Field label="Category">{(p) => <Select {...p} value={category} onChange={(e) => setParams({ category: e.target.value })}><option value="">All categories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</Select>}</Field>
        </form>
        <div className="chip-row" role="group" aria-label="Registration status">
          <button type="button" className="chip" aria-pressed={!state} onClick={() => setParams({ state: "" })}>All</button>
          {STATES.map((s) => <button key={s} type="button" className="chip" aria-pressed={state === s} onClick={() => setParams({ state: state === s ? "" : s })}>{EVENT_STATE[s].label}{counts[s] ? <span className="chip-n">{counts[s]}</span> : null}</button>)}
        </div>
      </section>
      <p className="muted small results-line" role="status" aria-live="polite">{list.data ? `${plural(filtered.length, "event")}${active ? " match your filters" : ""}` : "\u00a0"}</p>
      <Async state={list} label="Loading events…" skeleton={<Skeletons count={6} />}
        isEmpty={() => filtered.length === 0}
        empty={<EmptyState icon="search" title={active ? "No events match" : "No events yet"} message={active ? "Try a different word or clear a filter." : "Events will appear here once a club publishes them."} action={active ? <Button variant="secondary" onClick={clear}><Icon name="x" /> Clear filters</Button> : null} />}>
        {() => <div className="grid-cards">{filtered.map((e) => <EventCard key={e.id} event={e} />)}</div>}
      </Async>
    </PageContainer>
  );
}
