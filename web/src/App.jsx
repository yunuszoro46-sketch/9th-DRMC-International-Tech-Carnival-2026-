import { lazy, Suspense } from "react";
import { RouterProvider, Routes } from "./router.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import { ToastProvider } from "./components/common/Toast.jsx";
import { Loading } from "./components/common/States.jsx";
import PublicLayout from "./layouts/PublicLayout.jsx";
import Home from "./pages/Home.jsx";
import Clubs from "./pages/Clubs.jsx";
import ClubPage from "./pages/ClubPage.jsx";
import FestPage from "./pages/FestPage.jsx";
import EventPage from "./pages/EventPage.jsx";
import Events from "./pages/Events.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import RegistrationPage from "./pages/RegistrationPage.jsx";
import MyRegistrations from "./pages/MyRegistrations.jsx";
import Volunteer from "./pages/Volunteer.jsx";
import Gallery from "./pages/Gallery.jsx";
import Placeholder from "./pages/Placeholder.jsx";
import NotFound from "./pages/NotFound.jsx";
import { isToken } from "./lib/storage.js";

// Organizer screens are split into their own chunk: students never download them.
const OrganizerLayout = lazy(() => import("./layouts/OrganizerLayout.jsx"));
const OrganizerLogin = lazy(() => import("./pages/OrganizerLogin.jsx"));
const OrganizerVolunteers = lazy(() => import("./pages/OrganizerVolunteers.jsx"));
const OrganizerDashboard = lazy(() => import("./pages/OrganizerDashboard.jsx"));
const OrganizerRegistrations = lazy(() => import("./pages/OrganizerRegistrations.jsx"));
const OrganizerEvents = lazy(() => import("./pages/OrganizerEvents.jsx"));
const OrganizerEventDetail = lazy(() => import("./pages/OrganizerEventDetail.jsx"));
const OrganizerEventForm = lazy(() => import("./pages/OrganizerEventForm.jsx"));
const OrganizerFests = lazy(() => import("./pages/OrganizerFests.jsx"));
const OrganizerFestDetail = lazy(() => import("./pages/OrganizerFestDetail.jsx"));
const OrganizerFestForm = lazy(() => import("./pages/OrganizerFestForm.jsx"));

const Pub = (el) => <PublicLayout>{el}</PublicLayout>;
// A non-numeric id can never match a record, so it is a plain "page not found" without a pointless API call.
const withId = (render) => ({ id, token }) => (id !== undefined && !/^\d+$/.test(id) ? Pub(<NotFound />) : render(id, token));
const orgId = (render) => ({ id }) => (/^\d+$/.test(id) ? render(id) : Pub(<NotFound />));
const Org = (title, phase) => <OrganizerLayout title={title}><Placeholder title={title} phase={phase} organizer /></OrganizerLayout>;

const ROUTES = [
  { path: "/", render: () => Pub(<Home />) },
  { path: "/clubs", render: () => Pub(<Clubs />) },
  { path: "/clubs/:id", render: withId((id) => Pub(<ClubPage id={id} />)) },
  { path: "/fests/:id", render: withId((id) => Pub(<FestPage id={id} />)) },
  { path: "/events", render: () => Pub(<Events />) },
  { path: "/events/:id", render: withId((id) => Pub(<EventPage id={id} />)) },
  { path: "/events/:id/register", render: withId((id) => Pub(<RegisterPage id={id} />)) },
  // A token that can't possibly be one never reaches the API.
  { path: "/registration/:token", render: ({ token }) => (isToken(token) ? Pub(<RegistrationPage token={token} />) : Pub(<NotFound />)) },
  { path: "/my-registrations", render: () => Pub(<MyRegistrations />) },
  { path: "/volunteer", render: () => Pub(<Volunteer />) },
  { path: "/gallery", render: () => Pub(<Gallery />) },
  { path: "/organizer/login", render: () => <OrganizerLogin /> },
  { path: "/organizer", render: () => <OrganizerLayout title="Dashboard"><OrganizerDashboard /></OrganizerLayout> },
  { path: "/organizer/events", render: () => <OrganizerLayout title="Events"><OrganizerEvents /></OrganizerLayout> },
  // "new" is listed before ":id" (first match wins); a non-numeric id is a plain 404 without an API call.
  { path: "/organizer/events/new", render: () => <OrganizerLayout title="Events"><OrganizerEventForm /></OrganizerLayout> },
  { path: "/organizer/events/:id", render: orgId((id) => <OrganizerLayout title="Events"><OrganizerEventDetail id={id} /></OrganizerLayout>) },
  { path: "/organizer/events/:id/edit", render: orgId((id) => <OrganizerLayout title="Events"><OrganizerEventForm id={id} /></OrganizerLayout>) },
  { path: "/organizer/fests", render: () => <OrganizerLayout title="Fests"><OrganizerFests /></OrganizerLayout> },
  { path: "/organizer/fests/new", render: () => <OrganizerLayout title="Fests"><OrganizerFestForm /></OrganizerLayout> },
  { path: "/organizer/fests/:id", render: orgId((id) => <OrganizerLayout title="Fests"><OrganizerFestDetail id={id} /></OrganizerLayout>) },
  { path: "/organizer/fests/:id/edit", render: orgId((id) => <OrganizerLayout title="Fests"><OrganizerFestForm id={id} /></OrganizerLayout>) },
  { path: "/organizer/registrations", render: () => <OrganizerLayout title="Registrations"><OrganizerRegistrations /></OrganizerLayout> },
  { path: "/organizer/volunteers", render: () => <OrganizerLayout title="Volunteers"><OrganizerVolunteers /></OrganizerLayout> },
  { path: "/organizer/check-in", render: () => Org("Check-in", "Phase 3D") },
];

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <RouterProvider>
          <Suspense fallback={<Loading label="Loading…" />}>
            <Routes routes={ROUTES} fallback={Pub(<NotFound />)} />
          </Suspense>
        </RouterProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
