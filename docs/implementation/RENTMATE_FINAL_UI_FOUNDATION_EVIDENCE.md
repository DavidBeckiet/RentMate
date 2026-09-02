# RentMate — FINALIZATION-04B-1 Evidence

## Scope and baseline

- Scope: design foundation, global shell, shared UI primitives, and motion strategy only.
- Baseline commit: `d078b447a8745567bdf99b039dcde449af876204`.
- `PRE_UI_FUNCTIONAL_BASELINE`: GREEN.
- P0 product regressions: 0.
- `RM054_LEGACY_E2E`: DEFERRED; not changed or used as a UI workaround.
- Backend business logic, API contracts, database schema/migrations, privacy, security, and lifecycle behavior: unchanged.

## Design foundation

- Canvas `#F7F5EF`; Surface `#FFFFFF`; Surface Muted `#EEF3F0`.
- Ink `#102D29`; Text Secondary `#516661`.
- Brand Teal `#0F766E`; Brand Dark `#0A4F49`.
- Coral `#F26B4F`; Soft Lime `#DDF39A`; Sky `#DCECF8`.
- Semantic Success `#15803D`, Warning `#B45309`, Danger `#B42318`.
- Headings/display use self-hosted `Be_Vietnam_Pro`; body/UI use `Manrope` through `next/font`.
- Base spacing remains 4px with token steps through 96px; controls use 12px radius, cards 16px, overlays 20px.
- Borders are semantic and quiet; surface/raised/overlay shadows are soft and use no global hard offset.
- The existing inline SVG icon language remains the single icon system with normalized 16/18/20/24px usage.

## Shared primitives

- Normalized: Button, IconButton, Card, Badge, Input, Textarea, Select, Checkbox, Radio, Field/FormField, Pagination, Skeleton, LoadingState, EmptyState, and ErrorState.
- Added foundation primitives: Alert, Toast/ToastViewport, Dialog, Drawer, Tabs, Tooltip, DropdownMenu, Table, PageHeader, SectionHeader, PageTransition, and resilient `MediaImage`.
- Button variants are primary, secondary, outline, ghost, danger, and soft; all keep 44px+ targets and pending/disabled/focus states.
- Form controls retain native payload and behavior while adding visible labels, hint/error associations, focus, disabled, read-only, checkbox, and radio semantics.
- Error/feedback primitives render caller-owned sanitized text only; no stack, provider response, database value, or internal identifier is introduced.

## Shell and responsive layout

- Public/auth shell uses the warm canvas, surface header, semantic active navigation, skip link, and dark footer.
- Public navigation retains existing URLs and exposes `Tìm phòng`, `Gần tôi`, `Ở ghép`, and `Trợ giúp` alongside home/recent routes.
- Landlord/admin keep separate workspace navigation; the desktop sidebar is 264px and uses Brand Dark without merging role navigation.
- Tenant mobile navigation has five 44px+ labeled routes: home, search, roommate, saved, and account. It includes safe-area padding and is hidden on conversation detail routes so it cannot cover a composer or critical action.
- Public and workspace containers retain their existing max-widths/gutters; no deep page-specific redesign was included.

## Motion system

- Tokens: fast 160ms, standard 220ms, slow 420ms; enter/exit/standard easing; small 8px/12px distances; 0.98 dialog entry scale.
- Page transitions use pathname-keyed opacity plus 8px vertical entry; no delayed navigation or polling replay.
- Dialog/backdrop and drawer use opacity/transform entry only; drawer width is fixed and never animated.
- Reveal is one restrained opacity + 12px pattern with a small 48ms stagger step and no replay after intersection.
- Skeleton uses a light shimmer; all nonessential motion/shimmer/reveal/route movement is disabled under `prefers-reduced-motion`.
- No global infinite decorative motion, layout-heavy width/height animation, card rotation, or hard-shadow hover remains in the foundation layer.

## Accessibility and privacy checks

- Visible 3px focus ring with 2px+ offset, forced-colors fallback, keyboard labels, skip link, semantic landmarks, tab/tabpanel ARIA, dialog focus trap/return/Escape behavior, drawer focus management, and 44px+ controls are covered by the primitives/shell.
- Status and alert live regions distinguish routine status from warning/danger feedback; skeletons remain hidden from assistive technology.
- Public location/contact/privacy projections are untouched; foundation code adds no hidden contact, precise location, roommate-private data, AI classification, admin risk, provider error, or environment value exposure.

## Responsive verification record

- Breakpoint intent audited in source for 375px, 768px, 1024px, and 1440px: mobile drawer/bottom nav, tablet gutters, desktop header/sidebar, dialog/form/table overflow, and safe-area padding have explicit responsive classes.
- Runtime screenshot inspection at those widths was unavailable in this environment because no active in-app Browser instance was available; no visual pass is claimed beyond the source/build checks below.

## Checks

- `npm.cmd --prefix frontend run test -- --pool threads --maxWorkers=1 --no-file-parallelism`: PASS — 116 files, 719 tests.
- Focused foundation/shell Vitest command with the same deterministic flags: PASS — 5 files, 63 tests.
- `npm.cmd --prefix frontend run typecheck`: PASS.
- `npm.cmd --prefix frontend run lint`: PASS.
- Scoped Prettier check over affected frontend files: PASS.
- `git diff --check`: PASS.
- Production build with temporary safe `NEXT_PUBLIC_API_BASE_URL=https://api.rentmate.invalid`: PASS — Next 16.3.2, 43 routes generated.

## Deferred visual migration

Page-specific legacy styling remains intentionally deferred to FINALIZATION-04B-2 through 04B-6, including homepage/auth/listing/map redesign, landlord/admin page redesign, and roommate page visual migration. Existing feature behavior remains the source of truth.
