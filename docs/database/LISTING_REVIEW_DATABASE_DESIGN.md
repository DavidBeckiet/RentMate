# Listing Review Database Design

Engagement migration `0004_listing_reviews.sql` adds `listing_reviews`, owned by the Engagement boundary because review eligibility is derived from an inquiry and its messages.

## Invariants

- `inquiry_id` is a same-database foreign key and is unique: one review per inquiry.
- `listing_id` and `tenant_id` are denormalized immutable lookup values copied from the inquiry; they have no cross-service foreign keys.
- All three ratings are integers from 1 to 5.
- Status is `PENDING`, `APPROVED`, or `REJECTED`.
- Pending reviews have no moderation fields; terminal reviews require note, admin ID, and review timestamp.
- Eligibility is checked transactionally while locking the inquiry row.
- Public reads include only `APPROVED` rows and still require current public listing visibility through the Listing Service.

Indexes support public listing reads, tenant lookup, and FIFO admin moderation. Application code updates timestamps explicitly.
