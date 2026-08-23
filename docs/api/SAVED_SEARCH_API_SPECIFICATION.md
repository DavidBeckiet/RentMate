# Saved Search API specification

All endpoints require an active authenticated tenant. Another role receives `403`; a saved search not owned by the current tenant is represented as `404`.

- `POST /api/v1/saved-searches` creates a saved search and returns `201`.
- `GET /api/v1/saved-searches?page=&pageSize=` returns a limit-plus-one paginated collection.
- `PATCH /api/v1/saved-searches/:savedSearchId` updates `name`, `isActive`, and/or the complete normalized `query`. A normalized no-op preserves `updatedAt`.
- `DELETE /api/v1/saved-searches/:savedSearchId` deletes an owned row and returns `204`.

Create body: `{ name?: string | null, isActive?: boolean, query: SavedSearchQuery }`.

Patch body accepts the same fields, but requires at least one field. Unknown fields are rejected. `name` is optional, trimmed, nullable, and limited to 120 characters.

`SavedSearchQuery` contains optional text/range/type/amenity filters plus a required `mode` and `sort`. Geographic fields must exactly match the selected mode. Paging fields are never stored. Bounds and radius are mutually exclusive; radius is greater than zero and at most 50 km.

The response exposes only the tenant-owned search definition, timestamps, and activation state. Notification matching and delivery are outside this slice.
