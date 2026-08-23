# Landlord Analytics Database Design

Basic landlord analytics are derived from `listing_inquiries` and `inquiry_messages`; no aggregate or event table is added.

Migration `0006_landlord_analytics_indexes.sql` adds only indexes for the authorized time-window and first-response queries:

- landlord plus inquiry creation time;
- inquiry plus sender role and message creation time.

The endpoint executes one aggregate statement in the Engagement database so summary cards, daily series, and listing ranking share one measurement timestamp and one consistent statement snapshot. It does not join across service databases or persist tenant-level analytics copies.
