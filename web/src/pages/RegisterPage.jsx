import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { Link, useNavigate, usePageTitle } from "../router.jsx";
import { savedRegistrations } from "../lib/storage.js";
import { formatDate, formatTime, formatDateTime } from "../lib/dates.js";
import { cleanAnswers, emptyAnswers, hasErrors, interpretRegisterError, validateRegistration } from "../lib/registrationForm.js";
import { whyClosed } from "../lib/eventState.js";
import { stateInfo } from "../lib/format.js";
import PageContainer, { PageHead } from "../components/common/PageContainer.jsx";
import Card from "../components/common/Card.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { Async } from "../components/common/States.jsx";
import { StateBadge } from "../components/common/Badge.jsx";
import { Field, Input, Select, Textarea } from "../components/common/Field.jsx";
import { useToast } from "../components/common/Toast.jsx";

const LIMIT = { text: 200, textarea: 1000, tel: 20, number: 20, email: 254, select: 100 };

// One control per backend field type: text, email, tel, number, textarea, select.
// Exported so the organizer's form builder previews a question with the very control participants will get.
export function Control({ field, id, value, onChange, aria }) {
  const common = { id, name: field.key, value, onChange: (e) => onChange(e.target.value), ...aria };
  switch (field.type) {
    case "textarea": return <Textarea {...common} maxLength={LIMIT.textarea} rows={4} />;
    case "select": return (
      <Select {...common}><option value="">Choose an option…</option>{(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</Select>
    );
    case "email": return <Input {...common} type="email" autoComplete="email" maxLength={LIMIT.email} />;
    case "tel": return <Input {...common} type="tel" inputMode="tel" autoComplete="tel" maxLength={LIMIT.tel} placeholder="01712-345678" />;
    case "number": return <Input {...common} type="text" inputMode="decimal" maxLength={LIMIT.number} />;
    default: return <Input {...common} type="text" maxLength={LIMIT.text} />;
  }
}

function Unavailable({ event }) {
  const info = stateInfo(event.registration_state);
  return (
    <Card>
      <div className="alert alert-warn" role="status"><Icon name="info" /><div><strong>{info.cta}.</strong> {whyClosed(event)}</div></div>
      <div className="row spaced-top"><Button variant="secondary" to={`/events/${event.id}`}>Back to event</Button><Button variant="ghost" to="/events">Browse events</Button></div>
    </Card>
  );
}

function RegisterForm({ event, reloadEvent }) {
  const schema = event.form_schema || [];
  const navigate = useNavigate(), toast = useToast();
  const [identity, setIdentity] = useState({ name: "", email: "" });
  const [answers, setAnswers] = useState(() => emptyAnswers(schema));
  const [errors, setErrors] = useState({ identity: {}, answers: {} });
  const [formError, setFormError] = useState(null);       // { message, duplicate? }
  const [busy, setBusy] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const formRef = useRef(null), bannerRef = useRef(null);

  useEffect(() => { if (focusTick) (formRef.current?.querySelector('[aria-invalid="true"]') || bannerRef.current)?.focus(); }, [focusTick]);

  const setId = (k) => (v) => { setIdentity((s) => ({ ...s, [k]: v })); if (errors.identity[k]) setErrors((e) => ({ ...e, identity: { ...e.identity, [k]: undefined } })); };
  const setAns = (k) => (v) => { setAnswers((s) => ({ ...s, [k]: v })); if (errors.answers[k]) setErrors((e) => ({ ...e, answers: { ...e.answers, [k]: undefined } })); };

  async function submit(ev) {
    ev.preventDefault();
    if (busy) return;
    setFormError(null);
    const found = validateRegistration(schema, identity, answers);
    setErrors(found);
    if (hasErrors(found)) { setFocusTick((t) => t + 1); return; }
    setBusy(true);
    try {
      const res = await api.register(event.id, { name: identity.name.trim(), email: identity.email.trim(), answers: cleanAnswers(schema, answers) });
      savedRegistrations.add(res.manage_token, event.title);
      navigate(`/registration/${res.manage_token}?new=1`);
    } catch (err) {
      const r = interpretRegisterError(err, schema);
      if (r.kind === "closed" || r.kind === "gone") { toast.error(r.message); reloadEvent(); }   // the page re-reads the event and swaps the form for the reason
      else if (r.kind === "duplicate") { setErrors((e) => ({ ...e, identity: { ...e.identity, email: r.message } })); setFormError({ message: r.message, duplicate: true }); setFocusTick((t) => t + 1); }
      else if (r.kind === "field") { setErrors((e) => ({ ...e, [r.scope]: { ...e[r.scope], [r.key]: r.message } })); setFocusTick((t) => t + 1); }
      else { setFormError({ message: r.message }); setFocusTick((t) => t + 1); }
    } finally { setBusy(false); }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="stack" aria-label={`Register for ${event.title}`}>
      {formError && (
        <div ref={bannerRef} tabIndex={-1} className="alert alert-bad" role="alert">
          <Icon name="alert" />
          <div>{formError.message}{formError.duplicate && <> You can find that registration under <Link to="/my-registrations">My registrations</Link> if it was made on this device.</>}</div>
        </div>
      )}
      <Card>
        <h2>Your details</h2>
        <div className="form-grid">
          <Field label="Full name" required error={errors.identity.name}>{(p) => <Input {...p} name="name" autoComplete="name" maxLength={120} value={identity.name} onChange={(e) => setId("name")(e.target.value)} />}</Field>
          <Field label="Email" required error={errors.identity.email} hint="Your registration is tied to this address; one registration per email.">{(p) => <Input {...p} name="email" type="email" autoComplete="email" maxLength={254} value={identity.email} onChange={(e) => setId("email")(e.target.value)} />}</Field>
        </div>
      </Card>
      {schema.length > 0 && (
        <Card>
          <h2>Event details</h2>
          <div className="form-grid">
            {schema.map((f) => (
              <div key={f.key} className={f.type === "textarea" ? "span-all" : undefined}>
                <Field label={f.label} required={f.required} error={errors.answers[f.key]}>
                  {(p) => <Control field={f} id={p.id} aria={{ "aria-describedby": p["aria-describedby"], "aria-invalid": p["aria-invalid"], "aria-required": p["aria-required"] }} value={answers[f.key]} onChange={setAns(f.key)} />}
                </Field>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="row">
        <Button type="submit" disabled={busy}>{busy ? "Registering…" : event.auto_confirm ? "Register" : "Request a seat"}{!busy && <Icon name="arrow" />}</Button>
        <Button variant="ghost" to={`/events/${event.id}`} disabled={busy}>Cancel</Button>
      </div>
      <p className="muted small">{event.auto_confirm ? "Your place is confirmed straight away and your pass appears on the next page." : "The organizers approve each request. Your pass appears here once you're approved."}</p>
    </form>
  );
}

export default function RegisterPage({ id }) {
  const event = useApi((signal) => api.event(id, { signal }), [id]);
  usePageTitle(event.data ? `Register: ${event.data.title}` : "Register");
  return (
    <PageContainer>
      <Async state={event} label="Loading event…">
        {(e) => (
          <>
            <PageHead title={`Register: ${e.title}`} crumbs={[{ label: "Events", to: "/events" }, { label: e.title, to: `/events/${e.id}` }, { label: "Register" }]} />
            <div className="detail-grid">
              <div>{e.registration_state === "open" ? <RegisterForm key={e.id} event={e} reloadEvent={event.reload} /> : <Unavailable event={e} />}</div>
              <aside className="detail-aside">
                <Card>
                  <div className="row"><StateBadge state={e.registration_state} />{e.category && <span className="muted small">{e.category}</span>}</div>
                  <h2 className="spaced-top">{e.title}</h2>
                  <dl className="facts">
                    <div><dt>Date</dt><dd>{formatDate(e.starts_at)} at {formatTime(e.starts_at)}</dd></div>
                    {e.venue && <div><dt>Venue</dt><dd>{e.venue}</dd></div>}
                    <div><dt>Seats</dt><dd>{e.remaining} left of {e.capacity}</dd></div>
                    {e.deadline && <div><dt>Register by</dt><dd>{formatDateTime(e.deadline)}</dd></div>}
                  </dl>
                </Card>
              </aside>
            </div>
          </>
        )}
      </Async>
    </PageContainer>
  );
}
