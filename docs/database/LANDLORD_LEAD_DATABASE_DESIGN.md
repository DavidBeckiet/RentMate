# Landlord Lead Database Design

Engagement migration `0005_landlord_lead_notes.sql` adds `landlord_lead_notes` as optional private metadata for an existing inquiry.

## Invariants

- `inquiry_id` is the primary key and references `listing_inquiries` with `ON DELETE CASCADE`: at most one current note per inquiry.
- `landlord_id` is copied from the inquiry and used only for landlord-owned note lookup; service authorization still locks and verifies the inquiry row before every mutation.
- Notes are trimmed, nonblank, and at most 2000 characters.
- Removing a note deletes the metadata row rather than storing an ambiguous empty value.
- Queue status, latest-message sender, unread state, and reply-needed state are derived from existing inquiry/message data; no duplicate lead lifecycle is persisted.

The landlord/update-time index supports private note lookup. No cross-service foreign keys, analytics events, or tenant profile data are added.

## Follow-up reminders

Engagement migration `0007_landlord_lead_reminders.sql` adds `landlord_lead_reminders` as optional landlord-owned metadata for an existing inquiry.

- `inquiry_id` is the primary key and cascades with its inquiry, so one inquiry has at most one current reminder.
- `landlord_id` supports owner-scoped lookup after the service locks and verifies the inquiry row.
- `remind_at` is an absolute timestamp. The service accepts only a future time no more than 365 days away.
- Removing a reminder deletes the row. A due reminder is retained until explicitly changed or removed.
- The landlord/time index supports the reminder queue ordered by earliest follow-up first.

No scheduler, notification delivery row, recurrence rule, appointment entity, or tenant-facing reminder data is added.
