import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { useSearchParams, usePageTitle } from "../router.jsx";
import { savedRegistrations } from "../lib/storage.js";
import { formatDate, formatTime, formatDateTime } from "../lib/dates.js";
import { REG_STATUS } from "../lib/format.js";
import PageContainer, { PageHead } from "../components/common/PageContainer.jsx";
import Card from "../components/common/Card.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { Async } from "../components/common/States.jsx";
import { StatusBadge } from "../components/common/Badge.jsx";
import { useToast } from "../components/common/Toast.jsx";
import QrPass from "../components/registration/QrPass.jsx";
import { ClubLogo } from "../components/brand/Brand.jsx";
import CancelDialog from "../components/registration/CancelDialog.jsx";

const humanize = (k) => String(k).replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

// What the pass area says for each status. The QR only exists while the backend hands out a pass_token.
function PassPanel({ reg, onRefresh }) {
  if (reg.pass_token) return <QrPass token={reg.pass_token} label={`Pass for ${reg.name}`} />;
  const note = {
    PENDING: "Your request is waiting for organizer approval. Your QR pass appears here as soon as you're approved.",
    REJECTED: "This registration was not approved, so there is no pass.",
    CANCELLED: "This registration was cancelled, so the pass is no longer valid.",
    CHECKED_IN: reg.checked_in_at ? `Checked in on ${formatDateTime(reg.checked_in_at)}. The pass has been used.` : "You have been checked in. The pass has been used.",
    CONFIRMED: "Your pass is still being prepared.",
  }[reg.status] || "No pass is available for this registration.";
  return (
    <div className="pass-empty">
      <Icon name={reg.status === "CHECKED_IN" ? "check" : reg.status === "PENDING" ? "clock" : "ticket"} className="state-icon" />
      <p>{note}</p>
      {(reg.status === "PENDING" || reg.status === "CONFIRMED") && <Button variant="secondary" size="sm" onClick={onRefresh}><Icon name="refresh" /> Check again</Button>}
    </div>
  );
}

function Detail({ reg, labels, labelsReady, eventGone, state }) {
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const fresh = params.get("new") === "1";
  const info = REG_STATUS[reg.status] || { note: "" };
  const answerKeys = [...Object.keys(labels), ...Object.keys(reg.answers || {}).filter((k) => !(k in labels))].filter((k) => reg.answers && reg.answers[k] !== undefined);

  useEffect(() => { savedRegistrations.add(state.token, reg.title); }, [state.token, reg.title]);   // a pasted link joins "My registrations"

  async function copy() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/registration/${state.token}`); toast.success("Link copied. Keep it: it's the only way back to this pass."); }
    catch { toast.error("Couldn't copy automatically. Copy the address from your browser's address bar instead."); }
  }
  const canCancel = !!reg.can_cancel;
  return (
    <>
      {fresh && (
        <div className={`alert ${reg.status === "CONFIRMED" ? "alert-ok" : "alert-info"} spaced-bottom`} role="status">
          <Icon name={reg.status === "PENDING" ? "clock" : "check"} />
          <div>
            <strong>{reg.status === "PENDING" ? "Request received." : "You're registered."}</strong>{" "}
            {reg.status === "PENDING" ? "The organizers will review it. " : ""}Save this page: the link is private and is how you get back to your pass. It is also stored on this device.
            <button type="button" className="link-btn" onClick={() => setParams({ new: "" })}>Dismiss</button>
          </div>
        </div>
      )}
      <div className="reg-grid">
        <section className="pass-card" aria-labelledby="pass-h">
          <p className="pass-brand"><ClubLogo size="sm" /><span>DRMC IT CLUB</span></p>
          <div className="pass-top">
            <h2 id="pass-h">Entry pass</h2>
            <StatusBadge status={reg.status} />
          </div>
          <PassPanel reg={reg} onRefresh={state.reload} />
          <p className="pass-note">{info.note}</p>
        </section>
        <div className="stack">
          <Card>
            <h2>{reg.title}</h2>
            <p className="muted">{[reg.club_name, reg.fest_name].filter(Boolean).join(" · ")}</p>
            <dl className="facts facts-2">
              <div><dt>Date</dt><dd>{formatDate(reg.starts_at)}</dd></div>
              <div><dt>Time</dt><dd>{formatTime(reg.starts_at)}</dd></div>
              {reg.venue && <div><dt>Venue</dt><dd>{reg.venue}</dd></div>}
              <div><dt>Status</dt><dd>{(REG_STATUS[reg.status] || {}).label || reg.status}</dd></div>
              <div><dt>Participant</dt><dd>{reg.name}</dd></div>
              <div><dt>Email</dt><dd>{reg.email}</dd></div>
              {reg.created_at && <div><dt>Registered</dt><dd>{formatDateTime(reg.created_at)}</dd></div>}
              {reg.checked_in_at && <div><dt>Checked in</dt><dd>{formatDateTime(reg.checked_in_at)}</dd></div>}
            </dl>
          </Card>
          {labelsReady && answerKeys.length > 0 && (   // wait for the event's field labels so raw keys never flash on screen
            <Card>
              <h2>Registration information</h2>
              <dl className="facts facts-2">{answerKeys.map((k) => <div key={k}><dt>{labels[k] || humanize(k)}</dt><dd className="pre-line">{reg.answers[k]}</dd></div>)}</dl>
            </Card>
          )}
          <div className="row">
            {!eventGone && <Button variant="secondary" to={`/events/${reg.event_id}`}>View event</Button>}
            <Button variant="secondary" onClick={copy}><Icon name="copy" /> Copy private link</Button>
            {canCancel && <Button variant="danger" onClick={() => setCancelOpen(true)}>Cancel registration</Button>}
          </div>
          {!canCancel && ["PENDING", "CONFIRMED"].includes(reg.status) && <p className="muted small">Cancelling is no longer possible because the event has started.</p>}
        </div>
      </div>
      <CancelDialog open={cancelOpen} onClose={() => setCancelOpen(false)} token={state.token} eventTitle={reg.title} onDone={state.reload} onStale={state.reload} />
    </>
  );
}

export default function RegistrationPage({ token }) {
  const reg = useApi((signal) => api.registration(token, { signal }), [token]);
  // Field labels live on the event's form_schema. Best effort: if it can't be read, keys are shown in readable form.
  const event = useApi((signal) => api.event(reg.data.event_id, { signal }), [reg.data?.event_id], { enabled: !!reg.data });
  usePageTitle("Your registration");
  const labels = Object.fromEntries((event.data?.form_schema || []).map((f) => [f.key, f.label]));
  return (
    <PageContainer>
      <PageHead title="Your registration" crumbs={[{ label: "My registrations", to: "/my-registrations" }, { label: "Pass" }]} />
      <Async state={reg} label="Loading your registration…">
        {(r) => <Detail reg={r} labels={labels} labelsReady={!!event.data || !!event.error} eventGone={event.error?.status === 404} state={{ token, reload: reg.reload }} />}
      </Async>
    </PageContainer>
  );
}
