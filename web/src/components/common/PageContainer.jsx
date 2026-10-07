import { Link } from "../../router.jsx";
export default function PageContainer({ children, narrow = false }) {
  return <div className={`container page page-enter${narrow ? " narrow" : ""}`}>{children}</div>;
}
export function PageHead({ title, subtitle, crumbs, actions }) {
  return (
    <header className="page-head">
      {crumbs && <ol className="crumbs" aria-label="Breadcrumb">{crumbs.map((c, i) => <li key={i}>{c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>)}</ol>}
      <div className="row row-between">
        <div className="min0"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
        {actions && <div className="row">{actions}</div>}
      </div>
    </header>
  );
}
