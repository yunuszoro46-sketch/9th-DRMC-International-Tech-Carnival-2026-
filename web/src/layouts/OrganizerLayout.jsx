import { useEffect, useState } from "react";
import { Navigate, useNavigate, useRouter } from "../router.jsx";
import { AUTH_EXPIRED } from "../lib/api.js";
import { organizerKey } from "../lib/storage.js";
import Icon from "../components/common/Icon.jsx";
import Button from "../components/common/Button.jsx";
import Modal from "../components/common/Modal.jsx";
import NavLink from "./NavLink.jsx";
import Brand from "../components/brand/Brand.jsx";

export const ORG_NAV = [
  { to: "/organizer", label: "Dashboard", icon: "dashboard", end: true }, { to: "/organizer/events", label: "Events", icon: "calendar" }, { to: "/organizer/fests", label: "Fests", icon: "ticket" },
  { to: "/organizer/registrations", label: "Registrations", icon: "list" }, { to: "/organizer/volunteers", label: "Volunteers", icon: "users" },
  { to: "/organizer/check-in", label: "Check-in", icon: "scan" },
];

// Guards every organizer page. The key is only a convenience gate in the browser: the API re-checks it on every request,
// so a stale or forged key can never read or change data. An expired/rejected key (401 from any call) lands on the login page.
export default function OrganizerLayout({ title, children }) {
  const { path } = useRouter(), navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    const expired = () => { organizerKey.clear(); navigate("/organizer/login?expired=1", { replace: true }); };
    window.addEventListener(AUTH_EXPIRED, expired);
    return () => window.removeEventListener(AUTH_EXPIRED, expired);
  }, [navigate]);
  if (!organizerKey.get()) return <Navigate to={`/organizer/login?next=${encodeURIComponent(path)}`} />;
  const signOut = () => { organizerKey.clear(); navigate("/organizer/login", { replace: true }); };
  const nav = (
    <nav className="org-nav" aria-label="Organizer">
      {ORG_NAV.map((n) => <NavLink key={n.to} {...n}>{n.label}</NavLink>)}
    </nav>
  );
  return (
    <div className="org">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="org-side" aria-label="Organizer sidebar">
        <Brand to="/" title="DRMC IT CLUB" sub="Organizer" />
        {nav}
        <div className="grow" />
        <Button variant="ghost" onClick={signOut}><Icon name="logout" /> Sign out</Button>
      </aside>
      <div className="min0">
        <div className="org-bar">
          <div className="row min0">
            <button type="button" className="icon-btn org-menu-btn" onClick={() => setMenu(true)} aria-label="Open organizer menu" aria-haspopup="dialog"><Icon name="menu" /></button>
            <h1>{title}</h1>
          </div>
          <Button variant="ghost" size="sm" to="/">View site</Button>
        </div>
        <Modal open={menu} onClose={() => setMenu(false)} title="Organizer menu" variant="drawer">
          {nav}
          <hr className="rule" />
          <Button variant="ghost" block onClick={signOut}><Icon name="logout" /> Sign out</Button>
        </Modal>
        <main id="main" tabIndex={-1} className="org-main page-enter">{children}</main>
      </div>
    </div>
  );
}
