# RentMate Database Design Specification v1

## 1. Database design overview

RentMate uses one PostgreSQL database as the authoritative store for the approved MVP. The database supports user authentication data, account contact data, controlled listing values, listing content and coordinates, Cloudinary image metadata, tenant favorites, and listing moderation history.

The schema is designed for a modular-monolith backend using the `pg` client and parameterized SQL. PostgreSQL owns durable storage, relational integrity, filtering, ordering, pagination, transactional writes, bounding-box candidate filtering, and the final Haversine distance calculation. Express services own authorization, listing workflow decisions, privacy-aware response mapping, and coordination with external providers.

The final database contains two PostgreSQL enum types and eight tables. It intentionally contains no PostGIS objects, ORM metadata, session or refresh-token tables, listing revision tables, generalized audit tables, geocoding cache, messaging data, booking data, or speculative analytics structures.

## 2. Design goals and scope

The design goals are:

- Represent only the approved eight-week MVP.
- Preserve relational integrity without duplicating business data.
- Allow incomplete listing drafts while preventing incomplete non-draft listings.
- Store exact internal coordinates and support bounding-box plus Haversine search without PostGIS.
- Keep private address and landlord contact data separate from public-safe listing fields.
- Enforce stable structural rules in PostgreSQL.
- Keep actor authorization and workflow orchestration in the service layer where cross-row or cross-table context is required.
- Make the later migration step deterministic without requiring new schema decisions.
- Keep the schema understandable and maintainable for one developer.

The database does not model payment, booking, leases, messaging, notifications, reviews, recommendations, social login, multi-language content, or multiple currencies.

## 3. PostgreSQL conventions

The schema uses these conventions:

- The default PostgreSQL `public` schema is sufficient for the MVP.
- Identifiers use unquoted lowercase `snake_case`.
- Tables use plural names.
- Primary business keys use `integer GENERATED ALWAYS AS IDENTITY`.
- Small controlled lookup keys use `smallint GENERATED ALWAYS AS IDENTITY`.
- Pure junction tables use composite primary keys and no surrogate identifier.
- Foreign-key columns end in `_id`.
- Timestamp columns end in `_at`.
- Unit-bearing columns include their unit, such as `_sqm` and `_e164`.
- Instants use `timestamptz`.
- Monetary values use exact `numeric`, never floating-point types.
- Coordinates use `double precision` because they are inputs to range and trigonometric calculations.
- Explicit constraint names use `pk_`, `fk_`, `uq_`, and `ck_`.
- Explicit non-constraint indexes use `idx_`.
- Foreign-key identifiers are immutable; all foreign keys use `ON UPDATE RESTRICT`.
- `GENERATED ALWAYS AS IDENTITY` is used instead of `serial`.
- SQL migrations will be ordered and versioned, but no migrations are created as part of this specification.

## 4. PostgreSQL enum types

### 4.1 `user_role`

The `user_role` enum contains:

```text
TENANT
LANDLORD
ADMIN
```

Tenant and landlord registration may be public. Admin accounts are provisioned through controlled seed or administrative processes; public admin registration is forbidden by the service layer.

### 4.2 `listing_status`

The `listing_status` enum contains:

```text
DRAFT
PENDING
APPROVED
REJECTED
HIDDEN
INACTIVE
```

Application logic must compare enum values explicitly and must not depend on their declaration order.

Enums are appropriate for roles and listing statuses because they are stable workflow semantics. Property types and amenities remain lookup data rather than enums.

## 5. Final table list

| Table | Purpose | Primary key | Main foreign keys |
|---|---|---|---|
| `users` | Authentication identity, role, contact data, and account state | `id` | None |
| `property_types` | Controlled property-type catalog | `id` | None |
| `amenities` | Controlled amenity catalog | `id` | None |
| `listings` | Landlord-owned rental listing and exact location data | `id` | `landlord_id`, `property_type_id` |
| `listing_images` | Ordered Cloudinary image metadata | `id` | `listing_id` |
| `listing_amenities` | Listing-to-amenity many-to-many relationship | `(listing_id, amenity_id)` | `listing_id`, `amenity_id` |
| `favorites` | Tenant-to-listing saved relationship | `(tenant_id, listing_id)` | `tenant_id`, `listing_id` |
| `moderation_history` | Append-only listing moderation audit trail | `id` | `listing_id`, `admin_id` |

## 6. Detailed table definitions

### 6.1 `users`

The `users` table stores the single login identity, bcrypt password hash, role, account activation state, and account-level contact data. Contact information is not copied into listings.

| Column | PostgreSQL type | Nullability | Default | Description |
|---|---|---|---|---|
| `id` | `integer GENERATED ALWAYS AS IDENTITY` | `NOT NULL` | Identity | Primary key |
| `role` | `user_role` | `NOT NULL` | None | Authorization role |
| `email` | `varchar(320)` | `NOT NULL` | None | Normalized login email |
| `phone_e164` | `varchar(16)` | Nullable | `NULL` | Optional contact phone except for landlords |
| `password_hash` | `varchar(100)` | `NOT NULL` | None | bcrypt password hash |
| `is_active` | `boolean` | `NOT NULL` | `true` | Account activation state |
| `created_at` | `timestamptz` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation instant |
| `updated_at` | `timestamptz` | `NOT NULL` | `CURRENT_TIMESTAMP` | Last application-managed update instant |

Keys and constraints:

- `pk_users`: primary key on `id`.
- `uq_users_email`: unique constraint on `email`.
- `ck_users_email_normalized`: `email` must be nonempty and equal to `lower(btrim(email))`.
- `ck_users_phone_e164`: `phone_e164` is null or matches `^\+[1-9][0-9]{7,14}$`.
- `ck_users_landlord_phone`: `role <> 'LANDLORD' OR phone_e164 IS NOT NULL`.

Email is the only login identifier, is required for every tenant, landlord, and admin, and is immutable through MVP profile workflows. `phone_e164` is not unique and is never used for authentication. The application validates email syntax before persistence; the database enforces presence, normalization, length, and uniqueness.

The database does not attempt to validate bcrypt format with a regular expression. Only the authentication service may create or replace `password_hash`, and plaintext passwords must never be stored.

### 6.2 `property_types`

The `property_types` table contains the predefined property catalog used by listings.

