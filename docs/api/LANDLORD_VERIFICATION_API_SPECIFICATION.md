# Landlord Verification API Specification

This additive post-MVP contract implements manual landlord profile verification in the Identity boundary. It does not claim email/SMS OTP verification, collect identity documents, or implement eKYC.

## Landlord endpoints

- `POST /api/v1/landlord/verifications` — active landlord only; body `{ "displayName": string, "note": string | null }`; creates a `PENDING` request and returns `201`. An existing `PENDING` or `APPROVED` request returns `409`. Limit: three attempts per landlord/IP per 24 hours.
- `GET /api/v1/landlord/verifications/current` — active landlord only; returns the latest request or `null` in the normal success envelope.

The landlord DTO contains `id`, `displayName`, `requestNote`, `status`, `decisionNote`, `submittedAt`, and `reviewedAt`. It never exposes the reviewing admin ID.

## Admin endpoints

- `GET /api/v1/admin/verifications?status=PENDING&page=1&pageSize=20` — admin-only queue. Status is optional and defaults to `PENDING`.
- `GET /api/v1/admin/verifications/:verificationId` — admin-only detail.
- `PATCH /api/v1/admin/verifications/:verificationId/status` — admin-only; body `{ "status": "APPROVED" | "REJECTED", "note": string }`.

Only `PENDING -> APPROVED` and `PENDING -> REJECTED` are allowed. A stale or repeated decision returns `409`. The admin DTO additionally contains landlord `id`, `email`, `phone`, and `isActive`, plus `reviewedByAdminId`.

## Public projection

Public listing detail adds `landlordVerified: boolean`. This is the only verification value exposed publicly. Request notes, decision notes, reviewer identity, timestamps, and internal status are never included in public listing responses.

All endpoints reject unknown fields/query parameters, require current active-account authentication for protected access, preserve the existing session cookie, and use the standard RentMate success/error envelopes.
