# RM-053 Contract Inventory

## Endpoint contracts

Health GREEN = 1

V1 GREEN = 31

V1 YELLOW = 0

V1 RED = 0

Missing endpoint success coverage = none

Missing endpoint important-error coverage = none

| Contract | Method and path                                               | Success evidence                                               | Important-error evidence                                       |
| -------- | ------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| Health   | `GET /api/health`                                             | `test/app.test.ts`                                             | `test/app.test.ts`                                             |
| V1-01    | `POST /api/v1/auth/register/tenant`                           | `test/rm015-registration-http.integration.test.ts`             | `test/rm015-registration-http.integration.test.ts`             |
| V1-02    | `POST /api/v1/auth/register/landlord`                         | `test/rm015-registration-http.integration.test.ts`             | `test/rm015-registration-http.integration.test.ts`             |
| V1-03    | `POST /api/v1/auth/login`                                     | `test/rm016-login-http.integration.test.ts`                    | `test/rm016-login-http.integration.test.ts`                    |
| V1-04    | `POST /api/v1/auth/logout`                                    | `test/rm016-logout-http.integration.test.ts`                   | `test/rm016-logout-http.integration.test.ts`                   |
| V1-05    | `GET /api/v1/users/me`                                        | `test/rm017-users-http.integration.test.ts`                    | `test/rm017-users-http.integration.test.ts`                    |
| V1-06    | `PATCH /api/v1/users/me`                                      | `test/rm017-users-http.integration.test.ts`                    | `test/rm017-users-http.integration.test.ts`                    |
| V1-07    | `GET /api/v1/lookups/property-types`                          | `test/rm019-lookups-http.integration.test.ts`                  | No business-specific branch; frozen read-only contract         |
| V1-08    | `GET /api/v1/lookups/amenities`                               | `test/rm019-lookups-http.integration.test.ts`                  | No business-specific branch; frozen read-only contract         |
| V1-09    | `GET /api/v1/listings`                                        | `test/rm035-public-search-http.integration.test.ts`            | `test/rm038-public-discovery-http.integration.test.ts`         |
| V1-10    | `GET /api/v1/listings/:listingId`                             | `test/rm037-public-listing-detail-http.integration.test.ts`    | `test/rm038-public-discovery-http.integration.test.ts`         |
| V1-11    | `POST /api/v1/landlord/listings`                              | `test/rm020-listing-create-http.integration.test.ts`           | `test/rm020-listing-create-http.integration.test.ts`           |
| V1-12    | `GET /api/v1/landlord/listings`                               | `test/rm021-owner-listing-read-http.integration.test.ts`       | `test/rm021-owner-listing-read-http.integration.test.ts`       |
| V1-13    | `GET /api/v1/landlord/listings/:listingId`                    | `test/rm021-owner-listing-read-http.integration.test.ts`       | `test/rm021-owner-listing-read-http.integration.test.ts`       |
| V1-14    | `PATCH /api/v1/landlord/listings/:listingId`                  | `test/rm023-listing-update-http.integration.test.ts`           | `test/rm023-listing-update-http.integration.test.ts`           |
| V1-15    | `DELETE /api/v1/landlord/listings/:listingId`                 | `test/rm027-listing-delete-http.integration.test.ts`           | `test/rm027-listing-delete-http.integration.test.ts`           |
| V1-16    | `POST /api/v1/landlord/listings/:listingId/submit`            | `test/rm025-listing-submit-http.integration.test.ts`           | `test/rm025-listing-submit-http.integration.test.ts`           |
| V1-17    | `POST /api/v1/landlord/listings/:listingId/deactivate`        | `test/rm026-listing-lifecycle-action-http.integration.test.ts` | `test/rm026-listing-lifecycle-action-http.integration.test.ts` |
| V1-18    | `POST /api/v1/landlord/listings/:listingId/reactivate`        | `test/rm026-listing-lifecycle-action-http.integration.test.ts` | `test/rm026-listing-lifecycle-action-http.integration.test.ts` |
| V1-19    | `POST /api/v1/landlord/listings/:listingId/images`            | `test/rm029-listing-image-upload-http.integration.test.ts`     | `test/rm029-listing-image-upload-http.integration.test.ts`     |
| V1-20    | `DELETE /api/v1/landlord/listings/:listingId/images/:imageId` | `test/rm030-listing-image-delete-http.integration.test.ts`     | `test/rm030-listing-image-delete-http.integration.test.ts`     |
| V1-21    | `PUT /api/v1/landlord/listings/:listingId/images/order`       | `test/rm031-listing-image-order-http.integration.test.ts`      | `test/rm031-listing-image-order-http.integration.test.ts`      |
| V1-22    | `POST /api/v1/geocoding/forward`                              | `test/rm033-geocoding-http.integration.test.ts`                | `test/rm034-geocoding-http.integration.test.ts`                |
| V1-23    | `GET /api/v1/favorites`                                       | `test/rm039-favorite-http.integration.test.ts`                 | `test/rm040-favorite-http.integration.test.ts`                 |
| V1-24    | `PUT /api/v1/favorites/:listingId`                            | `test/rm039-favorite-http.integration.test.ts`                 | `test/rm040-favorite-http.integration.test.ts`                 |
| V1-25    | `DELETE /api/v1/favorites/:listingId`                         | `test/rm039-favorite-http.integration.test.ts`                 | `test/rm040-favorite-http.integration.test.ts`                 |
| V1-26    | `GET /api/v1/admin/listings`                                  | `test/rm041-admin-listing-read-http.integration.test.ts`       | `test/rm044-admin-authorization-http.integration.test.ts`      |
| V1-27    | `GET /api/v1/admin/listings/:listingId`                       | `test/rm041-admin-listing-read-http.integration.test.ts`       | `test/rm044-admin-authorization-http.integration.test.ts`      |
| V1-28    | `GET /api/v1/admin/listings/:listingId/moderation-actions`    | `test/rm041-admin-listing-read-http.integration.test.ts`       | `test/rm044-admin-authorization-http.integration.test.ts`      |
| V1-29    | `POST /api/v1/admin/listings/:listingId/moderation-actions`   | `test/rm042-moderation-action-http.integration.test.ts`        | `test/rm042-moderation-action-http.integration.test.ts`        |
| V1-30    | `GET /api/v1/admin/users`                                     | `test/rm043-admin-user-http.integration.test.ts`               | `test/rm043-admin-user-http.integration.test.ts`               |
| V1-31    | `PATCH /api/v1/admin/users/:userId/activation`                | `test/rm043-admin-user-http.integration.test.ts`               | `test/rm043-admin-user-http.integration.test.ts`               |