| Column | PostgreSQL type | Nullability | Default | Description |
|---|---|---|---|---|
| `id` | `smallint GENERATED ALWAYS AS IDENTITY` | `NOT NULL` | Identity | Primary key |
| `code` | `varchar(32)` | `NOT NULL` | None | Stable machine-readable code |
| `label` | `varchar(80)` | `NOT NULL` | None | Human-readable label |
| `is_active` | `boolean` | `NOT NULL` | `true` | Whether the value may be selected for new changes |

Keys and constraints:

- `pk_property_types`: primary key on `id`.
- `uq_property_types_code`: unique constraint on `code`.
- `uq_property_types_label`: unique constraint on `label`.
- `ck_property_types_code`: `code` matches `^[A-Z][A-Z0-9_]*$`.
- `ck_property_types_label`: `label` is nonempty and equals `btrim(label)`.

Initial controlled rows:

| Code | Label |
|---|---|
| `ROOM` | `Room` |
| `STUDIO` | `Studio` |
| `APARTMENT` | `Apartment` |
| `HOUSE` | `House` |
| `DORMITORY` | `Dormitory` |

Codes are immutable after use. Values are retired with `is_active = false`, not deleted.

### 6.3 `amenities`

The `amenities` table contains the predefined amenity catalog.

| Column | PostgreSQL type | Nullability | Default | Description |
|---|---|---|---|---|
| `id` | `smallint GENERATED ALWAYS AS IDENTITY` | `NOT NULL` | Identity | Primary key |
| `code` | `varchar(40)` | `NOT NULL` | None | Stable machine-readable code |
| `label` | `varchar(80)` | `NOT NULL` | None | Human-readable label |
| `is_active` | `boolean` | `NOT NULL` | `true` | Whether the value may be selected for new changes |

Keys and constraints:

- `pk_amenities`: primary key on `id`.
- `uq_amenities_code`: unique constraint on `code`.
- `uq_amenities_label`: unique constraint on `label`.
- `ck_amenities_code`: `code` matches `^[A-Z][A-Z0-9_]*$`.
- `ck_amenities_label`: `label` is nonempty and equals `btrim(label)`.

Initial controlled rows:

| Code | Label |
|---|---|
| `AIR_CONDITIONING` | `Air conditioning` |
| `WIFI` | `Wi-Fi` |
| `FURNISHED` | `Furnished` |
| `PRIVATE_BATHROOM` | `Private bathroom` |
| `KITCHEN` | `Kitchen` |
| `REFRIGERATOR` | `Refrigerator` |
| `WASHING_MACHINE` | `Washing machine` |
| `PARKING` | `Parking` |
| `ELEVATOR` | `Elevator` |
| `SECURITY` | `Security` |
| `BALCONY` | `Balcony` |
| `PET_FRIENDLY` | `Pet-friendly` |

Codes are immutable after use. Values are retired with `is_active = false`, not deleted.

### 6.4 `listings`

The `listings` table stores the current in-place version of each landlord listing. The MVP has no listing revision table.

| Column | PostgreSQL type | Nullability | Default | Description |
|---|---|---|---|---|
| `id` | `integer GENERATED ALWAYS AS IDENTITY` | `NOT NULL` | Identity | Primary key |
| `landlord_id` | `integer` | `NOT NULL` | None | Owning user |
| `property_type_id` | `smallint` | Nullable for draft | `NULL` | Controlled property type |
| `status` | `listing_status` | `NOT NULL` | `'DRAFT'` | Current lifecycle state |
| `title` | `varchar(160)` | Nullable for draft | `NULL` | Public title |
| `description` | `text` | Nullable for draft | `NULL` | Public description, maximum 5,000 characters |
| `monthly_rent` | `numeric(12,0)` | Nullable for draft | `NULL` | Monthly rent in VND |
| `room_area_sqm` | `numeric(8,2)` | Nullable for draft | `NULL` | Room area in square metres |
| `address_text` | `varchar(500)` | Nullable for draft | `NULL` | Exact internal address |
| `area_name` | `varchar(120)` | Nullable for draft | `NULL` | Public-safe approximate area |
| `latitude` | `double precision` | Nullable for draft | `NULL` | Exact internal latitude |
| `longitude` | `double precision` | Nullable for draft | `NULL` | Exact internal longitude |
| `created_at` | `timestamptz` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation instant |
| `updated_at` | `timestamptz` | `NOT NULL` | `CURRENT_TIMESTAMP` | Last application-managed update instant |

Keys and foreign keys:

- `pk_listings`: primary key on `id`.
- `fk_listings_landlord`: `landlord_id -> users.id`, `ON DELETE RESTRICT`, `ON UPDATE RESTRICT`.
- `fk_listings_property_type`: `property_type_id -> property_types.id`, `ON DELETE RESTRICT`, `ON UPDATE RESTRICT`.

Value checks:

- `ck_listings_title`: `title` is null or is nonempty and equals `btrim(title)`.
- `ck_listings_description`: `description` is null or `btrim(description)` is nonempty and `char_length(description) <= 5000`.
- `ck_listings_monthly_rent`: `monthly_rent` is null or greater than zero.
- `ck_listings_room_area`: `room_area_sqm` is null or greater than zero.
- `ck_listings_address_text`: `address_text` is null or is nonempty and equals `btrim(address_text)`.
- `ck_listings_area_name`: `area_name` is null or is nonempty and equals `btrim(area_name)`.
- `ck_listings_latitude`: `latitude` is null or between `-90` and `90`.
- `ck_listings_longitude`: `longitude` is null or between `-180` and `180`.
- `ck_listings_coordinate_pair`: latitude and longitude are either both null or both non-null.

Status-dependent completeness:

- `ck_listings_non_draft_complete`: when `status <> 'DRAFT'`, `property_type_id`, `title`, `description`, `monthly_rent`, `room_area_sqm`, `address_text`, `area_name`, `latitude`, and `longitude` must all be non-null.

`address_text` is never a public field. Public search primarily uses `title` and `area_name`. Exact coordinates are used internally, while tenant and anonymous responses receive coordinates rounded to three decimal places by API response mapping.

### 6.5 `listing_images`

The `listing_images` table stores metadata returned by Cloudinary and the application-defined display order.

