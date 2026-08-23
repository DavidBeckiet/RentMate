# Listing Review API Specification

This additive post-MVP contract implements moderated listing reviews in the Engagement boundary.

## Eligibility

A tenant may create one review for an inquiry only when the inquiry belongs to that tenant, is `CLOSED`, and contains at least one landlord message. This proves a completed two-party interaction; it does not claim that a rental contract or payment occurred.

## Endpoints

- `GET /api/v1/inquiries/:inquiryId/review` — tenant-only eligibility/current-review state.
- `POST /api/v1/inquiries/:inquiryId/review` — tenant-only; body contains integer `overallRating`, `accuracyRating`, and `responsivenessRating` from 1 to 5 plus a 20–2000 character `comment`; creates `PENDING`, returns `201`, and is limited to three attempts per tenant/inquiry/IP per day.
- `GET /api/v1/listings/:listingId/reviews?page=1&pageSize=20` — public, but only while the listing remains publicly visible. Returns approved reviews only.
- `GET /api/v1/admin/reviews?status=PENDING&page=1&pageSize=20` — admin-only moderation queue.
- `GET /api/v1/admin/reviews/:reviewId` — admin-only detail.
- `PATCH /api/v1/admin/reviews/:reviewId/status` — admin-only; body `{ "status": "APPROVED" | "REJECTED", "note": string }`.

Only `PENDING -> APPROVED` and `PENDING -> REJECTED` are valid. Terminal decisions require a nonblank note and repeated/stale decisions return `409`.

## Privacy

Public review DTOs contain rating values, comment, creation time, and `verifiedInteraction: true`. They never contain tenant ID/email/contact, inquiry/message content, reviewer admin ID, or moderation notes. Admin DTOs may contain tenant and inquiry IDs but never message bodies or tenant contact data.
