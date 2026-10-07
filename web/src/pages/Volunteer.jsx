import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { usePageTitle } from "../router.jsx";
import { DOMAINS, EMPTY, WHY_MAX, WHY_MIN, validateVolunteer, volunteerPayload } from "../lib/volunteer.js";
import PageContainer from "../components/common/PageContainer.jsx";
import TechHero from "../components/visual/TechHero.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { Field, Input, Select, Textarea } from "../components/common/Field.jsx";

const FIELD_NAMES = ["name", "cls", "roll", "phone", "email", "domain", "why"];

function Confirmation({ data }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="glass-panel success-panel" ref={ref} tabIndex={-1} role="status" aria-live="polite">
      <span className="icon-tile icon-tile-lg" aria-hidden="true"><Icon name="check" /></span>
      <h2>Application received</h2>
      <p className="lead-sm">Thanks, {data.name.split(" ")[0]}. The club team will read your application and get in touch using the email or number you gave.</p>
      <dl className="facts facts-2 success-facts">
        <div><dt>Area of interest</dt><dd>{data.domain}</dd></div>
        <div><dt>We'll contact you at</dt><dd>{data.email}</dd></div>
      </dl>
      <p className="muted small">Each email can apply once, so there's no need to submit again.</p>
      <div className="row center-row"><Button to="/events">See upcoming events</Button><Button variant="secondary" to="/">Back to home</Button></div>
    </div>
  );
}

export default function Volunteer() {
  usePageTitle("Volunteer");
  const [v, setV] = useState(EMPTY), [errors, setErrors] = useState({}), [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false), [done, setDone] = useState(null), [tick, setTick] = useState(0);
  const formRef = useRef(null), bannerRef = useRef(null);
  useEffect(() => { if (tick) (formRef.current?.querySelector('[aria-invalid="true"]') || bannerRef.current)?.focus(); }, [tick]);

  const set = (k) => (e) => { const val = e.target.value; setV((s) => ({ ...s, [k]: val })); if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined })); };
  async function submit(ev) {
    ev.preventDefault();
    if (busy) return;
    setFormError(null);
    const found = validateVolunteer(v); setErrors(found);
    if (Object.keys(found).length) { setTick((t) => t + 1); return; }
    setBusy(true);
    try { await api.volunteer(volunteerPayload(v)); setDone({ name: v.name.trim(), email: v.email.trim().toLowerCase(), domain: v.domain }); window.scrollTo(0, 0); }
    catch (err) {
      if (err.code === "duplicate_application") setErrors((x) => ({ ...x, email: err.message }));
      else if (err.status === 400 && FIELD_NAMES.includes(err.field)) setErrors((x) => ({ ...x, [err.field]: err.message }));
      else setFormError(err.message);
      setTick((t) => t + 1);
    } finally { setBusy(false); }
  }
  const whyLen = v.why.trim().length;

  return (
    <PageContainer>
      <TechHero pill="Call for volunteers" title="Join the team behind the events" lead="Help run the club's events and projects. Tell us where your interest lies and we'll find you a place on the team.">
        <div className="row"><a href="#apply" className="btn btn-primary" onClick={(e) => { e.preventDefault(); document.getElementById("apply")?.scrollIntoView(); formRef.current?.querySelector("input")?.focus({ preventScroll: true }); }}>Apply now <Icon name="arrow" /></a></div>
      </TechHero>

      <div className="info-grid">
        <section className="glass-panel info-card" aria-labelledby="dom-h">
          <span className="icon-tile" aria-hidden="true"><Icon name="chip" /></span>
          <div><h2 id="dom-h">Areas of interest</h2>
            <ul className="dot-list">{DOMAINS.map((d) => <li key={d}>{d}</li>)}</ul></div>
        </section>
        <section className="glass-panel info-card" aria-labelledby="how-h">
          <span className="icon-tile" aria-hidden="true"><Icon name="send" /></span>
          <div><h2 id="how-h">How it works</h2>
            <ol className="plain-steps"><li>Send the short form below.</li><li>The club team reviews applications.</li><li>You hear back by email or phone.</li></ol></div>
        </section>
        <section className="glass-panel info-card" aria-labelledby="who-h">
          <span className="icon-tile" aria-hidden="true"><Icon name="cap" /></span>
          <div><h2 id="who-h">Who can apply</h2><p className="flush">Students of the college. Give your class and roll so we know who you are.</p></div>
        </section>
      </div>

      <section id="apply" className="apply-section" aria-labelledby="apply-h">
        {done ? <Confirmation data={done} /> : (
          <form ref={formRef} onSubmit={submit} noValidate className="glass-panel apply-form" aria-labelledby="apply-h">
            <h2 id="apply-h">Application form</h2>
            <p className="muted">Fields marked * are required.</p>
            {formError && <div ref={bannerRef} tabIndex={-1} className="alert alert-bad" role="alert"><Icon name="alert" /><div>{formError}</div></div>}
            <div className="form-grid">
              <Field label="Full name" required error={errors.name}>{(p) => <Input {...p} name="name" autoComplete="name" maxLength={120} value={v.name} onChange={set("name")} />}</Field>
              <Field label="Class / section" required error={errors.cls} hint="For example: 10 Science A">{(p) => <Input {...p} name="cls" maxLength={20} value={v.cls} onChange={set("cls")} />}</Field>
              <Field label="Roll number" required error={errors.roll}>{(p) => <Input {...p} name="roll" inputMode="numeric" maxLength={8} value={v.roll} onChange={set("roll")} />}</Field>
              <Field label="Contact number" required error={errors.phone}>{(p) => <Input {...p} name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="01712-345678" value={v.phone} onChange={set("phone")} />}</Field>
              <Field label="Email" required error={errors.email}>{(p) => <Input {...p} name="email" type="email" autoComplete="email" maxLength={254} value={v.email} onChange={set("email")} />}</Field>
              <Field label="Area of interest" required error={errors.domain}>{(p) => <Select {...p} name="domain" value={v.domain} onChange={set("domain")}><option value="">Choose an area…</option>{DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}</Select>}</Field>
              <div className="span-all"><Field label="Why do you want to volunteer?" required error={errors.why} hint={`${whyLen} / ${WHY_MAX} characters (at least ${WHY_MIN})`}>{(p) => <Textarea {...p} name="why" rows={5} maxLength={WHY_MAX} value={v.why} onChange={set("why")} />}</Field></div>
            </div>
            <div className="row spaced-top"><Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send application"}{!busy && <Icon name="send" />}</Button></div>
          </form>
        )}
      </section>
    </PageContainer>
  );
}
