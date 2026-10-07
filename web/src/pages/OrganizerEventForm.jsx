import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { Link, useNavigate, useSearchParams, usePageTitle } from "../router.jsx";
import { EVENT_FIELDS, emptyEvent, eventPayload, eventToForm, validateEvent } from "../lib/eventAdmin.js";
import Card from "../components/common/Card.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { Async, EmptyState } from "../components/common/States.jsx";
import { Field, Input, Select, Textarea } from "../components/common/Field.jsx";
import { useToast } from "../components/common/Toast.jsx";
import FormSchemaEditor from "../components/organizer/FormSchemaEditor.jsx";

function Form({ event, initial, fests }) {
  const navigate = useNavigate(), toast = useToast();
  const [v, setV] = useState(initial), [errors, setErrors] = useState({}), [schemaErrors, setSchemaErrors] = useState({});
  const [formError, setFormError] = useState(null), [busy, setBusy] = useState(false), [tick, setTick] = useState(0);
  const formRef = useRef(null), bannerRef = useRef(null);
  useEffect(() => { if (tick) (formRef.current?.querySelector('[aria-invalid="true"]') || formRef.current?.querySelector("#schema-error") || bannerRef.current)?.focus(); }, [tick]);
  const put = (k, val) => { setV((s) => ({ ...s, [k]: val })); if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined })); };
  const set = (k) => (e) => put(k, e.target.value);
  const back = event ? `/organizer/events/${event.id}` : "/organizer/events";
  // Fests an event can be filed under: archived fests are refused by the server, except the one the event is already in.
  const groups = new Map();
  for (const f of fests) { if (f.archived && String(f.id) !== initial.fest_id) continue; if (!groups.has(f.club_name)) groups.set(f.club_name, []); groups.get(f.club_name).push(f); }

  async function submit(ev) {
    ev.preventDefault();
    if (busy) return;
    setFormError(null);
    const found = validateEvent(v); setErrors(found.errors); setSchemaErrors(found.schema);
    if (Object.keys(found.errors).length) { setTick((n) => n + 1); return; }
    setBusy(true);
    try {
      const saved = event ? await api.admin.updateEvent(event.id, eventPayload(v)) : await api.admin.createEvent(eventPayload(v));
      toast.success(event ? "Event updated successfully." : "Event created.");
      navigate(`/organizer/events/${saved.id}`);
    } catch (err) {
      if (err?.status === 401) return;                                   // the layout is already sending the organizer to sign in
      if (err.field && EVENT_FIELDS.includes(err.field)) setErrors((x) => ({ ...x, [err.field]: err.message })); else setFormError(err.message);
      setTick((n) => n + 1); setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="org-form" aria-label={event ? `Edit ${event.title}` : "Create event"}>
      {formError && <div ref={bannerRef} tabIndex={-1} className="alert alert-bad" role="alert"><Icon name="alert" /><div>{formError}</div></div>}
      <Card>
        <h2>Event details</h2>
        <div className="form-grid">
          <Field label="Fest" required error={errors.fest_id} hint="The club comes from the fest.">{(p) => (
            <Select {...p} name="fest_id" value={v.fest_id} onChange={set("fest_id")}>
              <option value="">Choose a fest…</option>
              {[...groups.entries()].map(([club, items]) => <optgroup key={club} label={club}>{items.map((f) => <option key={f.id} value={f.id}>{f.name}{f.archived ? " (archived)" : ""}</option>)}</optgroup>)}
            </Select>
          )}</Field>
          <Field label="Title" required error={errors.title}>{(p) => <Input {...p} name="title" maxLength={120} value={v.title} onChange={set("title")} />}</Field>
          <Field label="Category" error={errors.category} hint="For example Coding, Workshop or Quiz. Left empty, it is saved as General.">{(p) => <Input {...p} name="category" maxLength={40} value={v.category} onChange={set("category")} />}</Field>
          <Field label="Venue" required error={errors.venue}>{(p) => <Input {...p} name="venue" maxLength={120} value={v.venue} onChange={set("venue")} />}</Field>
          <div className="span-all"><Field label="Description" error={errors.description} hint={`${v.description.trim().length} / 1000 characters`}>{(p) => <Textarea {...p} name="description" rows={3} maxLength={1000} value={v.description} onChange={set("description")} />}</Field></div>
          <div className="span-all"><Field label="Rules and information" error={errors.rules} hint={`${v.rules.trim().length} / 2000 characters. Line breaks are kept.`}>{(p) => <Textarea {...p} name="rules" rows={4} maxLength={2000} value={v.rules} onChange={set("rules")} />}</Field></div>
        </div>
      </Card>

      <Card>
        <h2>Schedule and registration</h2>
        <div className="form-grid">
          <Field label="Starts" required error={errors.starts_at} hint="Dhaka time. The event counts as ended from this moment.">{(p) => <Input {...p} name="starts_at" type="datetime-local" value={v.starts_at} onChange={set("starts_at")} />}</Field>
          <Field label="Registration closes" required error={errors.deadline} hint="Dhaka time. At or before the start.">{(p) => <Input {...p} name="deadline" type="datetime-local" max={v.starts_at || undefined} value={v.deadline} onChange={set("deadline")} />}</Field>
          <Field label="Capacity (seats)" required error={errors.capacity} hint={event ? `${event.taken} taken now. Capacity can't go below that.` : "Pending, confirmed and checked-in registrations each hold a seat."}>{(p) => <Input {...p} name="capacity" type="number" inputMode="numeric" min={1} max={10000} step={1} value={v.capacity} onChange={set("capacity")} />}</Field>
          <Field label="How registrations are accepted" hint="Changing this only affects new registrations.">{(p) => (
            <Select {...p} name="auto_confirm" value={v.auto_confirm ? "auto" : "manual"} onChange={(e) => put("auto_confirm", e.target.value === "auto")}>
              <option value="auto">Confirm instantly</option>
              <option value="manual">Organizer approves each request</option>
            </Select>
          )}</Field>
        </div>
      </Card>

      <Card>
        <h2>Registration form</h2>
        <FormSchemaEditor fields={v.form_schema} onChange={(next) => put("form_schema", next)} errors={schemaErrors} summary={errors.form_schema} locked={!!event && event.taken > 0} />
      </Card>

      <div className="row form-actions">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : event ? "Save changes" : "Create event"}</Button>
        <Button variant="ghost" to={back} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}

