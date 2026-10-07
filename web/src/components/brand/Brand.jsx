import { Link } from "../../router.jsx";
import ditc from "../../assets/ditc.png";
import crest from "../../assets/crest.png";

// Brand hierarchy, in one place.
//   Primary: the DRMC IT Club mark ("DITC, Live with Tech"). Header, hero, organizer shell, sign-in, entry pass.
//   Secondary: the college crest. Only inside <Institution>, small, in the footer.
// Both are the club's own image files, shown as they are: never redrawn, recoloured or cropped.
const SIZES = { sm: [53, 32], md: [66, 40], lg: [118, 72] };          // the artwork is 231 x 141; these keep its proportions

export function ClubLogo({ size = "md", alt = "", className = "" }) {
  const [w, h] = SIZES[size] || SIZES.md;
  return <img src={ditc} alt={alt} width={w} height={h} decoding="async" className={`club-logo club-logo-${size} ${className}`.trim()} />;
}

// Logo + name. With `to` it is the home link; without, a plain heading block (sign-in card).
export default function Brand({ to, title = "DRMC IT CLUB", sub = "Smart Club Operations", className = "" }) {
  const inner = <><ClubLogo /><span className="brand-text">{title}<small>{sub}</small></span></>;
  return to ? <Link to={to} className={`brand ${className}`.trim()}>{inner}</Link> : <div className={`brand ${className}`.trim()}>{inner}</div>;
}

// The college the club belongs to: an affiliation line, deliberately quieter than the club's own brand.
export function Institution() {
  return (
    <div className="institution">
      <img src={crest} alt="Crest of Dhaka Residential Model College" width="32" height="35" loading="lazy" decoding="async" />
      <p><span>The IT club of</span><strong>Dhaka Residential Model College</strong></p>
    </div>
  );
}
