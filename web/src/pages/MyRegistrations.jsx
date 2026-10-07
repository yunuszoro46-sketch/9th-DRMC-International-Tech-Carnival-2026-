import { useState } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { usePageTitle } from "../router.jsx";
import { extractToken, savedRegistrations } from "../lib/storage.js";
import { formatDate, formatTime } from "../lib/dates.js";
import PageContainer, { PageHead } from "../components/common/PageContainer.jsx";
import Card from "../components/common/Card.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { Async, EmptyState, Skeletons } from "../components/common/States.jsx";
import { StatusBadge } from "../components/common/Badge.jsx";
import { Field, Input } from "../components/common/Field.jsx";
import { useToast } from "../components/common/Toast.jsx";
import CancelDialog from "../components/registration/CancelDialog.jsx";

const passLabel = (r) => (r.pass_token ? "Pass ready" : r.status === "CHECKED_IN" ? "Pass used" : r.status === "PENDING" ? "Pass after approval" : "No active pass");

function RegCard({ item, onRemove, onCancel }) {
  const { reg, error, token, title } = item;
  if (error) {
    const gone = error.status === 404;
    return (
      <Card>
        <h3>{title || "Saved registration"}</h3>
        <div className="alert alert-warn" role="status"><Icon name="alert" /><div>{gone ? "The server no longer has this registration." : error.message}</div></div>
        <div className="row spaced-top"><Button variant="ghost" size="sm" onClick={() => onRemove(token)}><Icon name="trash" /> Remove from this device</Button></div>
      </Card>
    );
  }
  return (
    <Card className="reg-item">
      <div className="row row-between"><StatusBadge status={reg.status} /><span className="muted small">{passLabel(reg)}</span></div>
      <h3>{reg.title}</h3>
      <ul className="meta">
        <li><Icon name="calendar" />{formatDate(reg.starts_at)} · {formatTime(reg.starts_at)}</li>
        {reg.venue && <li><Icon name="pin" />{reg.venue}</li>}
      </ul>
      {reg.checked_in_at && <p className="small ok-text"><Icon name="check" /> Checked in</p>}
      <div className="row spaced-top">
        <Button size="sm" to={`/registration/${token}`}><Icon name="ticket" /> View pass</Button>
        {reg.can_cancel && <Button size="sm" variant="danger" onClick={() => onCancel(item)}>Cancel</Button>}
        <Button size="sm" variant="ghost" onClick={() => onRemove(token)} aria-label={`Remove ${reg.title} from this device`}><Icon name="trash" /></Button>
      </div>
    </Card>
  );
}

export default function MyRegistrations() {
  usePageTitle("My registrations");
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [link, setLink] = useState(""), [linkError, setLinkError] = useState("");
  const [cancelling, setCancelling] = useState(null);
  const items = useApi(async (signal) => {
    const saved = savedRegistrations.list();
    return Promise.all(saved.map(async (s) => {
      try { return { ...s, reg: await api.registration(s.token, { signal }) }; }
      catch (e) { if (signal.aborted || e?.name === "AbortError") throw e; return { ...s, error: e }; }
    }));
  }, [version]);

  const bump = () => setVersion((v) => v + 1);
  const remove = (token) => { savedRegistrations.remove(token); toast.info("Removed from this device."); bump(); };
  function add(e) {
    e.preventDefault();
    const t = extractToken(link);
    if (!t) { setLinkError("That doesn't look like a registration link. Paste the full link you were given."); return; }
    setLinkError(""); savedRegistrations.add(t); setLink(""); bump();
  }
  // Upcoming first (soonest), then past events (latest first). Display order only.
  const order = (list) => {
    const now = Date.now(), t = (i) => (i.reg ? new Date(i.reg.starts_at).getTime() : 0);
    const up = list.filter((i) => i.reg && t(i) >= now).sort((a, b) => t(a) - t(b)), rest = list.filter((i) => !(i.reg && t(i) >= now)).sort((a, b) => t(b) - t(a));
    return [...up, ...rest];
  };
  return (
    <PageContainer>
      <PageHead title="My registrations" subtitle="Registrations you made on this device. They are kept in this browser only; there is no account to sign in to." />
      <Async state={items} label="Loading your registrations…" skeleton={<Skeletons count={3} />} isEmpty={(d) => d.length === 0}
        empty={<EmptyState icon="ticket" title="No registrations on this device yet" message="Register for an event and your pass will be saved here. Have a registration link from another device? Add it below."
          action={<Button to="/events">Browse events</Button>} />}>
        {(d) => <div className="grid-cards">{order(d).map((i) => <RegCard key={i.token} item={i} onRemove={remove} onCancel={setCancelling} />)}</div>}
      </Async>
      <Card className="spaced-top">
        <h2>Add a registration</h2>
        <form onSubmit={add} noValidate className="row add-form">
          <div className="grow"><Field label="Registration link" error={linkError} hint="Paste the private link you received after registering.">{(p) => <Input {...p} value={link} onChange={(e) => setLink(e.target.value)} autoComplete="off" spellCheck="false" />}</Field></div>
          <Button type="submit" variant="secondary">Add</Button>
        </form>
      </Card>
      <CancelDialog open={!!cancelling} onClose={() => setCancelling(null)} token={cancelling?.token} eventTitle={cancelling?.reg?.title} onDone={items.reload} onStale={items.reload} />
    </PageContainer>
  );
}
