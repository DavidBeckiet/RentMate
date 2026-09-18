# Listing Report API specification

## Tenant

`POST /api/v1/listings/:listingId/reports`

- Requires an active authenticated tenant and an allowed Origin.
- The listing must currently be public and its landlord active; otherwise returns `404`.
- Body: `{ category, details? }`. Details are optional, trimmed, nullable, and limited to 2,000 characters.
- Creates an `OPEN` report and creation-history event atomically; returns `201` with the report receipt.
- A duplicate active report by the same tenant for the same listing returns `409`.
- Rate limited by tenant, listing, and IP.

## Admin

- `GET /api/v1/admin/reports?status=&category=&page=&pageSize=` lists reports newest first using limit-plus-one pagination. Default status is `OPEN`.
- `GET /api/v1/admin/reports/:reportId` returns the listing projection, reporter profile, report details, and complete ordered processing history.
- `PATCH /api/v1/admin/reports/:reportId/status` accepts `{ status, note? }`.

Allowed decisions are `OPEN -> RESOLVED` and `OPEN -> DISMISSED`. Existing `INVESTIGATING` reports may transition to either `RESOLVED` or `DISMISSED`; new status updates cannot create `INVESTIGATING` reports. `DISMISSED` means no further action is required. `RESOLVED` means the admin completed case review, without implying that a violation or enforcement action occurred. Both decisions require a nonblank resolution note. Status update and history insertion commit atomically under a row lock. An unsupported requested status is rejected during validation; a stale or invalid transition from the current state returns `409`.

Report handling does not silently change listing moderation status. Admins use the existing listing moderation contract for hide/restore actions, preserving its lifecycle and moderation history.
