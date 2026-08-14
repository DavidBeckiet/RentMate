# RM-054 manual acceptance record

| Field | Execution record |
| --- | --- |
| Task | RM-054 — Frontend critical-flow and manual acceptance |
| Date | 2026-08-14 |
| HEAD | `0c2250f2b2d5dc27e699f5fdc64d6f842a398902` |
| Environment | Local Windows acceptance environment; real Next.js production build and local Express test composition |
| Browser | Playwright Chromium `151.0.7922.34` |
| Frontend | `http://localhost:3100` |
| Backend | `http://localhost:4100` |
| Database | Process-local `TEST_DATABASE_URL` targeting `rentmate_test_rm054` only |
| Providers | Deterministic test-only Cloudinary and Nominatim boundaries; no live provider calls |
| Viewports | Desktop `1440x900`; mobile `375x812`; tablet smoke `768x1024` |

## Evidence method

Each `PASS` below comes from an executed local browser flow, current frontend component suite, or current RM-053 database contract suite. Browser flows use normal cookie-based UI authentication and the real local `/api/v1` API; they do not inject a JWT, mock RentMate API calls, or call a production database. `—` in a viewport column means that the row is not a separate mobile-only workflow, not an unchecked capability.

The in-app Browser surface was also attempted for visual acceptance, but the environment exposed no available browser instance. This record therefore does not claim a human manual observation; it records the objectively executed local Playwright browser and regression evidence.

## Public — 8/8

| ID | Actor | Capability | Precondition and observed steps | Expected and observed result | Automated evidence | Desktop | Mobile | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | Anonymous | Browse and text search | Seed one APPROVED listing; enter `RM054`; submit search. | Matching public card is rendered. | `rm054-auth-public.spec.ts` public-detail flow; `test:rm048` | PASS | PASS responsive search shell | PASS | Tablet `768x1024` search smoke PASS. |
| P02 | Anonymous | Filters, sort, and pagination | Exercise query/filter controls and pagination state. | Valid filter/sort state and limit-plus-one pagination controls remain deterministic. | `test:rm048` search query/filter/page suites; RM-053 discovery contract | PASS | — | PASS | Component evidence supplements single-listing local browser seed. |
| P03 | Anonymous | List and approximate map | Open the public collection and map region. | List/map switch and visible OpenStreetMap attribution render without exact coordinates. | `rm054-auth-public.spec.ts`; `rm054-responsive-accessibility.spec.ts` | PASS | PASS | PASS | External tiles are blocked only in E2E; attribution remains visible. |
| P04 | Anonymous | Search this area | Move/search-area controls are exercised through the public map UI. | Search action, rather than map movement alone, changes query state. | `test:rm048` search-map suite | PASS | — | PASS | No API route is mocked. |
| P05 | Anonymous | Radius and current-location grant/deny | Granted deterministic HCMC geolocation selects a center and searches at 3 km; denial state is covered by radius controls. | Radius query is applied; no real device location is used; denial is safe. | `rm054-auth-public.spec.ts`; `test:rm048` radius controls | PASS | PASS responsive controls | PASS | Granted location uses `10.7724, 106.6981`. |
| P06 | Anonymous | Detail, image, and approximate location | Open seeded public detail. | Image, approximate-location heading, and public DTO render. | `rm054-auth-public.spec.ts` | PASS | — | PASS | Exact address is absent. |
| P07 | Anonymous | Public privacy projection | Inspect public detail before tenant login. | No landlord email/phone, exact address, or exact coordinates are rendered. | `rm054-auth-public.spec.ts`; RM-053 privacy database scenario | PASS | — | PASS | Privacy assertions use real backend projection. |
| P08 | Anonymous | Public visibility lifecycle | Hide then restore an approved listing; deactivate then reactivate its landlord. | Detail disappears while hidden/inactive and returns after restore/reactivation. | `rm054-cross-actor.spec.ts`; `test:rm053:database` | PASS | — | PASS | Listing status is preserved across account activation. |

## Tenant — 8/8

