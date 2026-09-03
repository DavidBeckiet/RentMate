# RentMate Final Current-Architecture E2E Evidence

## Acceptance gates

- `RENTMATE FINALIZATION-05 = READY`
- `CURRENT ARCHITECTURE E2E = PASS`
- `P0 product regressions = 0`

## Topology and command

The final browser suite is `frontend/playwright.current-architecture.config.ts` and runs the Next.js App Router frontend at `http://localhost:3000` against the existing Compose Gateway at `http://localhost:4001`.

```text
Chromium -> Next.js :3000 -> API Gateway :4001
                         -> Identity / Listing / Engagement -> PostgreSQL
```

- Command: `npm run test:e2e:final`
- Final result: `16 passed` with one Chromium worker and no retry, skip, or `test.only`.
- The config deliberately does not start or target the legacy RM054 fixture on port `4100`.
- Browser traces, screenshots, and video are retained only on failure. Reusable local auth storage is under ignored `frontend/.playwright/`; failure output remains under ignored `test-results/`.

## Seed and deterministic test data

- Existing local Compose seed accounts cover tenant, landlord, second landlord, and admin role checks.
- Setup first validates a saved session through `GET /api/v1/users/me`; it logs in through the UI only when no valid state exists. This avoids false failures from the intentionally in-memory local auth limiter while keeping Identity authoritative.
- A single labeled E2E tenant is registered through the current UI once and reused for the inquiry path. Roommate creates four uniquely labeled isolated tenant actors per run.
- Landlord draft listings with the `final-landlord-listing-` prefix are removed before and after the landlord suite. The inquiry created by the suite is transitioned `NEW -> CONTACTED -> CLOSED`.
- The current API has no ordinary account-deletion endpoint, so labeled E2E tenant accounts and append-only Roommate safety evidence remain in local test data. No production credentials, production data, live OAuth, live Gemini request, or map-tile assertion is used.

## Coverage matrix

| Area | Browser and Gateway evidence |
| --- | --- |
| Authentication | UI registration validation and success setup, tenant/landlord/admin workspaces, invalid login rejection, cookie-backed logout. |
| Marketplace | Public search/filter/detail, approximate-location map surface, comparison, favorites, saved search, and private note. |
| Landlord and inquiry | Create/edit a test-owned draft, non-owner `404`, tenant inquiry, landlord detail visibility, then valid close lifecycle. |
| Roommate V1 | Linked and unlinked discovery, compatibility presentation without relying on numeric scores, interest/chat/accept/connection, report/block, and responsive layouts. |
| Roommate V2/V3 | Admin risk review is presented separately from V3 AI-safety evidence; landlord verification queue is inspected read-only. |
| AI fallback | Capability is read from the current Gateway. The manual Roommate profile stays usable when preference parsing is unavailable, and page load is asserted not to call preference-preview or recommendation mutations. |
| Admin contact reports | Admin request receives `200`; a tenant request receives `403`; the admin UI renders the current Gateway result. |

## Runtime and external boundaries

- Core pages assert the expected current Gateway responses; no unexpected application `5xx`, unhandled browser exception, or hydration error was observed in the passing run.
- Development-only Next warnings observed during the run were documented, not treated as product failures: `NO_COLOR`/`FORCE_COLOR`, Fast Refresh full reload, smooth-scroll configuration advice, and image LCP loading advice.
- The suite does not assert remote map tiles or invoke a live AI provider. It verifies the product remains functional without an AI mutation.

## RM054 comparison

`frontend/playwright.config.ts` remains the historical RM054 suite: it starts `backend start:rm054:e2e` and targets the legacy fixture at `4100` (frontend `3100`). It is retained for historical coverage and is excluded from this final acceptance gate.

The new current-architecture suite instead uses `frontend/playwright.current-architecture.config.ts`, port `3000`, and the real Gateway/Compose services at `4001`. It therefore verifies the current cross-service routing and current UI contracts rather than an isolated legacy fixture.
