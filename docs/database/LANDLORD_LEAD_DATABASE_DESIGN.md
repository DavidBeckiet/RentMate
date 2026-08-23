# Landlord Lead Database Design

Engagement migration `0005_landlord_lead_notes.sql` adds `landlord_lead_notes` as optional private metadata for an existing inquiry.

## Invariants

- `inquiry_id` is the primary key and references `listing_inquiries` with `ON DELETE CASCADE`: at most one current note per inquiry.
- `landlord_id` is copied from the inquiry and used only for landlord-owned note lookup; service authorization still locks and verifies the inquiry row before every mutation.
- Notes are trimmed, nonblank, and at most 2000 characters.
- Removing a note deletes the metadata row rather than storing an ambiguous empty value.
- Queue status, latest-message sender, unread state, and reply-needed state are derived from existing inquiry/message data; no duplicate lead lifecycle is persisted.

The landlord/update-time index supports private note lookup. No cross-service foreign keys, analytics events, reminder records, or tenant profile data are added.
