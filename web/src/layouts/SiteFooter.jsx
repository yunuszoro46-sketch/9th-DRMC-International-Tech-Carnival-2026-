import { Link } from "../router.jsx";
import { PUBLIC_NAV as LINKS } from "../lib/nav.js";
import { ClubLogo, Institution } from "../components/brand/Brand.jsx";

// Club first, college second: the club's mark and the platform name lead; the college crest sits in its own quiet block.
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <ClubLogo size="lg" />
          <p className="footer-name">DRMC IT CLUB</p>
          <p>Smart Club Operations Platform: fests, events and registrations in one place.</p>
          <p className="footer-est">Est. 2017</p>
        </div>
        <nav aria-label="Footer"><h3>Explore</h3><ul>{LINKS.map((l) => <li key={l.to}><Link to={l.to}>{l.label}</Link></li>)}</ul></nav>
        <div><h3>Contact</h3><ul><li><a href="mailto:hello@drmcitclub.org">hello@drmcitclub.org</a></li><li><a href="https://drmcitclub.org" rel="noopener noreferrer">drmcitclub.org</a></li></ul></div>
        <div className="footer-affiliation"><h3>Affiliation</h3><Institution /></div>
      </div>
    </footer>
  );
}