| Column | PostgreSQL type | Nullability | Default | Description |
|---|---|---|---|---|
| `id` | `integer GENERATED ALWAYS AS IDENTITY` | `NOT NULL` | Identity | Primary key |
| `listing_id` | `integer` | `NOT NULL` | None | Owning listing |
| `cloudinary_public_id` | `varchar(255)` | `NOT NULL` | None | Cloudinary asset identifier |
| `secure_url` | `varchar(2048)` | `NOT NULL` | None | HTTPS delivery URL |
| `format` | `varchar(16)` | `NOT NULL` | None | Normalized image format |
| `width` | `integer` | `NOT NULL` | None | Width in pixels |
| `height` | `integer` | `NOT NULL` | None | Height in pixels |
| `byte_size` | `integer` | `NOT NULL` | None | Uploaded image size in bytes |
| `display_order` | `smallint` | `NOT NULL` | None | Display slot from 1 through 8 |
| `alt_text` | `varchar(255)` | Nullable | `NULL` | Optional meaningful alternative text |
| `created_at` | `timestamptz` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation instant |

Keys and constraints:

- `pk_listing_images`: primary key on `id`.
- `fk_listing_images_listing`: `listing_id -> listings.id`, `ON DELETE CASCADE`, `ON UPDATE RESTRICT`.
- `uq_listing_images_cloudinary_public_id`: unique constraint on `cloudinary_public_id`.
- `uq_listing_images_listing_display_order`: unique constraint on `(listing_id, display_order)`, `DEFERRABLE INITIALLY IMMEDIATE`.
- `ck_listing_images_public_id`: `cloudinary_public_id` is nonempty and equals `btrim(cloudinary_public_id)`.
- `ck_listing_images_secure_url`: `secure_url` begins with `https://`.
- `ck_listing_images_format`: `format` is nonempty and equals `lower(btrim(format))`.
- `ck_listing_images_dimensions`: `width > 0 AND height > 0`.
- `ck_listing_images_byte_size`: `byte_size BETWEEN 1 AND 5242880`.
- `ck_listing_images_display_order`: `display_order BETWEEN 1 AND 8`.
- `ck_listing_images_alt_text`: `alt_text` is null or `btrim(alt_text)` is nonempty.

The eight possible unique display slots enforce a maximum of eight image rows per listing. Gaps are permitted. Transactional reordering defers the listing/order unique constraint until transaction commit and must leave a valid unique final ordering.

### 6.6 `listing_amenities`

The `listing_amenities` junction table represents the many-to-many relationship between listings and amenities.

| Column | PostgreSQL type | Nullability | Default | Description |
|---|---|---|---|---|
| `listing_id` | `integer` | `NOT NULL` | None | Listing |
| `amenity_id` | `smallint` | `NOT NULL` | None | Amenity |

Keys and constraints:

- `pk_listing_amenities`: composite primary key on `(listing_id, amenity_id)`.
- `fk_listing_amenities_listing`: `listing_id -> listings.id`, `ON DELETE CASCADE`, `ON UPDATE RESTRICT`.
- `fk_listing_amenities_amenity`: `amenity_id -> amenities.id`, `ON DELETE RESTRICT`, `ON UPDATE RESTRICT`.

There is no surrogate identifier and no timestamp. The composite primary key prevents duplicate amenity assignments.

### 6.7 `favorites`

The `favorites` table records a tenant's saved listing relationship.

| Column | PostgreSQL type | Nullability | Default | Description |
|---|---|---|---|---|
| `tenant_id` | `integer` | `NOT NULL` | None | Tenant user |
| `listing_id` | `integer` | `NOT NULL` | None | Saved listing |
| `created_at` | `timestamptz` | `NOT NULL` | `CURRENT_TIMESTAMP` | Save instant |

Keys and constraints:

- `pk_favorites`: composite primary key on `(tenant_id, listing_id)`.
- `fk_favorites_tenant`: `tenant_id -> users.id`, `ON DELETE CASCADE`, `ON UPDATE RESTRICT`.
- `fk_favorites_listing`: `listing_id -> listings.id`, `ON DELETE CASCADE`, `ON UPDATE RESTRICT`.

The composite primary key prevents a tenant from saving the same listing more than once. Actor role and current listing visibility are cross-table business rules enforced by the service.

### 6.8 `moderation_history`

The `moderation_history` table is the authoritative, append-only business audit trail for admin listing moderation.

| Column | PostgreSQL type | Nullability | Default | Description |
|---|---|---|---|---|
| `id` | `integer GENERATED ALWAYS AS IDENTITY` | `NOT NULL` | Identity | Primary key |
| `listing_id` | `integer` | `NOT NULL` | None | Moderated listing |
| `admin_id` | `integer` | `NOT NULL` | None | Acting admin |
| `previous_status` | `listing_status` | `NOT NULL` | None | Status before moderation |
| `new_status` | `listing_status` | `NOT NULL` | None | Status after moderation |
| `reason` | `varchar(1000)` | Nullable conditionally | `NULL` | Rejection, hiding, or optional moderation reason |
| `created_at` | `timestamptz` | `NOT NULL` | `CURRENT_TIMESTAMP` | Action instant |

Keys and constraints:

- `pk_moderation_history`: primary key on `id`.
- `fk_moderation_history_listing`: `listing_id -> listings.id`, `ON DELETE RESTRICT`, `ON UPDATE RESTRICT`.
- `fk_moderation_history_admin`: `admin_id -> users.id`, `ON DELETE RESTRICT`, `ON UPDATE RESTRICT`.
- `ck_moderation_history_status_changed`: `previous_status <> new_status`.
- `ck_moderation_history_transition`: permits only:
  - `PENDING -> APPROVED`
  - `PENDING -> REJECTED`
  - `APPROVED -> HIDDEN`
  - `HIDDEN -> APPROVED`
- `ck_moderation_history_reason_nonblank`: `reason` is null or `btrim(reason)` is nonempty.
- `ck_moderation_history_reason_required`: a nonempty reason is required when `new_status` is `REJECTED` or `HIDDEN`.

The table has no `updated_at`. Normal application workflows must never update or delete its rows.

## 7. Column type rationale

