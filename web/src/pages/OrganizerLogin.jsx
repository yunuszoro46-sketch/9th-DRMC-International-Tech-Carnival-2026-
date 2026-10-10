import { useState } from "react";
import { api } from "../lib/api.js";
import { organizerToken } from "../lib/storage.js";
import { Link, Navigate, useNavigate, usePageTitle, useSearchParams } from "../router.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { Field, Input } from "../components/common/Field.jsx";
import Brand from "../components/brand/Brand.jsx";

// Only same-site paths under /organizer are accepted as a post-login destination (no open redirect).
const safeNext = (n) => (n && /^\/organizer(\/[\w-]*)*$/.test(n) ? n : "/organizer");

export default function OrganizerLogin() {
  usePageTitle("Organizer sign in");
  const navigate = useNavigate(), [params] = useSearchParams();
  const [key, setKey] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (organizerToken.get()) return <Navigate to={safeNext(params.get("next"))} />;
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!key.trim()) { setError("Enter the organizer key."); return; }
    setBusy(true); setError("");
    try {
      const { token } = await api.admin.login(key.trim());      // the server checks the key and issues a session JWT
      organizerToken.set(token);                                // the key itself is never stored
      navigate(safeNext(params.get("next")), { replace: true });
    } catch (err) {
      setError(err.status === 401 ? "That organizer key wasn't accepted. Check it and try again." : err.message);
      setBusy(false);
    }
  }
  return (
    <main className="login-wrap" id="main">
      <div className="card login-card page-enter">
        <h1 className="sr-only">Organizer sign in</h1>
        <Brand className="spaced-bottom" title="DRMC IT CLUB" sub="Organizer sign in" />
        {params.get("expired") && !error && <div className="alert alert-warn spaced-bottom" role="alert"><Icon name="alert" /><div>Your organizer session has expired. Please sign in again.</div></div>}
        <form onSubmit={submit} noValidate className="stack">
          <Field label="Organizer key" required hint="Ask the club administrator if you don't have it.">
            {(a) => <Input {...a} type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />}
          </Field>
          {error && <div className="alert alert-bad" role="alert"><Icon name="alert" /><div>{error}</div></div>}
          <Button type="submit" block disabled={busy}>{busy ? "Checking…" : "Sign in"}</Button>
        </form>
        <p className="muted small spaced-top flush"><Link to="/">← Back to the site</Link></p>
      </div>
    </main>
  );
}
