# Listing Report database design

This post-MVP Trust & Safety extension is owned by the Listing Service because reports target listing resources and are handled alongside listing moderation.

## `listing_reports`

- References `listings.id` inside the same database with `ON DELETE RESTRICT` so safety records cannot disappear with a listing.
- Stores the reporter identity without a cross-database foreign key to Identity Service.
- Categories are `PRICE_INCORRECT`, `LOCATION_INCORRECT`, `IMAGE_INCORRECT`, `ALREADY_RENTED`, `FRAUD`, and `INAPPROPRIATE`.
- Status is `OPEN`, `INVESTIGATING`, `RESOLVED`, or `DISMISSED`.
- A partial unique index allows at most one active (`OPEN` or `INVESTIGATING`) report per reporter and listing.
- Terminal reports require a normalized resolution note and `resolved_at` timestamp.

## `listing_report_events`

- Append-only history for creation and every status transition.
- Stores actor identity/role, previous status, next status, optional note, and timestamp.
- Rows are never updated or deleted by the application.

Migration: `services/listing-service/migrations/0004_listing_reports.sql`.