| ID | Actor | Capability | Precondition and observed steps | Expected and observed result | Automated evidence | Desktop | Mobile | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | Tenant | Registration | Register a unique tenant through the UI. | Session is established and navigation changes to authenticated state. | `rm054-auth-public.spec.ts`; `test:rm047` | PASS | PASS responsive auth controls | PASS | No JavaScript token storage. |
| T02 | Tenant | Login and logout | Log out and log back in using email/password. | Navigation is restored and logout returns to anonymous UI. | `rm054-auth-public.spec.ts` | PASS | PASS responsive auth controls | PASS | Cookie is HttpOnly and not read by page JavaScript. |
| T03 | Tenant | Current account and navigation | Observe authenticated navigation after register/login. | Tenant-only saved-listings navigation is visible. | `rm054-auth-public.spec.ts`; `test:rm047` | PASS | PASS menu interaction | PASS | Mobile menu supports keyboard/Escape. |
| T04 | Active tenant | Contact enrichment | Open currently public detail while authenticated as active tenant. | Landlord email and phone render only for this authorized case. | `rm054-auth-public.spec.ts`; `test:rm053:database` | PASS | — | PASS | Anonymous row P07 proves the inverse projection. |
| T05 | Tenant | Add favorite | Save an approved listing from detail. | Button becomes saved state and no duplicate API workaround is used. | `rm054-cross-actor.spec.ts`; `test:rm049` | PASS | — | PASS | Real cookie/API flow. |
| T06 | Tenant | Favorites collection, pagination, and empty state | Open favorites after save, then remove the only item. | Listing appears, then empty-state text is shown; pagination behavior is covered. | `rm054-cross-actor.spec.ts`; `test:rm049` | PASS | — | PASS | Empty state observed in browser. |
| T07 | Tenant | Remove favorite | Use the remove control in the collection. | Canonical empty favorites state appears. | `rm054-cross-actor.spec.ts`; `test:rm049` | PASS | — | PASS | Idempotent backend behavior remains covered by RM-040/RM-053. |
| T08 | Tenant | Visibility and account activity behavior | Hide/reveal public listing and validate active-account boundaries. | Public availability follows visibility/activity; unauthorized projection is not leaked. | `rm054-cross-actor.spec.ts`; `test:rm053:database` | PASS | — | PASS | No frontend-only authorization workaround. |

## Landlord — 20/20

| ID | Actor | Capability | Precondition and observed steps | Expected and observed result | Automated evidence | Desktop | Mobile | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L01 | Landlord | Registration, login, logout | Register unique landlord; later log out/in. | Landlord session and owner navigation are restored. | `rm054-cross-actor.spec.ts`; `test:rm047` | PASS | PASS semantic auth controls | PASS | Real UI cookie flow. |
| L02 | Landlord | Profile read and update | Open profile and exercise valid update state. | Current profile is shown and valid changes refresh canonical user data. | `test:rm050` landlord profile suite; RM-053 contract | PASS | — | PASS | Frontend component plus backend contract evidence. |
| L03 | Landlord | Dashboard | Visit `/landlord` after authentication. | Owner dashboard and listing collection render. | `rm054-cross-actor.spec.ts`; `test:rm050` | PASS | PASS responsive owner controls | PASS | |
| L04 | Landlord | Create nullable draft/progress | Create a draft before required listing content. | Draft route is created without inventing default content. | `rm054-cross-actor.spec.ts`; `test:rm050` | PASS | — | PASS | Tablet owner-editor smoke PASS. |
| L05 | Landlord | Private detail, exact location, current reason | Open owned listing and later view rejection reason. | Owner-only fields and current moderation reason are rendered safely. | `rm054-responsive-accessibility.spec.ts`; `test:rm050`; `test:rm053:database` | PASS | — | PASS | Tablet REJECT reason observed by owner. |
| L06 | Landlord | Edit and lookups | Fill title, description, rent, area, address, type, amenity. | Valid form saves and lookup controls use canonical values. | `rm054-cross-actor.spec.ts`; `test:rm050` | PASS | PASS labels | PASS | Tablet editor smoke PASS. |
| L07 | Landlord | Normalized no-op | Submit normalized unchanged content. | No-op preserves listing/status/timestamp behavior. | `test:rm050`; `test:rm053:database` | PASS | — | PASS | Database scenario is authoritative for timestamp invariant. |
| L08 | Landlord | Geocode candidate | Request geocoding then select deterministic HCMC candidate. | Candidate sets location only after explicit selection. | `rm054-cross-actor.spec.ts`; `test:rm051` | PASS | — | PASS | No live Nominatim call. |
| L09 | Landlord | Manual pin | Enter exact latitude/longitude manually. | Owner workflow accepts coordinates in deployment region. | `rm054-cross-actor.spec.ts`; `test:rm051` | PASS | — | PASS | Public projection remains approximate. |
| L10 | Landlord | Geocode failure preservation | Trigger sentinel provider failure, retain address/draft, then explicitly retry success. | No automatic retry or data loss. | `rm054-provider-conflict.spec.ts` | PASS | — | PASS | Deterministic Nominatim mock boundary. |
| L11 | Landlord | Image upload | Upload valid local JPEG. | Image count and canonical state refresh after success. | `rm054-provider-conflict.spec.ts`; `test:rm051` | PASS | PASS labeled control | PASS | No live Cloudinary call. |
| L12 | Landlord | Image reorder | Move second image upward then save order. | Success feedback follows canonical reorder refresh. | `rm054-provider-conflict.spec.ts`; `test:rm051` | PASS | — | PASS | Real owner UI mutation. |
| L13 | Landlord | Image delete | Confirm deletion of one draft image. | Count changes from 2/8 to 1/8 after refresh. | `rm054-provider-conflict.spec.ts`; `test:rm051` | PASS | — | PASS | Explicit confirmation is exercised. |
| L14 | Landlord | Replacement below maximum | Upload replacement first, then explicitly delete old image. | Two-step replacement retains canonical result and gives success feedback. | `rm054-provider-conflict.spec.ts`; `test:rm051` | PASS | — | PASS | No atomic replacement endpoint. |
| L15 | Landlord | Replacement at 8/8 | Fill to 8 images; delete old first; explicitly upload replacement. | Count returns to 8/8 and canonical status refreshes. | `rm054-provider-conflict.spec.ts`; `test:rm051` | PASS | — | PASS | Frozen maximum preserved. |
| L16 | Landlord | Submit | Complete draft with image then submit. | Status becomes PENDING. | `rm054-cross-actor.spec.ts`; `test:rm050` | PASS | — | PASS | |
| L17 | Landlord | Rejection/hidden reason | Admin rejects with required reason; owner reloads detail. | Owner sees current rejection reason; hidden reason behavior remains covered. | Tablet smoke in `rm054-responsive-accessibility.spec.ts`; `test:rm052`; `test:rm053:database` | PASS | — | PASS | HIDE/RESTORE browser flow also runs. |
| L18 | Landlord | Deactivate and reactivate listing | Use explicit lifecycle controls. | Status follows frozen lifecycle and public visibility changes appropriately. | `test:rm050`; `test:rm053:database` | PASS | — | PASS | Separate from landlord account activation. |
| L19 | Landlord | Eligible delete | Attempt owned DRAFT deletion under eligibility rules. | Only eligible draft is removable; protected states remain safe. | `test:rm050`; RM-053 lifecycle database scenario | PASS | — | PASS | |
| L20 | Landlord | Conflict/error recovery | Exercise provider error and canonical recovery feedback. | No false upload success or automatic replay; user can retry explicitly. | `rm054-provider-conflict.spec.ts`; `test:rm051` | PASS | PASS accessible alert | PASS | Real stale moderation 409 is covered separately in A09. |

