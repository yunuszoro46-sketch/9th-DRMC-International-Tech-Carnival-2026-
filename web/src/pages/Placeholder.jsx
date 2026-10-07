import { usePageTitle } from "../router.jsx";
import PageContainer, { PageHead } from "../components/common/PageContainer.jsx";
import { EmptyState } from "../components/common/States.jsx";
import Button from "../components/common/Button.jsx";
// Route exists and is wired (URL, layout, auth guard); the screen itself is built in a later phase.
export default function Placeholder({ title, phase = "a later phase", organizer = false }) {
  usePageTitle(title);
  const body = <EmptyState icon="info" title={`${title} is not built yet`} message={`This route is wired up and ready. The screen itself is planned for ${phase}.`} action={title === "Dashboard" ? null : <Button variant="secondary" to={organizer ? "/organizer" : "/"}>{organizer ? "Back to dashboard" : "Back to home"}</Button>} />;
  return organizer ? body : <PageContainer><PageHead title={title} />{body}</PageContainer>;
}
