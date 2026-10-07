import Icon from "./Icon.jsx";
import { REG_STATUS, FEST_STATUS, stateInfo } from "../../lib/format.js";
export default function Badge({ tone = "muted", icon, children }) {
  return <span className={`badge badge-${tone}`}>{icon && <Icon name={icon} />}{children}</span>;
}
// Thin wrappers that map backend values to labels. They only label: the backend decides which value applies.
export const StatusBadge = ({ status }) => { const s = REG_STATUS[status] || { label: status, tone: "muted" }; return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>; };
export const StateBadge = ({ state }) => { const s = stateInfo(state); return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>; };
export const FestStatusBadge = ({ status }) => { const s = FEST_STATUS[status]; return s ? <Badge tone={s.tone}>{s.label}</Badge> : null; };
