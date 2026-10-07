import { ClubLogo } from "../brand/Brand.jsx";

// Decorative only (aria-hidden): contour lines, circuit traces with nodes, and a spark, in the club's banner style.
// Pure SVG, no external files; it scales with the hero and is clipped by it.
function TechArt() {
  return (
    <svg className="tech-art" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g className="art-topo" fill="none" strokeWidth="1.2">
        <path d="M-40 380C120 330 200 420 360 380S560 300 700 360 980 430 1240 340" />
        <path d="M-40 340C100 290 220 380 360 340S580 260 710 320 990 390 1240 300" />
        <path d="M-40 300C90 250 240 340 370 300S600 220 720 280 1000 350 1240 260" />
        <path d="M-40 420C140 380 190 470 350 430S540 350 690 410 970 480 1240 390" />
        <path d="M-40 460C150 430 180 510 340 470S530 400 680 450 960 520 1240 440" />
        <path d="M120 120C220 60 330 90 380 160S330 260 230 250 60 190 120 120z" />
        <path d="M150 135C230 95 315 115 350 165S315 235 240 228 100 185 150 135z" />
        <path d="M860 90C950 40 1060 70 1100 140S1060 240 960 230 790 150 860 90z" />
        <path d="M885 110C955 78 1040 98 1070 148S1040 214 968 208 830 155 885 110z" />
      </g>
      {/* art-behind-copy: the left-hand circuit sits under the hero text, so CSS keeps it faint there. */}
      <g className="art-behind-copy">
        <g className="art-trace" fill="none" strokeWidth="1.4"><path d="M0 190h60l50-50h110" /><path d="M0 250h90l40 40h70" /><path d="M0 330h50l60 60" /></g>
        <g className="art-node"><circle cx="220" cy="140" r="4" /><circle cx="200" cy="290" r="4" /><circle cx="110" cy="390" r="4" /></g>
      </g>
      <g className="art-trace" fill="none" strokeWidth="1.4"><path d="M1200 170h-70l-60 60h-120" /><path d="M1200 260h-100l-50 50h-80" /><path d="M1200 350h-60l-60 60" /></g>
      <g className="art-node"><circle cx="950" cy="230" r="4" /><circle cx="1070" cy="310" r="4" /><circle cx="1080" cy="410" r="4" /></g>
      <g className="art-spark"><path d="M600 40v36M582 58h36" /><circle cx="600" cy="58" r="3.5" /></g>
    </svg>
  );
}

// Page-opening banner. `compact` for inner pages. Children render under the lead (buttons, notes).
export default function TechHero({ eyebrow, pill, title, lead, compact = false, logos = true, children, titleId = "hero-title" }) {
  return (
    <section className={`tech-hero${compact ? " tech-hero-compact" : ""}`} aria-labelledby={titleId}>
      <TechArt />
      {logos && <div className="tech-logos"><ClubLogo size="lg" alt="DRMC IT Club: Live with Tech" /></div>}
      <div className="tech-body">
        {pill && <p className="tech-pill">{pill}</p>}
        {eyebrow && <p className="tech-eyebrow"><span className="tech-dash" aria-hidden="true" />{eyebrow}<span className="tech-dash" aria-hidden="true" /></p>}
        <h1 id={titleId} className="tech-title">{title}</h1>
        {lead && <p className="tech-lead">{lead}</p>}
        {children}
      </div>
    </section>
  );
}