`test/rm053-contract-inventory.test.ts` executes the method/path, evidence-path, duplicate-ID, and checklist checks. RM-053 adds integration consistency rather than replacing owning endpoint tests.

## Database objects

The frozen database inventory is two enums and eight product tables:

- `user_role`: `TENANT`, `LANDLORD`, `ADMIN`
- `listing_status`: `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `HIDDEN`, `INACTIVE`
- `users`, `property_types`, `amenities`, `listings`, `listing_images`, `listing_amenities`, `favorites`, `moderation_history`

`backend/src/db/schema-verification/expected-schema.ts`, RM-005 through RM-008, and `test/rm053-fresh-backend.database.integration.test.ts` provide executable evidence for 53 columns, 52 named constraints, 10 explicit indexes, seeded lookups, controlled ADMIN provisioning, and clean bootstrap migrations 0001 through 0012.

Explicit indexes: `idx_listings_status_updated_at`, `idx_listings_landlord_updated_at`, `idx_listings_approved_monthly_rent`, `idx_listings_approved_property_type`, `idx_listings_approved_room_area`, `idx_listings_approved_latitude`, `idx_listings_approved_longitude`, `idx_listing_amenities_amenity_listing`, `idx_favorites_tenant_created_at`, and `idx_moderation_history_listing_created_at`.

## Authorization/activity/ownership

`test/rm053-authorization-matrix.test.ts` verifies anonymous, active and inactive TENANT, owning and non-owning LANDLORD, inactive LANDLORD, ADMIN, wrong-role, malformed/invalid/expired session, and unsafe-Origin behavior. RM-013/RM-018/RM-044 retain exhaustive middleware and activity evidence.

## Privacy projections

The fresh scenario uses one listing across public summary, anonymous detail, active-tenant enriched detail, favorites summary, owner detail, and admin detail. `test/rm053-fresh-backend.database.integration.test.ts` asserts public allowlists and absence of exact address, provider identifiers, landlord data, moderation data, hashes, and raw database field names. RM-037/RM-038 retain endpoint-specific privacy coverage.

## Lifecycle/visibility/favorites

`test/rm053-fresh-backend.database.integration.test.ts` proves that landlord account activation changes only visibility: the listing remains APPROVED, moderation history and the favorite row remain unchanged, and ordinary/bounds/radius/detail/favorites suppress then restore the same listing.

`test/rm053-lifecycle-visibility.database.integration.test.ts` proves APPROVE → HIDE → RESTORE, normalized no-op PATCH, image reorder, APPROVED significant edit → PENDING, re-approval, and favorite-row retention. RM-024 through RM-028, RM-031, RM-040, and RM-044 retain exhaustive lifecycle ownership and edge coverage.

## Concurrency

RM-028 runs competing listing PATCH/action and hard-delete races. RM-032 runs maximum-image and stale reorder races. RM-044 runs competing moderation-admin transitions. RM-053 adds no duplicate concurrency file.

## Rollback

RM-028 covers listing create/PATCH/action rollback and transaction-client release. RM-032 covers image upload/delete/reorder and provider compensation rollback. RM-042 covers moderation atomicity. Migration/provisioning rollback evidence remains in RM-005 through RM-008.

## Numeric mapping/search

The fresh scenario asserts JSON numbers for `monthlyRent`, `roomAreaSqm`, `latitude`, `longitude`, and radius `distanceKm`, using ordinary, bounds, and radius search against the configured deployment region. RM-035/RM-036/RM-038 remain the owning search and privacy evidence.

## Cloudinary/Nominatim

The RM-053 fixture injects recording Cloudinary and Nominatim clients. The fresh scenario exercises representative image upload and forward geocoding without a live provider. RM-032 and RM-034 retain exhaustive provider success/failure evidence.

## Verification commands

Run `npm.cmd run test:rm053` for the ordinary inventory, authorization, and isolation suite. With a guarded process-local `TEST_DATABASE_URL` targeting `rentmate_test_rm053`, run `npm.cmd run test:rm053:database` for the two serialized real-PostgreSQL scenarios. Historical migration, RM-008, and full database suites supply the re-run evidence referenced above.
