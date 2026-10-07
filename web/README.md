# Smart Club Ops web (React)

React frontend for the Smart Club Ops API. The Node server stays zero-dependency and serves `web/dist` when it exists,
otherwise it falls back to the classic UI in `../public` (set `UI=classic` to force the classic UI).

```bash
npm run web:install   # from the repo root: react, react-dom, vite, @vitejs/plugin-react, @fontsource/inter + orbitron
npm run web:build     # writes web/dist; `npm start` then serves it automatically
npm run web:dev       # hot reload on :5173, proxies /api to the server on :3000
```

No Tailwind, icon library or router package: styling is plain CSS with design tokens, icons are inline SVG, and routing is a
small History-API router (`src/router.jsx`). The server's strict CSP (`script-src 'self'`, `style-src 'self'`) is kept; fonts
are self-hosted via @fontsource.

## Structure (`src/`)

| Path | Purpose |
|---|---|
| `main.jsx`, `App.jsx` | Entry, providers (error boundary, toasts, router) and the route table |
| `router.jsx` | `RouterProvider`, `Routes`, `Link`, `Navigate`, `useSearchParams`, `usePageTitle` |
| `lib/api.js` | The only code that calls `fetch`. Returns data or throws `ApiError {code, message, status, field}`; handles timeout, network failure, abort |
| `lib/` | `storage` (guarded browser storage, token validation), `dates` (Dhaka display formatting), `format` (labels), `validation` (UX-only), `qr` (QR encoder) |
| `hooks/useApi.js` | Race-safe data loading (abort + stale protection), `reload()` |
| `components/common/` | Button, Card, Field/Input/Select/Textarea, Badge, Modal (native `<dialog>`), States (Loading, Empty, Error, `Async`), Toast, ErrorBoundary, Icon, PageContainer |
| `layouts/` | `PublicLayout` (header, mobile drawer, footer), `OrganizerLayout` (auth guard, sidebar / drawer) |
| `pages/` | Route screens |
| `styles/` | `tokens.css` (design tokens), `base.css`, `components.css`, `layout.css`, `public.css` (hero, glass panels, pass, gallery), `organizer.css` (dashboard, registration management) |
| `components/organizer/` | `useRegistrationActions` (approve / reject / cancel / check-in with confirmation and stale handling), `SeatMeter`, `Pager` |
| `lib/eventAdmin.js` | Fest and event request shapes, limits mirrored from the backend, form-schema helpers (Phase 3E) |
| `lib/registrationAdmin.js` | Which organizer actions to offer per status (mirrors the backend's transitions), pass labels, dynamic answer rows |
| `lib/nav.js` | The public site map: header, drawer and footer all render from it |
| `gallery/albums.js` | Gallery content: the real photographs in `assets/gallery/` with their captions and alt text. Steps for adding more are at the top of the file |
| `components/visual/TechHero.jsx` | The banner used on Home, Volunteer and Gallery |

Browser checks (need Playwright and a server serving `web/dist`): `tools/browser-3b.mjs`, `tools/browser-3b-audit.mjs`, `tools/browser-3c.mjs` (organizer dashboard and registrations), `tools/browser-3e.mjs` (event and fest management), `tools/browser-3f.mjs` (Tech Guide) and `tools/browser-3g.mjs` (layout, branding, accessibility).
`tools/build-preview.mjs` builds a single clickable `preview.html` of the whole app on sample data (a demo, not the production build).
Where npm is blocked, `tools/web-standin-build.mjs` bundles the same source with esbuild for testing only.

The backend is the source of truth: pages show the API's `registration_state`, `status`, `remaining`, etc. and never recompute them.