- `integer` identity keys provide ample capacity for an MVP, compact indexes, and simpler Node.js handling than `bigint`.
- `smallint` identity keys are sufficient for the small property and amenity catalogs.
- `varchar` is used where an approved maximum length exists.
- `text` is used for description with an explicit character-length check.
- `numeric(12,0)` stores whole-VND rent exactly.
- `numeric(8,2)` stores square-metre area exactly to two decimal places.
- `double precision` coordinates work directly with PostgreSQL range and trigonometric operations.
- `timestamptz` represents absolute instants independent of display timezone.

## 8. Primary keys

Surrogate identity primary keys are used for `users`, `property_types`, `amenities`, `listings`, `listing_images`, and `moderation_history`.

Composite natural relationship keys are used for:

- `listing_amenities (listing_id, amenity_id)`
- `favorites (tenant_id, listing_id)`

No pure junction table receives an unnecessary surrogate key.

## 9. Foreign keys

Every relational reference uses a foreign key. PostgreSQL does not create indexes automatically for referencing foreign-key columns, so required child-side access paths are provided through primary, unique, or explicit indexes where justified by MVP queries.

Role-qualified relationships are not modeled using redundant role columns. For example, `listings.landlord_id` references `users.id`, and the service verifies on listing creation that the referenced user is an active landlord. Later account deactivation does not invalidate the foreign key, change ownership, or change listing status.

## 10. Unique constraints

Unique constraints are:

- `users.email`
- `property_types.code`
- `property_types.label`
- `amenities.code`
- `amenities.label`
- `listing_images.cloudinary_public_id`
- `listing_images (listing_id, display_order)`, deferrable
- The composite primary key of `listing_amenities`
- The composite primary key of `favorites`

Phone numbers are deliberately not unique because they are contact data rather than authentication identifiers.

## 11. NOT NULL strategy

Identity, relationship, status, authentication, lookup, audit, and timestamp fields are `NOT NULL`.

The listing content fields that landlords may complete progressively are nullable only while the listing is a draft. A table-level completeness check requires them once a listing leaves `DRAFT`.

Optional fields are limited to:

- `users.phone_e164` for tenants and admins
- Draft listing content fields
- `listing_images.alt_text`
- `moderation_history.reason` for approval and restoration actions

## 12. Check constraints

Check constraints enforce stable row-local invariants:

- Normalized, nonempty email.
- E.164-style phone format and mandatory landlord phone.
- Controlled lookup-code format and nonempty labels.
- Nonempty listing strings when present.
- Description maximum length.
- Positive rent and room area.
- Valid coordinate ranges and coordinate-pair consistency.
- Complete scalar listing data outside `DRAFT`.
- HTTPS image URL, positive image dimensions, five-megabyte maximum, and display slots 1 through 8.
- Valid moderation transition pairs and required rejection/hiding reasons.

Checks do not query other tables. Cross-table and transition-context rules remain in checked service transactions.

## 13. Default values

Defaults are:

- `users.is_active = true`
- `property_types.is_active = true`
- `amenities.is_active = true`
- `listings.status = 'DRAFT'`
- Every `created_at = CURRENT_TIMESTAMP`
- Every `updated_at = CURRENT_TIMESTAMP` on insertion
- Optional nullable fields default to `NULL`

`updated_at` does not update automatically. Repositories set it explicitly on meaningful mutations.

## 14. Foreign-key delete and update behavior

| Foreign key | `ON DELETE` | `ON UPDATE` | Rationale |
|---|---|---|---|
| `listings.landlord_id -> users.id` | `RESTRICT` | `RESTRICT` | Preserve listing ownership |
| `listings.property_type_id -> property_types.id` | `RESTRICT` | `RESTRICT` | Retire referenced values rather than delete them |
| `listing_images.listing_id -> listings.id` | `CASCADE` | `RESTRICT` | Image metadata has no meaning without a listing |
| `listing_amenities.listing_id -> listings.id` | `CASCADE` | `RESTRICT` | Relationship has no meaning without a listing |
| `listing_amenities.amenity_id -> amenities.id` | `RESTRICT` | `RESTRICT` | Retire referenced amenities rather than delete them |
| `favorites.tenant_id -> users.id` | `CASCADE` | `RESTRICT` | Favorite has no meaning without its tenant |
| `favorites.listing_id -> listings.id` | `CASCADE` | `RESTRICT` | Favorite has no meaning without its listing |
| `moderation_history.listing_id -> listings.id` | `RESTRICT` | `RESTRICT` | Preserve authoritative audit history |
| `moderation_history.admin_id -> users.id` | `RESTRICT` | `RESTRICT` | Preserve the moderation actor |

Primary-key values are immutable; cascaded key updates are neither needed nor permitted.

## 15. Relationships and cardinalities

- One user with landlord role may own zero or many listings; every listing has exactly one user owner.
- One property type may classify zero or many listings; every non-draft listing has exactly one property type.
- One listing may have zero to eight images; every image belongs to exactly one listing.
- Listings and amenities are many-to-many through `listing_amenities`.
- Tenant users and listings are many-to-many through `favorites`.
- One listing may have zero or many moderation-history rows.
- One admin user may be the actor for zero or many moderation-history rows.

The database guarantees the relational cardinality. The service guarantees the required actor roles.

## 16. Normalization rationale

The design is in a practical third normal form:

- Authentication and contact data are stored once on `users`.
- Listing rows reference their landlord rather than duplicating phone or email.
- Property types and amenities are controlled independently.
- Multiple images are individual ordered rows rather than repeated listing columns or JSON.
- Many-to-many relationships use junction tables.
- Moderation reasons exist only in the immutable event that produced them.
- Rounded coordinates and calculated distance are derived and are not stored.
- Currency and rental period are uniform MVP rules and are not repeated on every row.

No relational arrays or JSON documents are used to represent relationships.

## 17. Controlled-value strategy

Roles and statuses use enums because they are stable workflow semantics.

Property types and amenities use lookup tables because they are selectable catalog data. Their codes are stable machine identifiers, labels are the approved English display values, and `is_active` controls whether they may be used in new listing changes. Existing references remain valid after a value is retired.

The service must reject newly selecting an inactive property type or amenity. Existing listings may continue to reference retired values so historical and current listing data remain interpretable.

## 18. Listing lifecycle implications

The schema stores only the current listing status and content. Legal transitions are:

