import { Link } from "../../router.jsx";
export default function Card({ as: Tag = "div", to, className = "", children, ...rest }) {
  if (to) return <Link to={to} className={`card card-link ${className}`} {...rest}>{children}</Link>;
  return <Tag className={`card ${className}`} {...rest}>{children}</Tag>;
}
