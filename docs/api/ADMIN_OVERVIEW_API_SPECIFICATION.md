# Admin Overview API Contract

These read-only endpoints supply the Admin Operational Overview. Each source is owned and queried by its own service. The responses are independent service snapshots; their `capturedAt` values do not form an atomic global snapshot.

All endpoints require an authenticated, currently active `ADMIN` account. Missing, invalid, expired, or inactive authentication returns `401`; an authenticated non-admin returns `403`. Query parameters are not accepted.

## `GET /api/v1/admin/overview/identity`

Identity Service returns global counts from its `users` and `landlord_verifications` tables:

```json
{
  "data": {
    "accounts": {
      "total": 0,
      "byRole": { "TENANT": 0, "LANDLORD": 0, "ADMIN": 0 },
      "active": 0,
      "inactive": 0
    },
    "verifications": { "pending": 0 },
    "capturedAt": "2026-09-17T00:00:00.000Z"
  }
}
```

`accounts.total` is every Identity account and equals both the sum of `byRole` and `active + inactive`. `verifications.pending` counts only `landlord_verifications.status = PENDING`; it excludes approved, rejected, and historical completed submissions. `capturedAt` is when Identity produced this database snapshot.

## `GET /api/v1/admin/overview/listings`

Listing Service returns global counts from its `listings` and `listing_reports` tables:

```json
{
  "data": {
    "listings": {
      "total": 0,
      "byStatus": {
        "DRAFT": 0,
        "PENDING": 0,
        "APPROVED": 0,
        "REJECTED": 0,
        "HIDDEN": 0,
        "INACTIVE": 0
      }
    },
    "listingReports": { "open": 0, "investigating": 0 },
    "capturedAt": "2026-09-17T00:00:00.000Z"
  }
}
```

`listings.total` is all listings and equals the sum of the six moderation-status buckets. `listingReports.open` and `listingReports.investigating` count only their exact status values. `APPROVED` is a moderation status; it does not guarantee the listing is publicly visible, active in the marketplace, or discoverable. `capturedAt` is when Listing Service produced this database snapshot.

## `GET /api/v1/admin/overview/engagement`

Engagement Service returns global counts from its own operational records:

```json
{
  "data": {
    "support": { "open": 0, "inProgress": 0 },
    "reviews": { "pending": 0 },
    "contactReports": { "open": 0, "investigating": 0 },
    "roommateReports": { "open": 0, "investigating": 0 },
    "reviewReports": { "open": 0, "investigating": 0 },
    "capturedAt": "2026-09-17T00:00:00.000Z"
  }
}
```

`support.open` and `support.inProgress` count `support_requests` in their exact states. `reviews.pending` counts only `listing_reviews.status = PENDING`. `contactReports` counts only `contact_reports.source = CONTACT_INQUIRY`; `roommateReports` counts only `contact_reports.source = ROOMMATE`; a row can never be in both buckets. `reviewReports` counts `review_reports`. All report fields keep `OPEN` and legacy/current `INVESTIGATING` distinct, excluding `RESOLVED` and `DISMISSED`. `capturedAt` is when Engagement Service produced this database snapshot.

Gateway forwards each endpoint to its owning service and does not aggregate, transform, cache, or estimate values.