| Current | Action | Next | Actor |
|---|---|---|---|
| `DRAFT` | Submit complete listing | `PENDING` | Owner landlord |
| `DRAFT` with no moderation history | Permanently delete | Deleted | Owner landlord |
| `PENDING` | Approve | `APPROVED` | Admin |
| `PENDING` | Reject with reason | `REJECTED` | Admin |
| `REJECTED` | Edit rejected content | `DRAFT` | Owner landlord |
| `DRAFT` after rejection | Resubmit | `PENDING` | Owner landlord |
| `APPROVED` | Significant edit | `PENDING` | Owner landlord |
| `APPROVED` | Deactivate | `INACTIVE` | Owner landlord |
| `APPROVED` | Hide with reason | `HIDDEN` | Admin |
| `INACTIVE` | Reactivate unchanged | `APPROVED` | Owner landlord |
| `INACTIVE` | Significant content edit | `PENDING` | Owner landlord |
| `HIDDEN` | Explicitly submit for review | `PENDING` | Owner landlord |
| `HIDDEN` | Restore | `APPROVED` | Admin |

The `listing_status` enum prevents unknown statuses, but transition legality is enforced by the listings service because an ordinary check constraint cannot compare an old row with its new version.

Significant edits update content in place. The service applies these state rules:

- `DRAFT` remains `DRAFT`.
- `REJECTED` changes to `DRAFT`.
- `PENDING` remains `PENDING`.
- `APPROVED` changes to `PENDING`.
- `INACTIVE` changes immediately to `PENDING` in the same checked transaction as the content edit.
- `HIDDEN` remains `HIDDEN` during remediation and changes to `PENDING` only through explicit landlord resubmission.
- `HIDDEN` may change directly to `APPROVED` through an authorized admin restoration action.

Explicit landlord submission is sufficient for `HIDDEN -> PENDING`. The service does not need to prove that hidden content changed because the schema intentionally has no revision marker or approved snapshot. The listing remains non-public and must pass admin review again.

Significant content includes title, description, monthly rent, property type, room area, `address_text`, `area_name`, latitude, longitude, amenities, and adding or deleting an image. A UI-level image replacement is represented by those separate add/delete operations and is therefore significant. Image reordering alone is not significant.

An inactive listing may return directly to `APPROVED` because, by invariant, a listing that is still `INACTIVE` has not received a significant content edit since deactivation. Any significant edit has already changed its status to `PENDING` in the same checked transaction.

A request that produces no normalized content change is a no-op and must not cause a status transition. No content marker, revision counter, approved snapshot, trigger, or listing revision table is used.

## 19. Draft completeness strategy

A draft may be created before all content or coordinates exist, allowing progressive entry, image uploads, geocoding failure recovery, and manual coordinate selection.

Nullable draft fields are:

- `property_type_id`
- `title`
- `description`
- `monthly_rent`
- `room_area_sqm`
- `address_text`
- `area_name`
- `latitude`
- `longitude`

When status is not `DRAFT`, `ck_listings_non_draft_complete` requires every field above. Separate checks ensure present values are valid.

Blank strings are not missing-value markers. Request handling normalizes blank optional draft inputs to null, while database checks reject blank stored strings.

Image minimum is intentionally not part of scalar completeness because a row check cannot safely assert the existence of child rows.

## 20. Listing image integrity rules

- A draft may have zero through eight images.
- A listing cannot have more than eight image rows because display slots are restricted to 1 through 8 and unique per listing.
- Submission from `DRAFT` to `PENDING` requires at least one persisted image.
- The minimum-one-image rule is checked by the service in the submission transaction.
- Images must not exceed 5 MiB (`5242880` bytes).
- Uploads accept only `image/jpeg`, `image/png`, and `image/webp`.
- Width and height must be positive.
- The stored delivery URL must use HTTPS.
- Cloudinary public identifiers are globally unique in the application database.
- Reordering uses the deferrable listing/order unique constraint.
- Adding or removing an image is a significant edit and follows the lifecycle state rules, including immediate `INACTIVE -> PENDING` transition in the same checked transaction.
- Reordering the same image rows is not a significant edit and causes no status transition.
- MIME-type validation and provider validation remain upload-service concerns; the existing normalized `format` metadata column does not require a schema change.

The MVP has no dedicated atomic image-replacement API, provider operation, or database transaction. The UI composes a replacement from the existing upload and delete operations. With fewer than eight images, it may upload the new image before deleting the old one. With exactly eight images, it may delete the old image first and then upload the new one. Each completed operation must independently respect the maximum of eight images and the rule that a non-draft listing retains at least one image.

Cloudinary and PostgreSQL cannot share a transaction. If Cloudinary upload succeeds but database persistence fails, the service performs best-effort immediate asset removal and logs cleanup failure. Draft deletion must capture required Cloudinary identifiers before database cascading removes image metadata.

## 21. Favorites retention rules

- Only a tenant may create or remove their own favorite.
- A listing must satisfy the public visibility predicate when newly favorited: its status is `APPROVED` and its owning landlord is active.
- Duplicate favorites are prevented by the composite primary key.
- A favorite remains stored if its listing later becomes `PENDING`, `REJECTED`, `HIDDEN`, or `INACTIVE`.
- Favorite retrieval joins through `listings` to the owning `users` row and returns only listings whose status is `APPROVED` and whose landlord is active.
- If a listing later returns to `APPROVED`, or its inactive landlord is reactivated while it remains `APPROVED`, its retained favorite can reappear.
- Explicitly removing a favorite is a hard delete.

Status changes therefore do not destroy tenant preference data.

## 22. Moderation-history design

Moderation history records only admin moderation transitions:

- `PENDING -> APPROVED`
- `PENDING -> REJECTED`
- `APPROVED -> HIDDEN`
- `HIDDEN -> APPROVED`

Landlord lifecycle changes do not create moderation-history rows. The table is append-only, has no `updated_at`, and is protected from listing or admin deletion through restrictive foreign keys.

The current rejection or hiding reason is not duplicated on `listings`. When a listing is currently `REJECTED` or `HIDDEN`, the service retrieves the latest applicable row using:

```text
WHERE listing_id = requested listing
  AND new_status = current listing status
ORDER BY created_at DESC, id DESC
LIMIT 1
```

