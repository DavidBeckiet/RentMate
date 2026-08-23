# Landlord Lead API Specification

This additive post-MVP contract provides a landlord work queue over existing inquiries. It does not change the inquiry lifecycle.

## Queue views

- `NEEDS_REPLY`: open inquiries whose latest message is from the tenant.
- `NEW`: inquiries in `NEW` status.
- `ACTIVE`: `CONTACTED` inquiries whose latest message is from the landlord.
- `CLOSED`: inquiries in `CLOSED` status.
- `ALL`: every inquiry owned by the current landlord.

Views may overlap: a new inquiry normally also needs a reply. `NEEDS_REPLY` is the default and is ordered by the oldest waiting message first. Other views use most recently updated first.

## Endpoints

- `GET /api/v1/landlord/leads?view=NEEDS_REPLY&page=1&pageSize=20`
  - Active authenticated landlord only.
  - Returns inquiry ID, listing ID, current inquiry status, existing contact fields, latest-message snippet and sender, unread signal, reply-needed signal, and the landlord's private note.
- `PATCH /api/v1/landlord/leads/:inquiryId/note`
  - Active authenticated owning landlord only.
  - Body is `{ "note": string | null }`; a string is trimmed and limited to 2000 characters, while `null` removes the note.
  - Unknown fields are rejected. A normalized repeated note is a safe idempotent update.

Non-owners receive `404`. Tenant and admin roles receive `403`. Pagination uses limit plus one and does not run a count query.

## Privacy and lifecycle

Internal notes are returned only through landlord lead endpoints and never through tenant inquiry, notification, public listing, review, or admin review DTOs. The queue does not expose tenant email, account ID, authentication data, or messages beyond the latest authorized snippet. It introduces no new inquiry status or transition.
