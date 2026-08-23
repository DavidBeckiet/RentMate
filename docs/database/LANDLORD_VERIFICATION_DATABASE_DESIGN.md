# Landlord Verification Database Design

Identity migration `0002_landlord_verifications.sql` adds one Identity-owned table, `landlord_verifications`.

Each row is one manual profile-review submission and stores the landlord ID, display name, optional request note, status, terminal decision note, reviewing admin ID, and timestamps. Same-database foreign keys reference `users`; no cross-service foreign key is introduced.

## Invariants

- Status is `PENDING`, `APPROVED`, or `REJECTED`.
- A pending row has no reviewer, decision note, or review timestamp.
- An approved/rejected row requires all terminal decision fields.
- At most one `PENDING` row exists per landlord.
- At most one `APPROVED` row exists per landlord.
- Rejected rows remain as immutable submission history; a landlord may submit a new request after rejection.
- Public verification is derived only from an `APPROVED` row and never from user-provided request fields.

Indexes support landlord history and admin queue pagination. The application performs every decision under a row lock and updates `updated_at` explicitly.
