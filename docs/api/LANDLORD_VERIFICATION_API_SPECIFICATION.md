# Landlord Verification API Specification

This additive post-MVP contract implements landlord contact verification and manual landlord profile verification in the Identity boundary. It does not collect identity documents or implement eKYC.

## Landlord endpoints

- `POST /api/v1/landlord/verifications` — active landlord only after both email and phone are verified; body `{ "displayName": string, "note": string | null }`; creates a `PENDING` request and returns `201`. An existing `PENDING` or `APPROVED` request returns `409`. Limit: three attempts per landlord/IP per 24 hours.
- `GET /api/v1/landlord/verifications/current` — active landlord only; returns the latest request or `null` in the normal success envelope.
- `GET /api/v1/landlord/verifications/status` — active landlord only; returns the landlord's email, phone, contact verification timestamps, and current manual profile request.
- `POST /api/v1/landlord/verifications/email/request` — active landlord only; sends a one-time email verification token through the configured delivery provider. The request body must be `{}`.
- `POST /api/v1/landlord/verifications/email/confirm` — active landlord only; body `{ "token": string }`; consumes the one-time token.
- `POST /api/v1/landlord/verifications/phone/request` — active landlord only; sends a six-digit OTP to the current profile phone. The request body must be `{}`.
- `POST /api/v1/landlord/verifications/phone/confirm` — active landlord only; body `{ "code": string }`; consumes the OTP after at most five attempts.

The landlord DTO contains `id`, `displayName`, `requestNote`, `status`, `decisionNote`, `submittedAt`, and `reviewedAt`. It never exposes the reviewing admin ID.

The verification status DTO contains only the current landlord's own email and phone, `verified`, `verifiedAt`, and the manual profile projection. Raw tokens and OTP values are never returned by public API endpoints.

## Admin endpoints

- `GET /api/v1/admin/verifications?status=PENDING&page=1&pageSize=20` — admin-only queue. Status is optional and defaults to `PENDING`.
- `GET /api/v1/admin/verifications/:verificationId` — admin-only detail.
- `PATCH /api/v1/admin/verifications/:verificationId/status` — admin-only; body `{ "status": "APPROVED" | "REJECTED", "note": string }`.

Only `PENDING -> APPROVED` and `PENDING -> REJECTED` are allowed. A stale or repeated decision returns `409`. The admin DTO additionally contains landlord `id`, `email`, `phone`, and `isActive`, plus `reviewedByAdminId`.

## Public projection

Public listing search summaries and listing detail add `landlordVerified: boolean`. This is true only when the active landlord has a verified email, a verified phone, and an approved manual profile request. This is the only verification value exposed publicly. Request notes, decision notes, reviewer identity, timestamps, contact addresses, and internal status are never included in public listing responses.

All endpoints reject unknown fields/query parameters, require current active-account authentication for protected access, preserve the existing session cookie, and use the standard RentMate success/error envelopes.