// Create (POST /api/admin/events) or edit (PATCH /api/admin/events/:id). Editing always starts from a fresh read of the
// event, never from a list row. `?fest=<id>` preselects the fest when coming from a fest page.
export default function OrganizerEventForm({ id }) {
  const editing = id != null;
  const [params] = useSearchParams();
  const event = useApi((signal) => api.admin.event(id, { signal }), [id], { enabled: editing });
  const fests = useApi((signal) => api.admin.fests({ signal }));
  usePageTitle(editing ? (event.data ? `Edit ${event.data.title}` : "Edit event") : "Create event");
  const ready = fests.data && (!editing || event.data);
  const state = { data: ready ? { fests: fests.data, event: event.data } : undefined, loading: fests.loading || (editing && event.loading), error: (editing && event.error) || fests.error, reload: () => { fests.reload(); if (editing) event.reload(); } };
  const presetFest = /^\d+$/.test(params.get("fest") || "") ? params.get("fest") : "";
  return (
    <div className="org-page org-page-narrow">
      <div className="org-intro"><Link to={editing ? `/organizer/events/${id}` : "/organizer/events"} className="back-link"><Icon name="chevL" /> {editing ? "Back to the event" : "Back to events"}</Link></div>
      <Async state={state} label="Loading…">
        {(d) => (!d.event && d.fests.every((f) => f.archived)
          ? <EmptyState icon="ticket" title="Create a fest first" message="Every event belongs to a fest, and there is no active fest yet." action={<Button to="/organizer/fests/new"><Icon name="plus" /> Create fest</Button>} />
          : <>
            <header><h2 className="org-title">{d.event ? `Edit ${d.event.title}` : "Create event"}</h2>
              <p className="muted flush">{d.event ? "Changes are checked by the server when you save." : "Set the details, the schedule and what participants are asked when they register."}</p></header>
            <Form key={d.event ? d.event.id : "new"} event={d.event} fests={d.fests} initial={d.event ? eventToForm(d.event) : emptyEvent(d.fests.some((f) => String(f.id) === presetFest && !f.archived) ? presetFest : "")} />
          </>)}
      </Async>
    </div>
  );
}
