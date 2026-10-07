import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { Link, useNavigate, useSearchParams, usePageTitle } from "../router.jsx";
import { FEST_FIELDS, emptyFest, festPayload, festToForm, validateFest } from "../lib/eventAdmin.js";
import Card from "../components/common/Card.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { Async } from "../components/common/States.jsx";
import { Field, Input, Select, Textarea } from "../components/common/Field.jsx";
import { useToast } from "../components/common/Toast.jsx";

function Form({ fest, initial, clubs }) {
  const navigate = useNavigate(), toast = useToast();
  const [v, setV] = useState(initial), [errors, setErrors] = useState({}), [formError, setFormError] = useState(null), [busy, setBusy] = useState(false), [tick, setTick] = useState(0);
  const formRef = useRef(null), bannerRef = useRef(null);
  useEffect(() => { if (tick) (formRef.current?.querySelector('[aria-invalid="true"]') || bannerRef.current)?.focus(); }, [tick]);
  const set = (k) => (e) => { const val = e.target.value; setV((s) => ({ ...s, [k]: val })); if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined })); };
  const back = fest ? `/organizer/fests/${fest.id}` : "/organizer/fests";

  async function submit(ev) {
    ev.preventDefault();
    if (busy) return;
    setFormError(null);
    const found = validateFest(v); setErrors(found);
    if (Object.keys(found).length) { setTick((n) => n + 1); return; }
    setBusy(true);
    try {
      const saved = fest ? await api.admin.updateFest(fest.id, festPayload(v)) : await api.admin.createFest(festPayload(v));
      toast.success(fest ? "Fest updated successfully." : "Fest created.");
      navigate(`/organizer/fests/${saved.id}`);
    } catch (err) {
      if (err?.status === 401) return;                                   // the layout is already sending the organizer to sign in
      if (err.field && FEST_FIELDS.includes(err.field)) setErrors((x) => ({ ...x, [err.field]: err.message })); else setFormError(err.message);
      setTick((n) => n + 1); setBusy(false);
    }
  }
  return (
    <form ref={formRef} onSubmit={submit} noValidate className="org-form" aria-label={fest ? `Edit ${fest.name}` : "Create fest"}>
      {formError && <div ref={bannerRef} tabIndex={-1} className="alert alert-bad" role="alert"><Icon name="alert" /><div>{formError}</div></div>}
      <Card>
        <h2>Fest details</h2>
        <div className="form-grid">
          <Field label="Club" required error={errors.club_id}>{(p) => <Select {...p} name="club_id" value={v.club_id} onChange={set("club_id")}><option value="">Choose a club…</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
          <Field label="Fest name" required error={errors.name}>{(p) => <Input {...p} name="name" maxLength={120} value={v.name} onChange={set("name")} />}</Field>
          <Field label="First day" required error={errors.starts_on}>{(p) => <Input {...p} name="starts_on" type="date" value={v.starts_on} onChange={set("starts_on")} />}</Field>
          <Field label="Last day" required error={errors.ends_on} hint="Same as the first day for a one-day fest.">{(p) => <Input {...p} name="ends_on" type="date" min={v.starts_on || undefined} value={v.ends_on} onChange={set("ends_on")} />}</Field>
          <div className="span-all"><Field label="Venue" required error={errors.venue}>{(p) => <Input {...p} name="venue" maxLength={120} value={v.venue} onChange={set("venue")} />}</Field></div>
          <div className="span-all"><Field label="Description" error={errors.description} hint={`${v.description.trim().length} / 500 characters. Shown on the public fest page.`}>{(p) => <Textarea {...p} name="description" rows={3} maxLength={500} value={v.description} onChange={set("description")} />}</Field></div>
        </div>
      </Card>
      <div className="row form-actions">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : fest ? "Save changes" : "Create fest"}</Button>
        <Button variant="ghost" to={back} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}

// Create (POST /api/admin/fests) or edit (PATCH /api/admin/fests/:id). Editing always starts from a fresh read of the fest.
export default function OrganizerFestForm({ id }) {
  const editing = id != null;
  const [params] = useSearchParams();
  const fest = useApi((signal) => api.admin.fest(id, { signal }), [id], { enabled: editing });
  const clubs = useApi((signal) => api.clubs({ signal }));
  usePageTitle(editing ? (fest.data ? `Edit ${fest.data.name}` : "Edit fest") : "Create fest");
  const both = editing ? { ...fest, data: fest.data && clubs.data ? { fest: fest.data, clubs: clubs.data } : undefined, loading: fest.loading || clubs.loading, error: fest.error || clubs.error, reload: () => { fest.reload(); clubs.reload(); } }
    : { ...clubs, data: clubs.data ? { clubs: clubs.data } : undefined };
  return (
    <div className="org-page org-page-narrow">
      <div className="org-intro"><Link to={editing ? `/organizer/fests/${id}` : "/organizer/fests"} className="back-link"><Icon name="chevL" /> {editing ? "Back to the fest" : "Back to fests"}</Link></div>
      <Async state={both} label="Loading…">
        {(d) => <>
          <header><h2 className="org-title">{d.fest ? `Edit ${d.fest.name}` : "Create fest"}</h2>{d.fest?.archived && <p className="muted flush">This fest is archived. You can still correct its details.</p>}</header>
          <Form key={d.fest ? d.fest.id : "new"} fest={d.fest} clubs={d.clubs} initial={d.fest ? festToForm(d.fest) : emptyFest(params.get("club"))} />
        </>}
      </Async>
    </div>
  );
}
