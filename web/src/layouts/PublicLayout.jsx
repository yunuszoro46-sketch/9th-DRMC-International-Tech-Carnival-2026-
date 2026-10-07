import { useEffect, useState } from "react";
import { useRouter } from "../router.jsx";
import Icon from "../components/common/Icon.jsx";
import Modal from "../components/common/Modal.jsx";
import NavLink from "./NavLink.jsx";
import Brand from "../components/brand/Brand.jsx";
import SiteFooter from "./SiteFooter.jsx";
import { PUBLIC_NAV as LINKS } from "../lib/nav.js";
import AssistantWidget from "../components/assistant/AssistantWidget.jsx";

export default function PublicLayout({ children }) {
  const { path } = useRouter();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);       // navigating closes the drawer
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="container">
          <Brand to="/" />
          <nav className="nav" aria-label="Main">
            {LINKS.map((l) => <NavLink key={l.to} to={l.to}>{l.label}</NavLink>)}
            <NavLink to="/organizer/login">Organizer</NavLink>
          </nav>
          <button type="button" className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Open menu" aria-haspopup="dialog"><Icon name="menu" /></button>
        </div>
      </header>
      {/* The mobile menu only exists in the DOM while open, so nothing hidden can take keyboard focus. */}
      <Modal open={menu} onClose={() => setMenu(false)} title="Menu" variant="drawer">
        <nav className="drawer-nav" aria-label="Mobile">
          <NavLink to="/" icon="dashboard" end>Home</NavLink>
          {LINKS.map((l) => <NavLink key={l.to} to={l.to} icon={l.icon}>{l.label}</NavLink>)}
          <hr />
          <NavLink to="/organizer/login" icon="scan">Organizer sign in</NavLink>
        </nav>
      </Modal>
      <main id="main" tabIndex={-1}>{children}</main>
      <AssistantWidget />
      <SiteFooter />
    </>
  );
}
