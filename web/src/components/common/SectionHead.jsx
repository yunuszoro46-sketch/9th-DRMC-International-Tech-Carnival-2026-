// A section's heading with an optional action on the right ("All events"). One markup for every public section.
export default function SectionHead({ id, title, action, as: H = "h2" }) {
  return <div className="section-head section-head-bar"><H id={id}>{title}</H>{action}</div>;
}
