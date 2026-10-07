# Design system (Phase 3G)

One page for anyone styling this project. The source of truth is `web/src/styles/tokens.css`; this file explains it.

## Identity (do not change without the club's say)

- Dark teal / near-black surfaces, emerald as the one action colour, cyan for technical detail, lime for "needs attention".
- Glass panels, restrained glow, circuit / topographic line art.
- Orbitron for display type, Inter for reading. Both stacks end in system fonts, and the site never calls a font CDN: if the bundled fonts are missing, it still reads correctly.

## Brand hierarchy

1. **DRMC IT Club** is the brand. Its mark (`web/src/assets/ditc.png`) is in the header, the organizer shell, the sign-in card, the hero, the registration pass, the footer and the browser tab.
2. **Dhaka Residential Model College** is the institution. Its crest (`crest.png`) appears once per page, in the footer under "Affiliation", at 32 x 35 px, after the club's mark and smaller than every club mark.

Use `components/brand/Brand.jsx`: `<Brand />` (mark + name lockup), `<ClubLogo size="sm|md|lg" />`, `<Institution />`. Do not place the crest anywhere else, and do not redraw either logo. `tools/browser-3g.mjs` fails if the crest shows up in a header, appears twice, or is not clearly smaller than the club's mark.

The club's logo file has a near-black background baked in. `.club-logo` uses `mix-blend-mode: lighten` so the page shows through it; the file is not edited. A transparent PNG or SVG from the club would be better (see "Known limits").

## Tokens

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `--ink` `--bg` `--bg-2` `--surface` `--surface-2` `--glass` `--glass-strong` `--bar` `--field` `--inset` `--overlay` `--scrim` `--footer` | darkest to lightest; `--glass*` for cards over the page, `--surface*` for opaque dialogs and drawers |
| Text | `--text-strong` `--text` `--muted` `--muted-2` `--on-primary` | four levels; `--on-primary` only on the emerald button |
| Lines | `--border` `--border-strong` `--line-soft` `--trace` `--art-line` | |
| Accents | `--primary` `--primary-2` `--teal` `--cyan` `--lime` `--primary-soft` `--primary-soft-2` `--focus` | |
| Status | `--ok` `--warn` `--bad` `--info` (+ `-bg`), `--ok-text`, `--bad-strong`, `--danger-line` | always with words and an icon; `--ok-text` when the status is written as text |
| Type | `--font-body` `--font-display` `--font-mono`, `--text-xs` ... `--text-lg`, `--track-label` | |
| Space | `--space-1` (4px) ... `--space-8` (72px) | |
| Shape | `--radius-sm` `--radius` `--radius-lg` `--radius-xl` `--radius-pill` | |
| Depth | `--shadow-sm` `--shadow` `--shadow-lg`, `--glow` `--glow-soft` `--glow-cyan` | glow is for the primary action and the pass, not for everything |
| Motion | `--dur-1` 150ms, `--dur-2` 250ms, `--dur-3` 400ms, `--ease` | all of it is switched off by `prefers-reduced-motion` in `base.css` |
| Layout | `--header-h` `--container` `--tap` (44px), `--z-header` `--z-assistant` `--z-toast` `--z-fullscreen` | |

Rules: no literal hex colour outside `tokens.css` (print styles aside); no inline `style` (the CSP forbids it); a new colour is a new token, with its contrast checked. One-off translucent tints inside gradients are still written as `rgba(...)` in the component stylesheets.

## Components worth knowing

`Brand`, `ClubLogo`, `Institution` (brand); `SiteFooter` (layouts); `SectionHead` (heading + optional action on one line); the existing kit: `Button`, `Field` / `Input` / `Select` / `Textarea`, `Badge`, `Card`, `Modal` (dialog and drawer), `Async` / `Loading` / `Skeletons` / `EmptyState` / `ErrorState`, `PageContainer` / `PageHead`, `TechHero`, `SeatMeter`.

## Accessibility floor

- Text 4.5:1 (3:1 for large type). Measured by `tools/browser-3g.mjs`.
- Every control has a name; one `h1` and one `main` per page; `nav`s are labelled.
- Focus: 2px `--focus` outline with a 3px offset; fields add a soft ring.
- Touch screens (`pointer: coarse`): buttons, chips, tabs, fields and menu links are at least 44px tall.
- The current page is marked with `aria-current` and a bar, not colour alone. Status badges always carry words.

## How UI/UX Pro Max was used

The skill (`ui-ux-pro-max`, from `github.com/nextlevelbuilder/ui-ux-pro-max-skill`, commit 477bcb2) was run first, as the phase brief required:

```
python3 scripts/search.py "student club operations platform university event management dark futuristic professional technology" --design-system -p "DRMC IT Club Smart Club Operations"
python3 scripts/search.py "React responsive accessible component architecture polished dashboard forms event platform" --stack react
python3 scripts/search.py "..." --domain ux|color|style|typography      (responsive/touch, accessibility/focus, forms, loading/empty/error, dark teal palettes, glass style, display + body type)
```

| It recommended | Decision |
|---|---|
| Palette: purple `#7C3AED`, orange `#EA580C`, on a light `#FAF5FF` page | **Rejected.** It would replace the club's identity. The teal / emerald / cyan / lime palette stays |
| Type: Inter + Playfair Display, loaded from Google Fonts | **Rejected.** Orbitron + Inter stay; no font CDN |
| Style "Vibrant & Block-based", scroll-snap, animated patterns | **Rejected** as off-brand; glass panels and circuit art stay |
| Pattern "Hero-centric": one primary action, a value strip, proof | **Adopted**: one primary button in the hero, and a strip of three real figures from the API |
| Checklist: hover transitions 150-300ms, hand cursor on clickable things, 4.5:1 contrast, visible focus, reduced motion, 375/768/1024/1440 | **Adopted** and turned into automated checks (plus 320px) |
| UX rules: no horizontal scroll, 44px touch targets, 2px focus ring, errors announced and tied to fields, required markers, empty states with a message and an action, loading with a status | **Adopted**; most already held, the gaps were fixed |
| "No emoji as icons" | **Partly.** UI icons are SVG. Club icons are emoji that come from the database (`clubs.icon`), so they are content; they are hidden from screen readers |
| React guidance (TypeScript event types, testing-library queries) | Not applicable: the project is plain JavaScript and its browser suites use Playwright role / label queries already |

## Known limits

- The club logo file is 231 x 141 px with a baked-in background. It is sharp at header size and slightly soft at 72px tall; on lighter panels a faint plate can be seen around it. Ask the club for an SVG or a transparent PNG and drop it in at the same path.
- Orbitron and Inter have not been seen rendered in this project's test environment (the npm registry is blocked there, so the build used for testing has no web fonts). Widths were checked with display type stretched by 0.2em to stand in for Orbitron.