The identifier is a deterministic tie-breaker when events share a transaction timestamp.

The listing status update and moderation-history insert must occur in the same PostgreSQL transaction and either both commit or both roll back.

## 23. Coordinate and location-storage strategy

Listings store exact `latitude` and `longitude` as `double precision`.

Coordinates may both be null on an incomplete draft. They must both exist when a listing is not a draft. Range checks enforce valid latitude and longitude.

Exact coordinates are used for:

- Map-area candidate filtering.
- Radius-search bounding boxes.
- Haversine distance calculation.
- Owner editing.
- Admin moderation.

The database does not store:

- Rounded public coordinates.
- Geohashes.
- Calculated distance.
- Geometry or geography columns.

### 23.1 Public visibility query rule

Public visibility is a cross-table query rule, not a listing column:

```text
listings.status = 'APPROVED'
AND users.is_active = true
```

Here `users` is the owning landlord row joined through `listings.landlord_id`. The predicate applies identically to public listing search, public listing detail, map-bound search, radius search, and tenant favorites retrieval.

Deactivating a landlord changes only `users.is_active`; it does not change owned listing statuses or create a moderation-history event. Reactivating the account makes any listings that are still `APPROVED` visible again. This behavior requires no new column, table, or dedicated index.

## 24. Bounding-box and Haversine schema implications

The initial MVP deployment region is Ho Chi Minh City, Vietnam. The maximum accepted radius is configuration-driven with an approved value of 50 kilometres, for example `MAX_SEARCH_RADIUS_KM=50`. The region and radius limit add no database relationship, lookup table, column, or index.

The radius-search sequence is:

1. Validate center coordinates, radius, supported region, filters, and pagination.
2. Calculate the bounding box in TypeScript.
3. In PostgreSQL, join the owning `users` row and restrict candidates to `listings.status = 'APPROVED' AND users.is_active = true`.
4. Apply exact latitude and longitude range predicates.
5. Apply price, area, property-type, and amenity filters.
6. Calculate Haversine distance for the reduced candidate set.
7. Retain rows with `distance_km <= requested radius`.
8. Order by `distance_km`, then `listing id`.
9. Apply pagination.

Use mean Earth radius `6371.0088 km`. Conceptually:

```text
a =
  power(sin(radians(latitude - center_latitude) / 2), 2)
  + cos(radians(center_latitude))
    * cos(radians(latitude))
    * power(sin(radians(longitude - center_longitude) / 2), 2)

distance_km =
  2 * 6371.0088 * asin(sqrt(least(1.0, a)))
```

Clamping the intermediate value prevents a floating-point value slightly above 1.0 from producing an `asin` domain error.

The Haversine expression belongs in one parameterized repository query, not multiple endpoint implementations or a stored generated column. The supported single-region MVP excludes polar and international-date-line cases.

## 25. Address and location privacy strategy

`address_text` contains the exact internal address. It is available only to the listing owner, authorized admins, and backend operations that require it. Tenant and anonymous query projections should avoid selecting it rather than selecting and later removing it.

`area_name` contains normalized, free-form, public-safe approximate location text. Public search primarily uses `title` and `area_name`. The MVP does not introduce district or ward lookup tables.

Tenant and anonymous listing/map responses receive coordinates rounded deterministically to three decimal places. Rounding happens during API response mapping and is never persisted. Distance may be calculated from exact coordinates even when the displayed marker is approximate.

Landlord contact fields are likewise omitted from anonymous responses, listing cards, search results, map markers, and public metadata. An authenticated tenant may receive contact data only on the detail of a listing that satisfies the public visibility predicate.

## 26. Money-storage strategy

The MVP uses VND and monthly rent only.

`monthly_rent numeric(12,0)` stores exact whole-VND amounts up to twelve digits. A row check requires a positive value when present. No `currency` or `rental_period` column is added because both values are uniform system-wide MVP rules.

PostgreSQL may coerce fractional numeric input to the declared zero scale, so request validation must reject fractional rent before the value reaches SQL.

The `pg` client normally returns PostgreSQL `numeric` values as strings. Repository mapping must handle this deliberately. A twelve-digit positive value is within JavaScript's safe integer range if the application chooses controlled numeric conversion.

## 27. Timestamp strategy

- All timestamps use `timestamptz`.
- Each `created_at` defaults to `CURRENT_TIMESTAMP`.
- Each `updated_at` defaults to `CURRENT_TIMESTAMP` on insert.
- Repositories explicitly set `updated_at = CURRENT_TIMESTAMP` on meaningful updates.
- No generic timestamp trigger is used.
- Timestamps represent UTC instants even though PostgreSQL renders them using the current session timezone.
- The application should use a UTC database/session convention.
- API responses serialize timestamps as ISO-8601 UTC values.
- Immutable relationship/event rows receive only timestamps with product meaning.

## 28. Delete and retention strategy

- Users are deactivated with `is_active = false`; normal MVP workflows do not hard-delete users.
- Deactivating a landlord does not change any owned listing status and does not create a moderation-history row. It suppresses those listings from public and tenant-facing query results. Reactivation makes any still-`APPROVED` listings visible again.
- Only the owning landlord may permanently delete a listing whose current status is `DRAFT` and for which no `moderation_history` row exists.
- `PENDING`, `APPROVED`, `REJECTED`, `HIDDEN`, and `INACTIVE` are retained lifecycle records.
- A rejected listing may return to `DRAFT` through editing, but it cannot be hard-deleted because its rejection history remains authoritative.
- `INACTIVE` and `HIDDEN` are not soft-delete flags.
- Listings do not have `deleted_at`.
- Eligible draft deletion cascades database image metadata and listing-amenity rows.
- Lookup values are retired with `is_active = false`.
- Explicit favorite removal is a hard delete.
- Moderation history is never deleted or modified through normal application workflows.

Remote Cloudinary asset cleanup remains an external best-effort operation and is not guaranteed by PostgreSQL cascades.

## 29. Database-enforced rules

PostgreSQL enforces:

