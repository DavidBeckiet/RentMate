# RentMate — FINALIZATION-04B-2 Evidence

## Scope and baseline

- Scope: public marketplace redesign, authentication surfaces, listing discovery/detail presentation, map/list coordination, and tenant-facing secondary listing flows.
- Baseline commit: `d078b447a8745567bdf99b039dcde449af876204`.
- P0 product regressions: 0 according to the final deterministic frontend suite.
- FINALIZATION-04B-1 foundation remains authoritative: semantic tokens, shared primitives, shell, media fallback, motion, and accessibility conventions are reused.
- Backend business logic, API contracts, database schema/migrations, privacy, security, listing lifecycle, and provider behavior are unchanged.
- Roommate page redesign is intentionally deferred to FINALIZATION-04B-3; landlord and admin workspace redesigns remain deferred to FINALIZATION-04B-4/05.

## Homepage

- The homepage now leads with Vietnamese-first messaging: “Tìm phòng. Tìm người ở ghép. Sống đúng nhịp.”
- Hero search routes through the existing search contract and keeps the existing field names, URL behavior, and loading feedback.
- Featured listings are requested from the public listings API. Hardcoded demo inventory is not presented as live stock; loading, API error, and intentional empty states are rendered explicitly.
- The page contains separate tenant and roommate journeys, factual trust/safety guidance, real supported-area exploration links, and a landlord CTA without fabricated testimonials, ratings, counts, or success claims.
- The local hero asset uses `MediaImage`, responsive `sizes`, an accessible alt, and an in-product SVG fallback.

## Authentication

- Login, tenant/landlord registration, forgot password, reset password, Google seam, and Google landlord completion now share the redesigned responsive auth shell.
- Desktop uses a form-first split layout with a housing editorial panel; mobile prioritizes the form and defers the image panel.
- Existing guards, role checks, redirect destinations, form IDs, validation, API payloads, cookie-based auth, and sanitized error handling are preserved.
- Success, error, pending, and retry-safe feedback uses the shared semantic visual language.

## Discovery, cards, maps, and detail

- Search keeps the existing lookup resources and public search request model while adding the redesigned list/map stage, desktop filter rail, mobile filter Drawer, Vietnamese active-filter chips, pagination, and sort controls.
- Map movement remains non-searching until the explicit “Tìm trong khu vực này” action. The map keeps visible OpenStreetMap attribution, and the list remains usable if tile loading fails.
- Listing cards use resilient media, an approximately 4:3 image ratio, price/title/area/facts/status, allowed verification information, favorite/compare/map controls, and accessible whole-card navigation without nested controls. Search and homepage loading use matching image/title/metadata card skeletons rather than a generic result spinner.
- Detail pages use a priority first gallery image, resilient thumbnails, facts/description/amenities/availability/contact/inquiry sections, sticky desktop contact treatment, mobile action treatment, and an explicit “vị trí xấp xỉ” presentation. Exact private address/coordinates and unauthorized contact data are not introduced.
- Favorite/save, comparison, sharing, private notes, saved-search, and removal controls keep their existing API behavior and authorization boundaries while adopting the new presentation.

## States, responsive behavior, and motion

- Homepage, discovery, map, detail, auth, favorites, saved-search, compare, and note surfaces cover loading, empty, validation, unauthorized, forbidden, not-found, conflict, provider/network failure, and retry-safe feedback through existing state logic and shared primitives.
- Layout intent is explicitly covered in source for 375px, 768px, 1024px, and 1440px: stacked mobile content and list/map toggle, desktop filter rail and map split, responsive card grids, gallery/sidebar behavior, and touch-sized controls.
- Motion is limited to route/card/media/Drawer/reveal feedback, with no autoplay video, canvas, parallax, infinite decorative loop, or card rotation. Reduced-motion styles disable nonessential transitions and animation.
- Icons remain the existing inline SVG icon system; clickable controls have visible focus/hover states and touch targets.

## Contract and privacy verification

- Public listing projections remain privacy-safe: approximate public location only, no exact address/coordinates, no moderation data, no provider identifiers, and no unauthorized landlord contact.
- Existing authentication remains cookie-based; no token is read or stored in frontend JavaScript, and requests continue to use the existing credentials behavior.
- No backend, database, migration, API specification, architecture, requirements, or frozen MVP roadmap file was changed for this redesign.
- No adjacent historical `RM-*` task was implemented. No dedicated Roommate redesign was added.

## Checks

- `npm.cmd --prefix frontend run test -- --pool threads --maxWorkers=1 --no-file-parallelism`: PASS — 116 files, 719 tests.
- Focused auth/detail Vitest command with deterministic flags: PASS — 6 files, 52 tests.
- `npm.cmd --prefix frontend run typecheck`: PASS.
- `npm.cmd --prefix frontend run lint`: PASS with `--max-warnings=0`.
- `npm.cmd --prefix frontend run format:check`: BLOCKED by six pre-existing formatting warnings in `admin-listing-card.tsx`, `owner-listings-page.test.tsx`, `owner-query.test.ts`, `recently-viewed-storage.ts`, `recently-viewed.test.tsx`, and `recently-viewed.tsx`; none were changed.
- `git diff --check`: PASS.
- Production build with temporary `NEXT_PUBLIC_API_BASE_URL=https://api.rentmate.example`: PASS — Next.js 16.3.2, 43 routes generated.

## Visual verification limitation

Runtime screenshot inspection at 375px, 768px, 1024px, and 1440px was unavailable because no active in-app Browser session was available. The responsive, media, accessibility, and reduced-motion behavior is represented in source and covered by automated tests/build checks; no manual visual pass is claimed.
