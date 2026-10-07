import { Link, useRouter } from "../router.jsx";
import Icon from "../components/common/Icon.jsx";
// Marks the current section with aria-current so it is announced as well as highlighted.
export default function NavLink({ to, icon, end = false, children }) {
  const { path } = useRouter();
  const active = end ? path === to : path === to || path.startsWith(to + "/");
  return <Link to={to} aria-current={active ? "page" : undefined}>{icon && <Icon name={icon} />}{children}</Link>;
}