- Email presence, normalization, and uniqueness.
- Landlord phone presence.
- E.164-style phone format when present.
- Valid role and listing-status enum values.
- Controlled lookup-code format and uniqueness.
- Positive monthly rent and room area.
- Coordinate ranges and coordinate-pair consistency.
- Required scalar completeness outside `DRAFT`.
- All foreign-key relationships.
- Duplicate favorite and amenity prevention.
- Maximum eight image slots.
- Unique Cloudinary public identifiers.
- Valid moderation-history transition pairs.
- Nonempty rejection and hiding reasons.
- Approved field length limits.

## 30. Service and application-enforced rules

The Express service layer enforces:

- Email syntax validation before persistence.
- bcrypt hashing and password verification.
- Email-only login.
- Login-email immutability through MVP profile workflows.
- Public admin registration prevention.
- User role immutability.
- Active-account checks for protected requests.
- Listing owners have active `LANDLORD` role.
- Favorite owners have active `TENANT` role.
- Moderation actors have active `ADMIN` role.
- Only active property types and amenities may be newly selected.
- Ownership and authorization.
- Minimum one image before submission.
- Valid listing lifecycle transitions.
- Significant edits trigger re-moderation.
- Significant content edits apply the approved state transition in the same checked transaction, including immediate `INACTIVE -> PENDING`.
- No-op updates that produce no normalized content change do not cause a state transition.
- Hard deletion requires an owned `DRAFT` with no moderation-history rows; an ineligible draft returns `409 Conflict` with `LISTING_DELETE_NOT_ALLOWED`.
- Validation of the approved image MIME types (`image/jpeg`, `image/png`, and `image/webp`) and Cloudinary coordination.
- Moderation update and history insertion are atomic.
- Public listing visibility requires both `listings.status = 'APPROVED'` and an active owning landlord.
- Favorites retrieval applies the same listing-status and landlord-activity predicate.
- Contact, exact-address, and exact-coordinate privacy projections.
- VND rent input is an integer before database coercion.

Triggers are not introduced merely to move these workflow rules into PostgreSQL.

## 31. Transaction and concurrency requirements

Every multi-write workflow uses one checked-out `pg` client from `BEGIN` through `COMMIT` or `ROLLBACK`.

### Listing submission

Submission must:

1. Begin a transaction.
2. Lock the listing with `SELECT ... FOR UPDATE`.
3. Verify owner, active landlord role, and expected `DRAFT` status.
4. Verify scalar completeness and controlled-value activity.
5. Count persisted image rows and require at least one.
6. Update status to `PENDING` with an expected-status predicate.
7. Update `updated_at`.
8. Commit.

### Draft deletion

Hard deletion must:

1. Authenticate an active landlord and begin a transaction.
2. Lock the owned listing with `SELECT ... FOR UPDATE`.
3. Require the current status to be `DRAFT`.
4. Require that no `moderation_history` row exists for the listing; otherwise roll back and return `409 Conflict` with `LISTING_DELETE_NOT_ALLOWED`.
5. Capture the listing's Cloudinary public identifiers before deleting database rows.
6. Delete the listing, allowing existing cascades to remove child image metadata, listing-amenity rows, and any other dependent rows configured with `ON DELETE CASCADE`.
7. Commit.
8. Attempt Cloudinary asset cleanup after commit. Cleanup failure is logged and does not reverse or change the successful deletion response.

The unchanged `moderation_history.listing_id` foreign key remains `ON DELETE RESTRICT` as a final integrity backstop. Moderation-history rows are never deleted to make a listing eligible.

### Image mutation versus submission

Image add, delete, and reorder operations lock the same listing row used by submission. This serializes image-count changes against submission. Reordering defers the listing/order unique constraint and must finish with unique slots.

An image content mutation, generic `updated_at` update, and any required status change occur in the same database transaction. An image content mutation on an `INACTIVE` listing changes it to `PENDING` immediately. Image reordering causes no status transition. Cloudinary operations remain outside PostgreSQL atomicity and require documented compensation.

There is no atomic replacement workflow. A UI-level replacement executes one upload and one delete as separate operations, in the count-dependent order documented in the image integrity rules.

### Moderation

Moderation must:

1. Begin a transaction using one checked-out client.
2. Lock the listing row.
3. Verify active admin role and the expected current status.
4. Validate the transition and required reason.
5. Update listing status and `updated_at`.
6. Insert the matching `moderation_history` row.
7. Commit both changes or roll back both.

### Other state changes

Significant edits, amenity changes, deactivation, reactivation, hidden remediation, and resubmission use row locks or conditional updates with the expected prior status. Significant content edits apply their required state transition in the same transaction. In particular, an `INACTIVE` listing changes to `PENDING` immediately when significant content changes; direct reactivation is safe because the state machine has already moved every significantly edited inactive record to `PENDING`. A stale or concurrent transition must affect zero rows and return a conflict rather than overwrite newer state.

## 32. Final index strategy

Primary keys and unique constraints create their own indexes. Add only these explicit indexes:

| Index | Definition | Purpose |
|---|---|---|
| `idx_listings_status_updated_at` | `listings (status, updated_at DESC, id DESC)` | Status views and moderation queue |
| `idx_listings_landlord_updated_at` | `listings (landlord_id, updated_at DESC, id DESC)` | Owner listing retrieval |
| `idx_listings_approved_monthly_rent` | `listings (monthly_rent, id) WHERE status = 'APPROVED'` | Public price filtering |
| `idx_listings_approved_property_type` | `listings (property_type_id, id) WHERE status = 'APPROVED'` | Public property-type filtering |
| `idx_listings_approved_room_area` | `listings (room_area_sqm, id) WHERE status = 'APPROVED'` | Public room-area filtering |
| `idx_listings_approved_latitude` | `listings (latitude, id) WHERE status = 'APPROVED'` | Latitude bounding-box range |
| `idx_listings_approved_longitude` | `listings (longitude, id) WHERE status = 'APPROVED'` | Longitude bounding-box range |
| `idx_listing_amenities_amenity_listing` | `listing_amenities (amenity_id, listing_id)` | Amenity-to-listing filtering |
| `idx_favorites_tenant_created_at` | `favorites (tenant_id, created_at DESC, listing_id DESC)` | Newest-saved-first tenant retrieval |
| `idx_moderation_history_listing_created_at` | `moderation_history (listing_id, created_at DESC, id DESC)` | Listing history and latest reason |

The separate approved latitude and longitude indexes allow PostgreSQL to consider bitmap index combination for bounding-box candidates. They are not a replacement for a spatial index.

