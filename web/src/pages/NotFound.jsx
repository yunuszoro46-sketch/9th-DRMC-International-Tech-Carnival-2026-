import { usePageTitle } from "../router.jsx";
import PageContainer from "../components/common/PageContainer.jsx";
import { ErrorState } from "../components/common/States.jsx";
export default function NotFound() {
  usePageTitle("Page not found");
  return <PageContainer><ErrorState level={1} title="Page not found" error={{ status: 404, message: "That page doesn't exist or has moved." }} /></PageContainer>;
}
