import { useId } from "react";
import { FIELD_TYPES } from "../../lib/format.js";
import { MAX_FIELDS, keyFromLabel, newField } from "../../lib/eventAdmin.js";
import { Field, Input, Select, Textarea } from "../common/Field.jsx";
import Button from "../common/Button.jsx";
import Icon from "../common/Icon.jsx";
import { Control } from "../../pages/RegisterPage.jsx";

// Builder for an event's registration form. It edits the backend's own form_schema shape ({ key, label, type, required,
// options }) and nothing else, so what is saved here is exactly what the public registration page renders.
// `fields` carry two editor-only extras that are never sent: `uid` (stable row id) and `saved` (already on the server).
export default function FormSchemaEditor({ fields, onChange, errors = {}, summary, locked }) {
  const hid = useId();
  const patch = (uid, change) => onChange(fields.map((f) => (f.uid === uid ? { ...f, ...change } : f)));
  const setLabel = (f, label) => patch(f.uid, f.autoKey ? { label, key: keyFromLabel(label, fields.filter((x) => x.uid !== f.uid).map((x) => x.key)) } : { label });
  const move = (i, d) => { const next = [...fields]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); };
  const remove = (uid) => onChange(fields.filter((f) => f.uid !== uid));
  const add = () => onChange([...fields, newField(fields.map((f) => f.key))]);

  return (
    <div className="schema">
      <p className="muted flush">Every registration asks for <strong>full name</strong> and <strong>email</strong>. Add up to {MAX_FIELDS} more questions for this event.</p>
      {locked && <div className="alert alert-info" role="note"><Icon name="info" /><div>People have already registered, so the form can only grow: existing questions can't be removed, change type, lose options or become required, and new questions must be optional. The server checks this when you save.</div></div>}
      {summary && <div id="schema-error" tabIndex={-1} className="alert alert-bad" role="alert"><Icon name="alert" /><div>{summary}</div></div>}
      {fields.length === 0 && <p className="schema-empty muted">No extra questions yet. Participants will only be asked for their name and email.</p>}
      <ol className="schema-list" aria-label="Questions">
        {fields.map((f, i) => {
          const e = errors[f.uid] || {}, n = i + 1;
          return (
            <li key={f.uid} className="schema-field">
              <div className="schema-head">
                <span className="schema-n">Question {n}</span>
                <div className="row schema-tools">
                  <button type="button" className="icon-btn icon-btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move question ${n} up`}><Icon name="chevU" /></button>
                  <button type="button" className="icon-btn icon-btn-sm" onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label={`Move question ${n} down`}><Icon name="chevD" /></button>
                  <button type="button" className="icon-btn icon-btn-sm icon-btn-danger" onClick={() => remove(f.uid)} aria-label={`Remove question ${n}${f.label ? `: ${f.label}` : ""}`}><Icon name="trash" /></button>
                </div>
              </div>
              <div className="form-grid">
                <Field label="Question" required error={e.label}>{(p) => <Input {...p} maxLength={60} value={f.label} onChange={(ev) => setLabel(f, ev.target.value)} placeholder="For example: Team name" />}</Field>
                <Field label="Answer type">{(p) => <Select {...p} value={f.type} onChange={(ev) => patch(f.uid, { type: ev.target.value })}>{FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>}</Field>
                {f.type === "select" && (
                  <div className="span-all"><Field label="Choices" required error={e.options} hint="One per line, 20 at most.">{(p) => <Textarea {...p} rows={3} value={f.options} onChange={(ev) => patch(f.uid, { options: ev.target.value })} />}</Field></div>
                )}
                <Field label="Field key" error={e.key} hint={f.saved ? "Answers are stored under this key, so it can't change." : "Used in exports. Filled in from the question; change it only if you need to."}>
                  {(p) => <Input {...p} className="mono" maxLength={24} value={f.key} readOnly={f.saved} spellCheck="false" autoCapitalize="none" onChange={(ev) => patch(f.uid, { key: ev.target.value, autoKey: false })} />}
                </Field>
                <label className="check-row schema-required"><input type="checkbox" checked={f.required} onChange={(ev) => patch(f.uid, { required: ev.target.checked })} /><span>Required: participants must answer</span></label>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="row">
        <Button variant="secondary" size="sm" onClick={add} disabled={fields.length >= MAX_FIELDS}><Icon name="plus" /> Add question</Button>
        {fields.length >= MAX_FIELDS && <span className="muted small">The form is at its limit of {MAX_FIELDS} questions.</span>}
      </div>

      <section className="schema-preview" aria-labelledby={hid}>
        <h3 id={hid}>Preview: what participants will see</h3>
        <fieldset disabled>
          <legend className="sr-only">Preview only, these fields can't be filled in here</legend>
          <div className="form-grid">
            <Field label="Full name" required>{(p) => <Input {...p} />}</Field>
            <Field label="Email" required>{(p) => <Input {...p} type="email" />}</Field>
            {fields.map((f) => (
              <div key={f.uid} className={f.type === "textarea" ? "span-all" : undefined}>
                <Field label={f.label.trim() || "Untitled question"} required={f.required}>
                  {(p) => <Control field={{ ...f, options: String(f.options || "").split("\n").map((s) => s.trim()).filter(Boolean) }} id={p.id} value="" onChange={() => {}} aria={{}} />}
                </Field>
              </div>
            ))}
          </div>
        </fieldset>
      </section>
    </div>
  );
}