Public repository SQL must use the explicit predicate `status = 'APPROVED'` so PostgreSQL can recognize the partial indexes.

Public and tenant-facing queries additionally join `users` on the listing owner and require `users.is_active = true`. The landlord row is reached through its primary key, and the expected MVP workload does not justify an `is_active` index or any new listing column/index solely for this rule.

Do not initially add:

- Phone, user-role, or `is_active` indexes.
- Title or `area_name` B-tree indexes.
- A reverse favorites index.
- A moderation-history-by-admin index.
- `pg_trgm` or full-text search indexes.
- PostGIS indexes.

Substring `ILIKE` search over `title` and `area_name` may use a sequential scan for the expected small MVP dataset. Search indexing is reconsidered only after measurement.

## 33. Naming conventions

- Tables: plural lowercase names, for example `listing_images`.
- Columns: singular lowercase names, for example `listing_id`.
- Foreign keys: `<referenced_entity>_id`.
- Timestamps: descriptive `_at` suffix.
- Units: included in names where ambiguity matters.
- Enum values and controlled codes: uppercase `SNAKE_CASE`.
- Primary keys: `pk_<table>`.
- Foreign keys: `fk_<child_table>_<relationship>`.
- Unique constraints: `uq_<table>_<columns>`.
- Checks: `ck_<table>_<rule>`.
- Indexes: `idx_<table>_<purpose>`.

Names should remain below PostgreSQL's 63-byte identifier limit.

## 34. Database risks and trade-offs

| Risk or decision | Trade-off and mitigation |
|---|---|
| PostgreSQL enums | Strong value integrity but changes require migrations. Roles and statuses are stable enough for this trade-off. |
| Incomplete drafts | Nullable content is necessary for progressive entry. A non-draft completeness check prevents publication-state incompleteness. |
| Service-enforced role relationships | Ordinary foreign keys cannot ensure a referenced user's role. Centralize checks in services and test them. |
| Service-enforced transitions | Checks cannot compare old and new rows without triggers. Use row locks, expected-status predicates, and centralized services. |
| No revision table | Significant edits temporarily remove approved listings from public results. This is the approved simplicity trade-off. |
| Exact private data in database | A careless query could expose exact address, coordinates, or contact data. Use narrow role-specific SQL projections and explicit response mapping. |
| B-tree coordinate indexes | Adequate for a small single-region dataset but not true spatial indexing. Use bounding boxes, limits, and pagination. |
| Haversine CPU cost | Apply it only after bounding-box and other filters. Verify the shared expression with known coordinate pairs. |
| Partial approved indexes | Queries must contain a planner-recognizable approved-status predicate. Public repository SQL uses the literal predicate. |
| No trigram/full-text index | Substring search may eventually become slow. The MVP dataset is expected to remain small; measure before adding an extension. |
| Application-managed `updated_at` | Repositories must consistently update it. Tests should verify update paths rather than adding a trigger. |
| Cloudinary/database consistency | External assets and PostgreSQL cannot share a transaction. Use best-effort cleanup and structured logging. |
| `numeric` mapping | `pg` returns numeric as text by default. Repositories must map the twelve-digit VND value deliberately. |
| Retained non-public favorites | Hidden favorites remain stored. Retrieval must always join against current approved status and active-landlord visibility. |

## 35. Future PostGIS upgrade considerations

PostGIS is not part of Database Design v1.

If listing volume, request volume, geographic coverage, or polygon-search requirements outgrow bounding-box plus Haversine:

1. Enable PostGIS through a versioned migration.
2. Add a `geometry(Point, 4326)` or `geography(Point, 4326)` column after choosing the intended distance semantics.
3. Backfill it from exact longitude and latitude.
4. Add an appropriate GiST or SP-GiST spatial index.
5. Replace repository Haversine SQL with tested PostGIS distance predicates.
6. Preserve API coordinate rounding and address privacy.
7. Retire old coordinate indexes only after query equivalence and performance are verified.

The direct latitude and longitude columns provide a clear migration source. No PostGIS compatibility scaffolding is required in the MVP.

## 36. Final text-based ERD

```text
USERS
  PK  id
      role
  UQ  email
      phone_e164
      password_hash
      is_active
      created_at
      updated_at
   |
   | 1
   | owns
   | N
   +------------------------------< LISTINGS
   |                                  PK  id
   |                                  FK  landlord_id -> USERS.id
   |                                  FK  property_type_id -> PROPERTY_TYPES.id
   |                                      status
   |                                      title
   |                                      description
   |                                      monthly_rent
   |                                      room_area_sqm
   |                                      address_text
   |                                      area_name
   |                                      latitude
   |                                      longitude
   |                                      created_at
   |                                      updated_at
   |                                       |
   |                       +---------------+-------------------+
   |                       | 1             | 1                 | 1
   |                       |               |                   |
   |                       | N             | N                 | N
   |                       v               v                   v
   |                 LISTING_IMAGES   LISTING_AMENITIES   MODERATION_HISTORY
   |                   PK id           PK/FK listing_id     PK id
   |                   FK listing_id   PK/FK amenity_id     FK listing_id
   |                   UQ public_id                         FK admin_id
   |                   UQ listing/order                    previous_status
   |                                                       new_status
   |                                                       reason
   |                                                       created_at
   |                                                           ^
   |                                                           |
   | 1 admin                                                   | N actions
   +-----------------------------------------------------------+
   |
   | 1 tenant
   | N saved relationships
   v
FAVORITES >---------------------------------------------- LISTINGS
  PK/FK tenant_id                 N favorites : 1 listing   PK id
  PK/FK listing_id
        created_at

PROPERTY_TYPES
  PK id
  UQ code
  UQ label
     is_active
   |
   | 1
   | N
   +----------------------------------------------< LISTINGS

AMENITIES
  PK id
  UQ code
  UQ label
     is_active
   |
   | 1
   | N
   +--------------------------------------< LISTING_AMENITIES

N:M relationships:
  LISTINGS N:M AMENITIES through LISTING_AMENITIES
  TENANT USERS N:M LISTINGS through FAVORITES
```

This specification freezes the RentMate MVP relational design. The next database step may translate it into deterministic versioned SQL migrations without adding tables or making new schema decisions.