## Admin — 13/13

| ID | Actor | Capability | Precondition and observed steps | Expected and observed result | Automated evidence | Desktop | Mobile | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | Admin | Login, current account, logout | Log into `/admin/login`, use admin navigation, log out. | Admin-only UI becomes available and logout clears it. | `rm054-cross-actor.spec.ts`; `test:rm052` | PASS | PASS semantic auth controls | PASS | |
| A02 | Admin | Queue and filters | Open moderation queue and filterable listing collection. | Pending listing appears with safe summary and filter state. | `rm054-cross-actor.spec.ts`; `test:rm052` | PASS | — | PASS | |
| A03 | Admin | Private detail | Open listing detail as admin. | Exact private owner/admin fields are available only in admin UI. | `rm054-cross-actor.spec.ts`; `test:rm052`; `test:rm053:database` | PASS | — | PASS | Distinct from public detail projection. |
| A04 | Admin | Moderation history | Inspect canonical history after action/conflict. | Append-only history heading and canonical state render. | `rm054-provider-conflict.spec.ts`; `test:rm052`; `test:rm053:database` | PASS | — | PASS | |
| A05 | Admin | APPROVE | Approve pending landlord listing. | Listing becomes APPROVED and becomes publicly discoverable. | `rm054-cross-actor.spec.ts` | PASS | — | PASS | |
| A06 | Admin | REJECT with reason | Reject pending listing with a required reason. | Reason is recorded and owner sees it after reload. | Tablet smoke in `rm054-responsive-accessibility.spec.ts`; `test:rm052` | PASS | — | PASS | Explicit real UI modal submit. |
| A07 | Admin | HIDE with reason | Hide an approved listing with reason. | Public detail becomes unavailable. | `rm054-cross-actor.spec.ts`; `test:rm052` | PASS | — | PASS | |
| A08 | Admin | RESTORE | Restore the hidden listing. | Public detail returns to canonical approved state. | `rm054-cross-actor.spec.ts`; `test:rm052` | PASS | — | PASS | |
| A09 | Admin | Stale 409 recovery | Two admin browser contexts open PENDING listing; second approves; first rejects stale state. | UI reports conflict, reloads canonical APPROVED detail/history. | `rm054-provider-conflict.spec.ts` | PASS | — | PASS | Real backend 409; no API route mock. |
| A10 | Admin | User filters | Use role/activity filter controls and pagination query logic. | Filters are validated and reset page correctly. | `rm054-cross-actor.spec.ts`; `test:rm052` | PASS | — | PASS | |
| A11 | Admin | Tenant activation | Exercise tenant activation UI and confirmation semantics. | Only permitted tenant account activation mutation is offered. | `test:rm052`; RM-053 authorization matrix | PASS | — | PASS | |
| A12 | Admin | Landlord activation and public visibility | Deactivate approved landlord then reactivate. | Landlord UI is inactive; public listing disappears then returns without status rewrite. | `rm054-cross-actor.spec.ts`; `test:rm053:database` | PASS | — | PASS | Real browser cross-actor flow. |
| A13 | Admin | No ADMIN activation control | Inspect admin users UI and authorization matrix. | Admin accounts do not expose self/ADMIN activation mutation control. | `test:rm052`; RM-053 authorization matrix | PASS | — | PASS | Frozen role safety preserved. |

## Totals

| Group | PASS | FAIL | BLOCKED |
| --- | ---: | ---: | ---: |
| Public | 8 | 0 | 0 |
| Tenant | 8 | 0 | 0 |
| Landlord | 20 | 0 | 0 |
| Admin | 13 | 0 | 0 |
| Total | 49 | 0 | 0 |
