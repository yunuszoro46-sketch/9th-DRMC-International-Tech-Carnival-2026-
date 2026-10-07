import { useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { usePageTitle } from "../router.jsx";
import { fromSqlite, formatDateTime } from "../lib/dates.js";
import { plural } from "../lib/format.js";
import { DOMAINS } from "../lib/volunteer.js";
import Icon from "../components/common/Icon.jsx";
import Badge from "../components/common/Badge.jsx";
import { Async, EmptyState } from "../components/common/States.jsx";
import { Field, Input, Select } from "../components/common/Field.jsx";

// Organizer view of GET /api/admin/volunteers (newest first, up to 500). The organizer guard lives in OrganizerLayout.
export default function OrganizerVolunteers() {
  usePageTitle("Volunteers");
  const list = useApi((signal) => api.admin.volunteers({ signal }));
  const [q, setQ] = useState(""), [domain, setDomain] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list.data || []).filter((v) => (!domain || v.domain === domain) && (!s || [v.name, v.email, v.roll, v.cls, v.phone].some((x) => String(x).toLowerCase().includes(s))));
  }, [list.data, q, domain]);
  return (
    <div className="stack">
      <div className="filter-bar glass">
        <form className="filter-grid filter-grid-2" role="search" onSubmit={(e) => e.preventDefault()}>
          <Field label="Search applicants" hint="Name, email, roll, class or phone">{(p) => <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
          <Field label="Area of interest">{(p) => <Select {...p} value={domain} onChange={(e) => setDomain(e.target.value)}><option value="">All areas</option>{DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}</Select>}</Field>
        </form>
      </div>
      <Async state={list} label="Loading volunteer applications…" isEmpty={(d) => d.length === 0}
        empty={<EmptyState icon="users" title="No applications yet" message="Applications sent from the public Volunteer page will show up here." />}>
        {(d) => (
          <>
            <p className="muted small" role="status" aria-live="polite">{rows.length === d.length ? plural(d.length, "application") : `${rows.length} of ${plural(d.length, "application")}`}</p>
            {rows.length === 0 ? <EmptyState icon="search" title="No applicants match" message="Try a different search or area." /> : (
              <div className="table-wrap">
                <table className="table table-stack">
                  <thead><tr><th scope="col">Applicant</th><th scope="col">Area</th><th scope="col">Contact</th><th scope="col">Applied</th><th scope="col">Statement</th></tr></thead>
                  <tbody>
                    {rows.map((v) => (
                      <tr key={v.id}>
                        <td data-label="Applicant"><strong>{v.name}</strong><div className="muted small">Class {v.cls} · Roll {v.roll}</div></td>
                        <td data-label="Area"><Badge tone="info">{v.domain}</Badge></td>
                        <td data-label="Contact"><div><a href={`mailto:${v.email}`}><Icon name="mail" /> {v.email}</a></div><div><a href={`tel:${v.phone.replace(/[^\d+]/g, "")}`}><Icon name="phone" /> {v.phone}</a></div></td>
                        <td data-label="Applied" className="nowrap-md">{formatDateTime(fromSqlite(v.created_at))}</td>
                        <td data-label="Statement"><details><summary>Read statement</summary><p className="pre-line statement">{v.why}</p></details></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Async>
    </div>
  );
}
