import { Link } from "../../router.jsx";
// <Button> renders a <button>; give it `to` to get a router link styled the same way; `href` for a plain external link.
export default function Button({ variant = "primary", size, block, to, href, className = "", children, type = "button", ...rest }) {
  const cls = `btn btn-${variant}${size ? ` btn-${size}` : ""}${block ? " btn-block" : ""} ${className}`.trim();
  if (to) return <Link to={to} className={cls} {...rest}>{children}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{children}</a>;
  return <button type={type} className={cls} {...rest}>{children}</button>;
}
