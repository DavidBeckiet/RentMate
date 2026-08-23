# Listing Comparison, Notes, and Sharing API Specification

This post-MVP feature lets a browser compare up to four public listings, lets an active tenant store one private note per listing, and lets users share the canonical public listing URL.

Comparison selection contains only listing IDs and is kept in memory for the current frontend session. It survives client-side navigation but is cleared by a full reload or a new tab. Sharing uses `/listings/:listingId`. Neither operation creates a backend record.

## List private notes

`GET /api/v1/tenant/listing-notes?listingIds=7,9`

- Active authenticated tenant only.
- `listingIds` is required and contains between one and four unique positive integer IDs.
- Unknown or repeated query parameters are rejected.
- Only rows whose `tenant_id` matches the current principal are returned.
- Missing notes are omitted rather than represented as empty records.

Response:

```json
{
  "data": [
    {
      "listingId": 7,
      "note": "Gần chỗ làm, hỏi thêm chi phí điện nước.",
      "createdAt": "2026-08-24T12:00:00.000Z",
      "updatedAt": "2026-08-24T12:00:00.000Z"
    }
  ]
}
```

## Save a private note

`PUT /api/v1/tenant/listing-notes/:listingId`

Body:

```json
{ "note": "Gần chỗ làm, hỏi thêm chi phí điện nước." }
```

- Active authenticated tenant only.
- The normalized note contains 1–2,000 Unicode characters and no unsupported control characters.
- Unknown body fields are rejected.
- The listing must currently be public. An unavailable listing returns `404` without disclosing its owner or status.
- The operation creates or replaces the current tenant's note. A normalized no-op preserves `updatedAt`.
- Returns `200` with the private note DTO.

## Delete a private note

`DELETE /api/v1/tenant/listing-notes/:listingId`

- Active authenticated tenant only.
- Scoped by both current tenant ID and listing ID.
- Idempotent: an absent note also returns `204`.

## Privacy

Notes never appear in public listing, landlord, admin, analytics, inquiry, notification, or sharing responses. Comparison cards use public listing fields only and deliberately omit landlord contact and exact location. Shared links contain no note, tenant identifier, session value, or comparison state.
