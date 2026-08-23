# Listing Comparison and Notes Database Design

Comparison selection and sharing do not require database state. The frontend keeps at most four public listing IDs in memory for the current SPA session. Tenant notes belong to Engagement Service and use one additive table.

## `tenant_listing_notes`

| Column       | Type            | Rules                                                        |
| ------------ | --------------- | ------------------------------------------------------------ |
| `tenant_id`  | `integer`       | Positive; current Identity user ID                           |
| `listing_id` | `integer`       | Positive; current Listing resource ID                        |
| `note`       | `varchar(2000)` | Trimmed, non-empty private text                              |
| `created_at` | `timestamptz`   | Defaults to current timestamp                                |
| `updated_at` | `timestamptz`   | Defaults to current timestamp; changes only on a real update |

The primary key is `(tenant_id, listing_id)`, enforcing one note per tenant/listing pair. The tenant/update index supports private-note retrieval and future account-data export. There are no cross-service foreign keys: Identity owns users and Listing owns listings. Saving verifies current public visibility through Listing's internal catalog contract; deletion remains available even if a listing later becomes unavailable.

Migration: `services/engagement-service/migrations/0008_tenant_listing_notes.sql`.
