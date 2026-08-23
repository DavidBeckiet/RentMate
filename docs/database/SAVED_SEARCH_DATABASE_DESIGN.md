# Saved Search database design

This post-MVP extension is owned by the Engagement service and does not change the frozen MVP tables.

## `saved_searches`

- Each row belongs to one tenant through `tenant_id`; this identifier is intentionally not a cross-database foreign key.
- Search filters are stored as typed columns so range and geographic-mode invariants can be enforced by PostgreSQL.
- `amenity_codes` stores normalized, unique, sorted lookup codes.
- `mode` is one of `ordinary`, `bounds`, or `radius`. Bounds and radius coordinates are mutually exclusive and complete.
- Radius searches are limited to 50 km and use `distance_asc`; ordinary and bounds searches use `newest`, `rent_asc`, or `rent_desc`.
- `is_active` only controls future matching. Creating or editing a saved search does not generate notifications.
- Rows are listed by `updated_at DESC, id DESC` through an index beginning with `tenant_id`.

Migration: `services/engagement-service/migrations/0003_saved_searches.sql`.
