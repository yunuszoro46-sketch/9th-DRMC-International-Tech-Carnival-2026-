import { Link, useRouter } from "../../router.jsx";
import Button from "../common/Button.jsx";
import Icon from "../common/Icon.jsx";
// Section navigation shared by the events and fests lists: fests contain events, so they are managed side by side.
export default function EventsTabs({ children }) {
  const { path } = useRouter();
  const tab = (to, label) => <Link to={to} aria-current={path === to ? "page" : undefined}>{label}</Link>;
  return (
    <div className="org-intro">
      <nav className="org-tabs" aria-label="Events and fests">{tab("/organizer/events", "All events")}{tab("/organizer/fests", "Fests")}</nav>
      <div className="row">{children}<Button size="sm" to="/organizer/events/new"><Icon name="plus" /> Create event</Button></div>
    </div>
  );
}
