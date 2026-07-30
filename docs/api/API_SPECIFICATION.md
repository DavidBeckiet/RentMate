# RentMate MVP API Specification v1

## 1. Purpose and scope

This document is the authoritative HTTP contract for the RentMate MVP. It freezes the API required by the approved Requirements, Architecture, and Database Design specifications.

The contract covers authentication, current-user contact data, controlled lookups, public listing discovery, landlord listing management, listing images, forward geocoding, tenant favorites, admin moderation, moderation history, and basic tenant/landlord account activation.

RentMate remains a single Express/TypeScript modular monolith serving a Next.js frontend. PostgreSQL is the authoritative application database. Cloudinary and Nominatim are external integration clients. No endpoint in this specification implies an additional service, database table, or product feature.

## 2. Base path and versioning

- All MVP product endpoints use `/api/v1`.
- Health remains the unversioned `GET /api/health`.
- Breaking contract changes require a future API version. Additive implementation fixes that preserve this contract do not.
- Normal JSON fields use `camelCase`.
- Database `snake_case` names are internal and must not leak into API responses.
- Roles, listing statuses, moderation actions, and controlled lookup codes use uppercase `SNAKE_CASE`.
- Timestamps are ISO-8601 UTC strings, for example `2026-07-29T08:30:00.000Z`.

## 3. Authentication and cookie behavior

### 3.1 Login identity

- Every account requires email.
- Email is trimmed, lowercased, and used as the only login identifier.
- Email is immutable through all MVP APIs.
- Public registration is available only for `TENANT` and `LANDLORD`.
- `ADMIN` accounts are provisioned outside the public API.
- Phone is not a login identifier and is not unique.
- Landlord phone is required. Tenant phone is optional.

### 3.2 Passwords

- Minimum: 8 characters.
- Maximum: 72 UTF-8 bytes before bcrypt hashing.
- Passwords and password hashes never appear in responses, errors, or logs.

### 3.3 JWT cookie

The authentication cookie is named `rentmate_session`.

| Attribute | Value |
|---|---|
| Token | Signed JWT |
| Lifetime | 2 hours |
| `HttpOnly` | `true` |
| `SameSite` | `Lax` |
| `Secure` | `true` in production; `false` only for local HTTP development |
| `Path` | `/` |
| `Domain` | Omitted, preserving host-only behavior |

The JWT contains only the user identifier, role, issued-at time, and expiry required by the MVP. The JWT is never returned in JSON. Registration and login set the same cookie. Logout clears it using matching cookie attributes.

There are no refresh tokens or server-side session rows. The frontend sends `credentials: "include"`.

### 3.4 Registration session

Successful tenant or landlord registration creates the account and immediately creates the normal authenticated session. The `201 Created` response returns the user profile and sets `rentmate_session`.

### 3.5 Optional authentication on public routes

- No cookie: process anonymously.
- Valid JWT for a currently active `TENANT`: tenant-only enrichment may be returned where explicitly documented.
- Valid `LANDLORD` or `ADMIN`: return the ordinary public projection on public routes.
- Invalid or expired cookie: process anonymously.
- Cookie belonging to an inactive account: process anonymously.

Optional authentication must verify the JWT before using claims and must verify current account activity before returning tenant-only fields. Invalid optional authentication never unlocks private data.

Protected routes return `401 Unauthorized` when authentication is missing, invalid, expired, or belongs to an inactive account.

## 4. Authorization and resource-disclosure conventions

Authorization checks occur in this order where applicable:

1. Authenticate and confirm the account is active.
2. Confirm the required role.
3. Locate the resource using the authorized scope.
4. Confirm ownership and current lifecycle rules.

Frozen disclosure behavior:

- Missing authentication on a protected route: `401`.
- Authenticated user with the wrong role: `403` before private resource lookup.
- Unsafe request with an invalid or missing allowed `Origin`: `403`.
- Non-owner landlord requesting an owner-scoped listing or nested image: `404`.
- Public detail for a non-public listing: `404`.
- Favorite-add target that is not public: `404`.
- Admin attempt to activate or deactivate an `ADMIN`: `403`.

Owner-scoped `404` behavior deliberately avoids confirming whether another landlord's private resource exists.

## 5. Request and response conventions

### 5.1 Headers

- JSON requests use `Content-Type: application/json`.
- Image upload uses `multipart/form-data`.
- Unsafe methods (`POST`, `PUT`, `PATCH`, and `DELETE`) require an allowed `Origin`.
- Authenticated browser requests include the HttpOnly cookie automatically through `credentials: "include"`.

Unknown JSON body fields and unknown query parameters are rejected with `422`, unless an endpoint explicitly documents them.

### 5.2 Object success response

```json
{
  "data": {
    "id": 42
  }
}
```

### 5.3 Paginated success response

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "hasNextPage": false
  }
}
```

No total count is returned. Repositories request `pageSize + 1` rows to determine `hasNextPage`.

### 5.4 No-content response

A `204 No Content` response has no response body.

### 5.5 Normalization

- Strings are trimmed where leading/trailing whitespace has no meaning.
- Email is additionally lowercased.
- Blank nullable strings normalize to `null`.
- Controlled codes normalize to uppercase before validation.
- Search amenity duplicates may be deduplicated.
- Write-body amenity duplicates are rejected.
- An omitted PATCH field is unchanged.

## 6. Error format and HTTP status policy

### 6.1 Error envelope

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request contains invalid data.",
    "requestId": "req_7f3b2c",
    "details": [
      {
        "field": "monthlyRent",
        "code": "INVALID_VALUE",
        "message": "monthlyRent must be a positive whole VND amount."
      }
    ]
  }
}
```

`details` is optional and is used primarily for validation errors. Errors never echo passwords, JWTs, cookies, complete sensitive contact values, provider credentials, SQL, stack traces, or raw provider responses.

### 6.2 Status mapping

| Status | Contract use |
|---|---|
| `200` | Successful GET, login, PATCH, lifecycle action, image reorder, admin activation update, or geocoding |
| `201` | Registration, draft creation, image upload, or moderation-action creation |
| `204` | Logout, favorite PUT/DELETE, allowed listing deletion, or image deletion |
| `400` | Malformed JSON or malformed multipart syntax |
| `401` | Protected-route authentication missing, invalid, expired, or inactive |
| `403` | Wrong role, unsafe Origin failure, or attempt to manage `ADMIN` activation |
| `404` | Missing resource or deliberately undisclosed inaccessible resource |
| `409` | Duplicate email, invalid/stale transition, expected-state conflict, stale moderation, or forbidden moderated-draft deletion |
| `413` | Request or image payload too large |
| `415` | Unsupported actual image format or declared MIME/signature mismatch |
| `422` | Well-formed request failing validation or business-data constraints |
| `429` | Rate limit exceeded |
| `502` | Required Nominatim/Cloudinary operation failed before local success |
| `503` | Database or required local dependency unavailable |
| `500` | Unexpected internal failure |

Common application codes include:

- `VALIDATION_FAILED`
- `AUTHENTICATION_REQUIRED`
- `INVALID_CREDENTIALS`
- `FORBIDDEN`
- `RESOURCE_NOT_FOUND`
- `EMAIL_ALREADY_EXISTS`
- `INVALID_LISTING_TRANSITION`
- `CONCURRENT_MODIFICATION`
- `LISTING_DELETE_NOT_ALLOWED`
- `IMAGE_LIMIT_EXCEEDED`
- `LAST_IMAGE_REQUIRED`
- `UNSUPPORTED_IMAGE_TYPE`
- `RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`

## 7. Controlled values

### 7.1 Roles

```text
TENANT
LANDLORD
ADMIN
```

### 7.2 Listing statuses

```text
DRAFT
PENDING
APPROVED
REJECTED
HIDDEN
INACTIVE
```

### 7.3 Moderation actions

```text
APPROVE
REJECT
HIDE
RESTORE
```

### 7.4 Initial property-type codes

```text
ROOM
STUDIO
APARTMENT
HOUSE
DORMITORY
```

### 7.5 Initial amenity codes

```text
AIR_CONDITIONING
WIFI
FURNISHED
PRIVATE_BATHROOM
KITCHEN
REFRIGERATOR
WASHING_MACHINE
PARKING
ELEVATOR
SECURITY
BALCONY
PET_FRIENDLY
```

Lookup endpoints return only active catalog values. Existing listings may continue to display and be filtered by known retired values. Submission is not a new lookup selection, so an already-associated known value may remain after retirement and does not by itself prevent submission.

## 8. Shared data representations

Examples define field names and privacy boundaries. Nullable values appear as `null`; fields explicitly described as conditional are omitted when not authorized or not applicable.

### 8.1 User profile

```json
{
  "id": 17,
  "role": "LANDLORD",
  "email": "lan.nguyen@example.com",
  "phone": "+84901234567",
  "isActive": true,
  "createdAt": "2026-07-20T04:10:00.000Z",
  "updatedAt": "2026-07-29T07:15:00.000Z"
}
```

`phone` may be `null` for tenants and admins. Password data is never represented.

### 8.2 Property type

```json
{
  "code": "STUDIO",
  "label": "Studio"
}
```

### 8.3 Amenity

```json
{
  "code": "WIFI",
  "label": "Wi-Fi"
}
```

### 8.4 Public image

```json
{
  "url": "https://res.cloudinary.com/rentmate/image/upload/v1/listings/studio-101.webp",
  "altText": "Bright studio room with a window",
  "displayOrder": 1
}
```

Public images omit database image IDs and Cloudinary public IDs.

### 8.5 Owner/admin image

```json
{
  "id": 91,
  "url": "https://res.cloudinary.com/rentmate/image/upload/v1/listings/studio-101.webp",
  "format": "webp",
  "width": 1600,
  "height": 1200,
  "byteSize": 384210,
  "displayOrder": 1,
  "altText": "Bright studio room with a window",
  "createdAt": "2026-07-28T05:00:00.000Z"
}
```

Cloudinary public IDs remain internal even in owner/admin responses.

### 8.6 Public listing summary

```json
{
  "id": 42,
  "title": "Bright studio near Ben Thanh Market",
  "monthlyRent": 7500000,
  "roomAreaSqm": 28.5,
  "areaName": "Ben Thanh, District 1",
  "latitude": 10.772,
  "longitude": 106.698,
  "propertyType": {
    "code": "STUDIO",
    "label": "Studio"
  },
  "amenities": [
    {
      "code": "WIFI",
      "label": "Wi-Fi"
    }
  ],
  "coverImage": {
    "url": "https://res.cloudinary.com/rentmate/image/upload/v1/listings/studio-101.webp",
    "altText": "Bright studio room with a window",
    "displayOrder": 1
  },
  "updatedAt": "2026-07-29T07:15:00.000Z"
}
```

Radius results additionally include `distanceKm` as a non-negative JSON number. Public coordinates are rounded to the nearest `0.001` degree. Filtering and distance ordering still use exact stored coordinates.

When images exist, `coverImage` is the image with the smallest `displayOrder`. A public/non-draft listing normally has a cover image because non-draft listings must retain at least one image. Public cover-image objects use the public image representation and never expose image database IDs.

### 8.7 Public listing detail

Public detail contains every public-summary field except `coverImage`, plus:

```json
{
  "description": "Private furnished studio with natural light and secure entry.",
  "images": [
    {
      "url": "https://res.cloudinary.com/rentmate/image/upload/v1/listings/studio-101.webp",
      "altText": "Bright studio room with a window",
      "displayOrder": 1
    }
  ]
}
```

It never contains `addressText`, exact coordinates, landlord ID/contact data, moderation data, or provider metadata.

### 8.8 Active-tenant detail enrichment

Only a currently active `TENANT` viewing a public listing detail receives:

```json
{
  "landlordContact": {
    "email": "lan.nguyen@example.com",
    "phone": "+84901234567"
  }
}
```

The field is omitted for anonymous users, landlords, admins using the public route, invalid cookies, expired cookies, and inactive accounts.

### 8.9 Landlord owner listing summary

```json
{
  "id": 42,
  "status": "PENDING",
  "title": "Bright studio near Ben Thanh Market",
  "monthlyRent": 7500000,
  "areaName": "Ben Thanh, District 1",
  "propertyType": {
    "code": "STUDIO",
    "label": "Studio"
  },
  "coverImage": {
    "id": 91,
    "url": "https://res.cloudinary.com/rentmate/image/upload/v1/listings/studio-101.webp",
    "format": "webp",
    "width": 1600,
    "height": 1200,
    "byteSize": 384210,
    "displayOrder": 1,
    "altText": "Bright studio room with a window",
    "createdAt": "2026-07-28T05:00:00.000Z"
  },
  "currentModerationReason": null,
  "updatedAt": "2026-07-29T07:15:00.000Z"
}
```

Draft fields may be `null`. `coverImage` is `null` when the owner listing has no images; otherwise, it is the owner image with the smallest `displayOrder`. `currentModerationReason` is populated only when the current state is `REJECTED` or `HIDDEN`.

### 8.10 Landlord owner listing detail

```json
{
  "id": 42,
  "status": "DRAFT",
  "title": "Bright studio near Ben Thanh Market",
  "description": "Private furnished studio with natural light and secure entry.",
  "monthlyRent": 7500000,
  "roomAreaSqm": 28.5,
  "addressText": "101 Example Street, Ben Thanh Ward, District 1, Ho Chi Minh City",
  "areaName": "Ben Thanh, District 1",
  "latitude": 10.772341,
  "longitude": 106.697912,
  "propertyType": {
    "code": "STUDIO",
    "label": "Studio"
  },
  "amenities": [],
  "images": [],
  "currentModerationReason": null,
  "createdAt": "2026-07-28T04:30:00.000Z",
  "updatedAt": "2026-07-29T07:15:00.000Z"
}
```

Owner detail uses exact coordinates and owner/admin image representations. Nullable draft fields are represented as `null`.

### 8.11 Admin listing summary

```json
{
  "id": 42,
  "status": "PENDING",
  "title": "Bright studio near Ben Thanh Market",
  "areaName": "Ben Thanh, District 1",
  "landlord": {
    "id": 17,
    "email": "lan.nguyen@example.com",
    "phone": "+84901234567",
    "isActive": true
  },
  "updatedAt": "2026-07-29T07:15:00.000Z"
}
```

### 8.12 Admin listing detail

Admin detail contains the owner listing detail plus:

```json
{
  "landlord": {
    "id": 17,
    "role": "LANDLORD",
    "email": "lan.nguyen@example.com",
    "phone": "+84901234567",
    "isActive": true
  }
}
```

Admin detail may expose exact address, exact coordinates, owner/admin image metadata, and the applicable current moderation reason. Full history is retrieved from the moderation-action collection.

### 8.13 Moderation history item

```json
{
  "id": 301,
  "listingId": 42,
  "adminId": 3,
  "previousStatus": "PENDING",
  "newStatus": "REJECTED",
  "reason": "The public area description does not match the submitted address.",
  "createdAt": "2026-07-29T08:20:00.000Z"
}
```

### 8.14 Geocoding candidate

```json
{
  "displayName": "Ben Thanh Ward, District 1, Ho Chi Minh City, Vietnam",
  "latitude": 10.772341,
  "longitude": 106.697912
}
```

Provider-specific Nominatim fields are not exposed.

## 9. Public/private projection rules

### 9.1 Public visibility

A listing is public only when:

```text
listing.status = APPROVED
AND owning landlord isActive = true
```

The same rule is mandatory for public search, public detail, map-bound search, radius search, favorite creation, and favorites retrieval.

Deactivating a landlord changes only the user account. It does not change listing status and creates no moderation-history row. Reactivation makes listings still in `APPROVED` public again.

### 9.2 Public omissions

Public listing responses must omit:

- `addressText`
- exact latitude/longitude
- landlord ID
- landlord phone/email
- image database IDs
- Cloudinary public IDs
- moderation status/reasons/history
- password/hash data
- raw provider fields

Repositories should select narrow public-safe projections instead of loading private fields and removing them later.

## 10. Listing lifecycle and significant edits

### 10.1 Significant content matrix

| Current status | After a real significant edit |
|---|---|
| `DRAFT` | `DRAFT` |
| `PENDING` | `PENDING` |
| `REJECTED` | `DRAFT` |
| `APPROVED` | `PENDING` |
| `INACTIVE` | `PENDING` immediately |
| `HIDDEN` | `HIDDEN` |

Significant content consists only of:

- title
- description
- monthly rent
- property type
- room area
- `addressText`
- `areaName`
- latitude/longitude
- amenity set
- image upload
- image deletion

Image reorder is not significant. A normalized no-op listing PATCH causes no lifecycle transition and does not change `updatedAt`.

### 10.2 Explicit landlord actions

| Action | Allowed transition |
|---|---|
| Submit | `DRAFT -> PENDING` or `HIDDEN -> PENDING` |
| Deactivate | `APPROVED -> INACTIVE` |
| Reactivate | `INACTIVE -> APPROVED` |

Hidden submission does not require a persisted proof of content change. Hidden edits remain `HIDDEN` until explicit submit. The listing stays non-public and undergoes admin review again.

### 10.3 Hard deletion

Hard deletion is allowed only when:

1. The owned listing currently has status `DRAFT`.
2. No moderation-history row exists for the listing.

A previously moderated listing remains non-deletable after an edit returns it to `DRAFT`. Failure returns `409` with `LISTING_DELETE_NOT_ALLOWED`. Moderation history remains append-only and is never deleted to permit hard deletion.

## 11. Pagination and sorting

Unless an endpoint narrows the contract:

- `page`: positive integer, default `1`.
- `pageSize`: positive integer, default `20`, maximum `100`.
- No total count.
- `hasNextPage` uses a limit-plus-one query.

Stable listing-search sorting:

| Sort | Ordering |
|---|---|
| `newest` | `updatedAt DESC`, then `id DESC` |
| `rent_asc` | `monthlyRent ASC`, then `id ASC` |
| `rent_desc` | `monthlyRent DESC`, then `id DESC` |
| `distance_asc` | exact `distanceKm ASC`, then `id ASC` |

Radius search supports only `distance_asc`; it is the default when radius parameters are present. Non-radius search defaults to `newest`.

## 12. Public search query contract

The single public listing collection supports normal browse, filters, visible map bounds, and radius search.

| Parameter | Type | Rules |
|---|---|---|
| `q` | string | Case-insensitive substring search over `title` and `area_name` only |
| `areaName` | string | Case-insensitive substring filter over `area_name` only |
| `minMonthlyRent` | integer | Positive whole VND |
| `maxMonthlyRent` | integer | Positive whole VND; must be at least minimum |
| `minRoomAreaSqm` | decimal | Positive, at most two decimal places |
| `maxRoomAreaSqm` | decimal | Positive; must be at least minimum |
| `propertyType` | code | Known property-type code; retired known codes are accepted as filters |
| `amenities` | comma-separated codes | Result must contain all requested codes; duplicates are deduplicated |
| `north` | number | Required with all other bounds; latitude range |
| `south` | number | Required with all other bounds; less than `north` |
| `east` | number | Required with all other bounds; longitude range |
| `west` | number | Required with all other bounds; less than `east` in the MVP region |
| `centerLat` | number | Required with `centerLng` and `radiusKm` |
| `centerLng` | number | Required with `centerLat` and `radiusKm` |
| `radiusKm` | number | Greater than zero and no more than configured maximum |
| `page` | integer | Default `1` |
| `pageSize` | integer | Default `20`, maximum `100` |
| `sort` | enum | Non-radius: `newest`, `rent_asc`, `rent_desc`; radius: `distance_asc` only |

Rules:

- Bounds require all four values or none.
- Radius requires all three radius values or none.
- Bounds and radius are mutually exclusive.
- `q` never searches private `address_text`.
- A blank `q` or `areaName` after trimming is treated as absent.
- `q` and `areaName`, when both present, combine with the other filters.
- Amenity semantics are `ALL`, not `ANY`.
- Known retired lookup values remain valid search filters.
- The deployment scope is Ho Chi Minh City, Vietnam.
- `MAX_SEARCH_RADIUS_KM` is configuration-driven and approved as `50`.
- Radius center coordinates must satisfy the configured deployment scope.
- Bounding-box values are calculated in TypeScript for radius requests.
- PostgreSQL filters bounding-box candidates and calculates Haversine distance.
- Exact coordinates and exact distance control filtering and ordering.
- Public response coordinates remain rounded to three decimals.

## 13. Validation rules

### 13.1 Common values

| Value | Validation |
|---|---|
| Email | Required where documented; trimmed lowercase; valid email; maximum 320 characters |
| Password | 8 or more characters; no more than 72 UTF-8 bytes |
| Phone | E.164 form: `+`, a first digit from 1–9, then 7–14 more digits; required for landlords |
| Integer ID | Positive 32-bit integer |
| `monthlyRent` | Positive whole JSON integer; maximum `999999999999` |
| `roomAreaSqm` | Positive; maximum `999999.99`; at most two decimal places |
| Latitude | `-90` through `90` |
| Longitude | `-180` through `180` |
| Title | Nonblank when present; maximum 160 characters |
| Description | Nonblank when present; maximum 5000 characters |
| `addressText` | Nonblank when present; maximum 500 characters |
| `areaName` | Nonblank when present; maximum 120 characters |
| `altText` | Null or nonblank; maximum 255 characters |
| Moderation reason | Null or nonblank; maximum 1000 characters |

### 13.2 Listing completeness

Draft scalar fields may be null. Every non-draft listing requires:

- property type
- title
- description
- monthly rent
- room area
- `addressText`
- `areaName`
- latitude
- longitude

Submission additionally requires at least one persisted image. Amenities may be an empty set.

If either coordinate is present in a create or PATCH request, both must be present in that request. Both may be null only when the resulting listing status is `DRAFT`.

### 13.3 Lookups and arrays

- Property and amenity codes must be known controlled codes.
- Newly selecting an inactive value through listing create or PATCH is forbidden.
- An already-associated known value may remain unchanged after retirement.
- Submission is not a new selection: unchanged known retired property-type and amenity references are accepted for both `DRAFT -> PENDING` and `HIDDEN -> PENDING`; unknown references remain invalid.
- `amenityCodes`, when present in listing create/PATCH, is the complete desired set.
- Write-body duplicates are rejected.
- Search duplicates may be deduplicated.
- Reorder arrays contain at most eight positive unique image IDs and must exactly equal the current image set.

### 13.4 Images

- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`.
- The backend validates both the declared multipart MIME type and the detected file signature or actual decoded image format. Both must consistently identify JPEG, PNG, or WebP.
- A MIME/signature mismatch or an unsupported actual format returns `415 Unsupported Media Type`.
- Maximum file size: `5242880` bytes (5 MiB).
- Maximum images per listing: 8.
- Draft may have zero.
- Non-draft must retain at least one.

## 14. Endpoint summary

### 14.1 Health

| Method | Path | Actor |
|---|---|---|
| GET | `/api/health` | Public |

### 14.2 Versioned endpoints

| # | Method | Path | Actor |
|---:|---|---|---|
| 1 | POST | `/api/v1/auth/register/tenant` | Public |
| 2 | POST | `/api/v1/auth/register/landlord` | Public |
| 3 | POST | `/api/v1/auth/login` | Public |
| 4 | POST | `/api/v1/auth/logout` | Public/idempotent cookie clearing |
| 5 | GET | `/api/v1/users/me` | Active authenticated user |
| 6 | PATCH | `/api/v1/users/me` | Active authenticated user |
| 7 | GET | `/api/v1/lookups/property-types` | Public |
| 8 | GET | `/api/v1/lookups/amenities` | Public |
| 9 | GET | `/api/v1/listings` | Public |
| 10 | GET | `/api/v1/listings/:listingId` | Public with optional tenant enrichment |
| 11 | POST | `/api/v1/landlord/listings` | Active `LANDLORD` |
| 12 | GET | `/api/v1/landlord/listings` | Active `LANDLORD` |
| 13 | GET | `/api/v1/landlord/listings/:listingId` | Active owner `LANDLORD` |
| 14 | PATCH | `/api/v1/landlord/listings/:listingId` | Active owner `LANDLORD` |
| 15 | DELETE | `/api/v1/landlord/listings/:listingId` | Active owner `LANDLORD` |
| 16 | POST | `/api/v1/landlord/listings/:listingId/submit` | Active owner `LANDLORD` |
| 17 | POST | `/api/v1/landlord/listings/:listingId/deactivate` | Active owner `LANDLORD` |
| 18 | POST | `/api/v1/landlord/listings/:listingId/reactivate` | Active owner `LANDLORD` |
| 19 | POST | `/api/v1/landlord/listings/:listingId/images` | Active owner `LANDLORD` |
| 20 | DELETE | `/api/v1/landlord/listings/:listingId/images/:imageId` | Active owner `LANDLORD` |
| 21 | PUT | `/api/v1/landlord/listings/:listingId/images/order` | Active owner `LANDLORD` |
| 22 | POST | `/api/v1/geocoding/forward` | Active `LANDLORD` |
| 23 | GET | `/api/v1/favorites` | Active `TENANT` |
| 24 | PUT | `/api/v1/favorites/:listingId` | Active `TENANT` |
| 25 | DELETE | `/api/v1/favorites/:listingId` | Active `TENANT` |
| 26 | GET | `/api/v1/admin/listings` | Active `ADMIN` |
| 27 | GET | `/api/v1/admin/listings/:listingId` | Active `ADMIN` |
| 28 | GET | `/api/v1/admin/listings/:listingId/moderation-actions` | Active `ADMIN` |
| 29 | POST | `/api/v1/admin/listings/:listingId/moderation-actions` | Active `ADMIN` |
| 30 | GET | `/api/v1/admin/users` | Active `ADMIN` |
| 31 | PATCH | `/api/v1/admin/users/:userId/activation` | Active `ADMIN`; tenant/landlord targets only |

## 15. Detailed endpoint specifications

Shared authentication, Origin, normalization, validation, envelope, privacy, and error rules apply to every endpoint below.

### Health — GET `/api/health`

- **Purpose:** Report API and database availability.
- **Authentication:** None.
- **Success:** `200 OK`.

```json
{
  "status": "ok",
  "database": "connected"
}
```

- **Failure:** `503` with `{"status":"error","database":"unavailable"}` when PostgreSQL cannot be reached.
- **Privacy:** Must not expose configuration, credentials, SQL, or stack traces.
- **Idempotency:** Safe and idempotent.

### V1-01 — POST `/api/v1/auth/register/tenant`

- **Purpose:** Create a `TENANT` account and immediately authenticate it.
- **Authentication/role:** Public; cannot choose another role.
- **Headers:** JSON; allowed `Origin` required.
- **Body:**

```json
{
  "email": "minh.tran@example.com",
  "password": "safe-passphrase",
  "phone": "+84987654321"
}
```

`phone` may be omitted or `null`.

- **Normalization/validation:** Normalize email; validate password byte length; validate phone when present; reject unknown fields.
- **Success:** `201 Created`, `Set-Cookie: rentmate_session=...`, and `{ "data": <UserProfile> }`.
- **Important errors:** `409 EMAIL_ALREADY_EXISTS`; `422 VALIDATION_FAILED`; `429 RATE_LIMITED`; `403` for Origin failure.
- **Privacy:** JWT and password are never returned.
- **Transaction:** Account insert must commit before issuing the response cookie.
- **Idempotency:** Not idempotent. A retry after successful creation may return `409`.

### V1-02 — POST `/api/v1/auth/register/landlord`

- **Purpose:** Create a `LANDLORD` account and immediately authenticate it.
- **Authentication/role:** Public; cannot choose another role.
- **Headers:** JSON; allowed `Origin` required.
- **Body:**

```json
{
  "email": "lan.nguyen@example.com",
  "password": "safe-passphrase",
  "phone": "+84901234567"
}
```

- **Normalization/validation:** Same as tenant registration, but `phone` is required and cannot be null.
- **Success:** `201 Created`, `Set-Cookie: rentmate_session=...`, and `{ "data": <UserProfile> }`.
- **Important errors:** `409 EMAIL_ALREADY_EXISTS`; `422 VALIDATION_FAILED`; `429 RATE_LIMITED`; `403` Origin failure.
- **Privacy:** JWT and password are never returned.
- **Transaction:** Account insert must commit before issuing the response cookie.
- **Idempotency:** Not idempotent. A retry after successful creation may return `409`.

### V1-03 — POST `/api/v1/auth/login`

- **Purpose:** Authenticate by email and password.
- **Authentication:** Public.
- **Headers:** JSON; allowed `Origin` required.
- **Body:**

```json
{
  "email": "minh.tran@example.com",
  "password": "safe-passphrase"
}
```

- **Normalization/validation:** Normalize email; reject unknown fields. Password is required.
- **Success:** `200 OK`, `Set-Cookie: rentmate_session=...`, and `{ "data": <UserProfile> }`.
- **Important errors:** `401 INVALID_CREDENTIALS` for incorrect credentials or an inactive account; `422`; `429`; `403` Origin failure.
- **Privacy:** Authentication failure must not disclose whether an email exists. JWT is not returned.
- **Idempotency:** Repeating valid login replaces the cookie with a new two-hour JWT.

### V1-04 — POST `/api/v1/auth/logout`

- **Purpose:** Clear the browser authentication cookie.
- **Authentication:** A valid session is not required.
- **Headers:** Allowed `Origin` required.
- **Body:** None.
- **Success:** `204 No Content`; clear `rentmate_session` using matching cookie attributes.
- **Important errors:** `403` Origin failure.
- **Idempotency:** Fully idempotent, including when the cookie is absent, invalid, or expired.
- **Security:** Logout does not create server-side revocation state; the two-hour JWT lifetime remains authoritative outside the cleared browser cookie.

### V1-05 — GET `/api/v1/users/me`

- **Purpose:** Return the current account profile.
- **Authentication/role:** Active authenticated `TENANT`, `LANDLORD`, or `ADMIN`.
- **Success:** `200 OK` with `{ "data": <UserProfile> }`.
- **Important errors:** `401`.
- **Privacy:** Returns only the caller's profile.
- **Idempotency:** Safe and idempotent.

### V1-06 — PATCH `/api/v1/users/me`

- **Purpose:** Update mutable account contact data.
- **Authentication/role:** Active authenticated user.
- **Headers:** JSON; allowed `Origin` required.
- **Body:**

```json
{
  "phone": "+84981112223"
}
```

Only `phone` is accepted. Tenant/admin may set it to `null`; landlord may not.

- **Normalization/validation:** Trim and validate E.164. Email, role, activation, IDs, and timestamps are rejected as unknown/protected fields.
- **Success:** `200 OK` with updated `{ "data": <UserProfile> }`.
- **Important errors:** `401`; `422`; `403` Origin failure.
- **No-op:** An unchanged normalized phone leaves `updatedAt` unchanged.
- **Idempotency:** Idempotent.

### V1-07 — GET `/api/v1/lookups/property-types`

- **Purpose:** Return selectable active property types.
- **Authentication:** Public.
- **Query/body:** None.
- **Success:** `200 OK`.

```json
{
  "data": [
    {
      "code": "STUDIO",
      "label": "Studio"
    }
  ]
}
```

- **Ordering:** Label ascending, then code ascending.
- **Idempotency:** Safe and idempotent.

### V1-08 — GET `/api/v1/lookups/amenities`

- **Purpose:** Return selectable active amenities.
- **Authentication:** Public.
- **Query/body:** None.
- **Success:** `200 OK` with `{ "data": [<Amenity>] }`.
- **Ordering:** Label ascending, then code ascending.
- **Idempotency:** Safe and idempotent.

### V1-09 — GET `/api/v1/listings`

- **Purpose:** Unified public browse, filter, map-bound, and radius search.
- **Authentication:** Public. Authentication does not add contact fields to collection results.
- **Query:** Exactly the parameters in Section 12.
- **Normalization/validation:** Trim text; uppercase codes; deduplicate search amenities; validate filter pairs/groups, deployment scope, page, size, and sort.
- **Success:** `200 OK` with paginated public listing summaries.

```json
{
  "data": [
    {
      "id": 42,
      "title": "Bright studio near Ben Thanh Market",
      "monthlyRent": 7500000,
      "roomAreaSqm": 28.5,
      "areaName": "Ben Thanh, District 1",
      "latitude": 10.772,
      "longitude": 106.698,
      "propertyType": {
        "code": "STUDIO",
        "label": "Studio"
      },
      "amenities": [],
      "coverImage": {
        "url": "https://res.cloudinary.com/rentmate/image/upload/v1/listings/studio-101.webp",
        "altText": "Bright studio room with a window",
        "displayOrder": 1
      },
      "updatedAt": "2026-07-29T07:15:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "hasNextPage": false
  }
}
```

- **Important errors:** `422 VALIDATION_FAILED`.
- **Visibility/privacy:** Every row must satisfy `APPROVED` plus active landlord. Never select/return exact address, exact coordinates, landlord/contact, moderation, or Cloudinary public IDs.
- **Performance:** Apply filters before Haversine where possible; avoid N+1 queries and total counts.
- **Idempotency:** Safe and idempotent.

### V1-10 — GET `/api/v1/listings/:listingId`

- **Purpose:** Return a publicly visible listing detail.
- **Authentication:** Public with optional authentication.
- **Path:** `listingId` is a positive 32-bit integer.
- **Success:** `200 OK` with public listing detail. Add `landlordContact` only for a valid, currently active `TENANT`.
- **Important errors:** `404 RESOURCE_NOT_FOUND` for missing, non-`APPROVED`, or inactive-landlord listing; `422` malformed ID.
- **Privacy:** Anonymous, landlord, and admin callers using this route receive the ordinary public projection. Exact address/coordinates and landlord ID are always omitted.
- **Idempotency:** Safe and idempotent.

### V1-11 — POST `/api/v1/landlord/listings`

- **Purpose:** Create an owned `DRAFT`.
- **Authentication/role:** Active `LANDLORD`.
- **Headers:** JSON; allowed `Origin` required.
- **Body:** May be `{}` or contain any subset of:

```json
{
  "title": "Bright studio near Ben Thanh Market",
  "description": "Private furnished studio with natural light.",
  "monthlyRent": 7500000,
  "propertyTypeCode": "STUDIO",
  "roomAreaSqm": 28.5,
  "addressText": "101 Example Street, Ben Thanh Ward, District 1, Ho Chi Minh City",
  "areaName": "Ben Thanh, District 1",
  "latitude": 10.772341,
  "longitude": 106.697912,
  "amenityCodes": ["WIFI", "FURNISHED"]
}
```

- **Normalization/validation:** Draft nullability applies; coordinates are supplied together; selected lookups must be active; `amenityCodes` is the complete initial set; reject duplicates and protected fields.
- **Success:** `201 Created` with `{ "data": <OwnerListingDetail> }`; status is always `DRAFT`.
- **Important errors:** `401`; `403`; `422`.
- **Transaction:** Insert listing and any amenity relationships atomically.
- **Idempotency:** Not idempotent.

### V1-12 — GET `/api/v1/landlord/listings`

- **Purpose:** Return the caller's listings in every lifecycle state.
- **Authentication/role:** Active `LANDLORD`.
- **Query:** `status` (optional listing status), `page`, `pageSize`. No other query fields.
- **Ordering:** `updatedAt DESC`, then `id DESC`.
- **Success:** `200 OK` with paginated owner listing summaries.
- **Important errors:** `401`; `403`; `422`.
- **Privacy:** Query is scoped by the authenticated landlord ID.
- **Idempotency:** Safe and idempotent.

### V1-13 — GET `/api/v1/landlord/listings/:listingId`

- **Purpose:** Return exact owner detail for one listing.
- **Authentication/role/ownership:** Active owner `LANDLORD`.
- **Path:** Positive `listingId`.
- **Success:** `200 OK` with `{ "data": <OwnerListingDetail> }`.
- **Important errors:** `401`; `403` wrong role; `404` missing or non-owned listing; `422` malformed ID.
- **Privacy:** May include exact address/coordinates, image database IDs, and the latest applicable rejection/hiding reason. It omits Cloudinary public IDs.
- **Idempotency:** Safe and idempotent.

### V1-14 — PATCH `/api/v1/landlord/listings/:listingId`

- **Purpose:** Partially update owned listing content and optionally replace the amenity set.
- **Authentication/role/ownership:** Active owner `LANDLORD`.
- **Headers:** JSON; allowed `Origin` required.
- **Path:** Positive `listingId`.
- **Body:** Any subset of the same content fields accepted by draft creation. Omitted fields are unchanged. `amenityCodes`, when present, is complete replacement.
- **Protected fields:** Reject `id`, `landlordId`, `status`, `createdAt`, `updatedAt`, moderation fields, image/provider fields, and every undocumented field.
- **Normalization/validation:** Apply Sections 5 and 13. Null scalar content is permitted only when the resulting status is `DRAFT`, including when a real edit transitions `REJECTED -> DRAFT`. Coordinates are supplied as a pair. Compare amenity sets without order.
- **Success:** `200 OK` with updated `{ "data": <OwnerListingDetail> }`.
- **Lifecycle:** Apply the significant-edit matrix in Section 10. A real `INACTIVE` edit becomes `PENDING` in the same transaction. Hidden edits remain `HIDDEN`.
- **No-op:** No content/status/`updatedAt` change.
- **Important errors:** `401`; `403`; owner-scoped `404`; `409 INVALID_LISTING_TRANSITION` or `CONCURRENT_MODIFICATION`; `422`.
- **Transaction:** Lock the listing, normalize and compare persisted content/set, update content and amenities, set required status and `updatedAt`, then commit.
- **Concurrency:** The locked current row is authoritative. Conditional-write failure caused by a stale concurrent state returns `409`.
- **Idempotency:** A repeated request that now matches persisted normalized content is a no-op.

### V1-15 — DELETE `/api/v1/landlord/listings/:listingId`

- **Purpose:** Permanently delete an eligible unmoderated draft.
- **Authentication/role/ownership:** Active owner `LANDLORD`.
- **Headers:** Allowed `Origin` required.
- **Path:** Positive `listingId`.
- **Body:** None.
- **Eligibility:** Current status must be `DRAFT`, and no moderation-history row may exist.
- **Success:** `204 No Content`.
- **Important errors:** Owner-scoped `404`; `409 LISTING_DELETE_NOT_ALLOWED`; `401`; `403`; `422`.
- **Transaction:**
  1. Begin and lock the owned listing.
  2. Require `DRAFT`.
  3. require no moderation history.
  4. Capture Cloudinary public IDs.
  5. Delete the listing and database-cascaded children.
  6. Commit.
  7. Attempt Cloudinary cleanup after commit.
- **Retention:** Moderation history is never deleted. Its restrictive foreign key remains an integrity backstop.
- **Provider failure:** Post-commit cleanup failure is logged; the response remains `204`.
- **Idempotency:** The resulting state is idempotent; a repeated request may return `404`.

### V1-16 — POST `/api/v1/landlord/listings/:listingId/submit`

- **Purpose:** Submit a draft or hidden listing for admin review.
- **Authentication/role/ownership:** Active owner `LANDLORD`.
- **Headers:** Allowed `Origin` required.
- **Body:** None.
- **Allowed transitions:** `DRAFT -> PENDING`; `HIDDEN -> PENDING`.
- **Validation:** For either allowed transition, the listing must satisfy scalar completeness and have at least one persisted image. Its associated property type and amenities must be known, but unchanged known references that were validly selected before retirement remain acceptable because submission is not a new selection. Unknown references remain invalid; the active-value requirement applies when a value is newly selected through create or PATCH. Hidden submission does not require proof of content change.
- **Success:** `200 OK` with updated `{ "data": <OwnerListingDetail> }`.
- **Important errors:** Owner-scoped `404`; `409 INVALID_LISTING_TRANSITION`; `422` completeness/image/lookup failure.
- **Transaction:** Lock listing; validate owner/current status/completeness/images; update status and `updatedAt`; commit.
- **Idempotency:** Conflict-protected; repeated submission after success returns `409`.

### V1-17 — POST `/api/v1/landlord/listings/:listingId/deactivate`

- **Purpose:** Mark an approved listing unavailable.
- **Authentication/role/ownership:** Active owner `LANDLORD`.
- **Headers:** Allowed `Origin` required.
- **Body:** None.
- **Allowed transition:** `APPROVED -> INACTIVE` only.
- **Success:** `200 OK` with updated owner detail.
- **Important errors:** Owner-scoped `404`; `409 INVALID_LISTING_TRANSITION`.
- **Transaction:** Lock, verify current status, update status/`updatedAt`, commit.
- **Idempotency:** Conflict-protected; repeated action returns `409`.

### V1-18 — POST `/api/v1/landlord/listings/:listingId/reactivate`

- **Purpose:** Make an unchanged inactive listing public again.
- **Authentication/role/ownership:** Active owner `LANDLORD`.
- **Headers:** Allowed `Origin` required.
- **Body:** None.
- **Allowed transition:** `INACTIVE -> APPROVED` only.
- **Safety invariant:** Any significant inactive edit would already have changed status to `PENDING`.
- **Success:** `200 OK` with updated owner detail.
- **Important errors:** Owner-scoped `404`; `409 INVALID_LISTING_TRANSITION`.
- **Transaction:** Lock, verify current status, update status/`updatedAt`, and commit.
- **Idempotency:** Conflict-protected; repeated action returns `409`.

### V1-19 — POST `/api/v1/landlord/listings/:listingId/images`

- **Purpose:** Upload one listing image.
- **Authentication/role/ownership:** Active owner `LANDLORD`.
- **Headers:** `multipart/form-data`; allowed `Origin` required.
- **Multipart fields:** `image` (required, exactly one file); `altText` (optional).
- **Validation:** At most 5 MiB; fewer than eight current images; alt-text rules. Validate both the declared multipart MIME type and the detected signature or actual decoded format; both must consistently identify JPEG, PNG, or WebP. A mismatch or unsupported actual format returns `415 Unsupported Media Type`.
- **Ordering:** No insertion position is accepted. The service assigns the smallest currently unused `displayOrder` slot from 1 through 8 and returns it. A client that needs a different final order uses the reorder endpoint afterward.
- **Success:** `201 Created` with `{ "data": <OwnerImage> }`.
- **Lifecycle:** Image addition is significant and applies the matrix in Section 10.
- **Important errors:** Owner-scoped `404`; `413`; `415`; `422 IMAGE_LIMIT_EXCEEDED`; `502 PROVIDER_UNAVAILABLE`.
- **Provider/transaction flow:** Upload to Cloudinary; begin/lock/recheck listing and count; insert metadata plus required status/`updatedAt`; commit. If database persistence fails, attempt immediate best-effort provider cleanup.
- **Idempotency:** Not idempotent. Automatic blind retries are forbidden.

### V1-20 — DELETE `/api/v1/landlord/listings/:listingId/images/:imageId`

- **Purpose:** Remove one listing image.
- **Authentication/role/ownership:** Active owner `LANDLORD`; image must belong to the path listing.
- **Headers:** Allowed `Origin` required.
- **Path:** Positive listing and image IDs.
- **Validation:** A non-draft listing must retain at least one image.
- **Success:** `204 No Content`.
- **Lifecycle:** Image deletion is significant and applies the matrix in Section 10.
- **Important errors:** Owner-scoped/mismatched `404`; `422 LAST_IMAGE_REQUIRED`.
- **Transaction/provider flow:** Lock listing; recheck associated image/count; delete metadata plus required status/`updatedAt`; commit; then attempt best-effort Cloudinary deletion.
- **Provider failure:** Post-commit cleanup failure is logged and does not change the `204`.
- **Ordering:** Remaining images preserve relative order. Gaps in display positions are valid; a client may use the reorder endpoint to assign a complete desired order.
- **Idempotency:** Resulting state is idempotent; repeated deletion may return `404`.

### V1-21 — PUT `/api/v1/landlord/listings/:listingId/images/order`

- **Purpose:** Replace the complete image order.
- **Authentication/role/ownership:** Active owner `LANDLORD`.
- **Headers:** JSON; allowed `Origin` required.
- **Body:**

```json
{
  "imageIds": [91, 94, 93]
}
```

- **Validation:** Array must contain every current image ID exactly once, contain no duplicate/foreign/missing IDs, and contain at most eight IDs.
- **Success:** `200 OK` with `{ "data": [<OwnerImage>] }` in final order.
- **Lifecycle:** Reorder is not significant, never changes listing status, and never triggers re-moderation.
- **No-op:** If the requested order equals the current normalized order, perform no image-row update, no listing `updatedAt` update, and no status transition.
- **Changed order:** Update the image display positions transactionally and update the owning listing's `updatedAt`; do not change listing status or trigger re-moderation.
- **Important errors:** Owner-scoped `404`; `422 VALIDATION_FAILED`; `409 CONCURRENT_MODIFICATION`.
- **Transaction:** Lock listing; validate the exact current image set and normalized requested order; return the no-op result when unchanged; otherwise defer uniqueness as needed, assign positions, update listing `updatedAt`, and commit.
- **Idempotency:** Idempotent.

### V1-22 — POST `/api/v1/geocoding/forward`

- **Purpose:** Explicitly forward-geocode a landlord-entered address.
- **Authentication/role:** Active `LANDLORD`.
- **Headers:** JSON; allowed `Origin` required.
- **Body:**

```json
{
  "addressText": "101 Example Street, Ben Thanh Ward, District 1, Ho Chi Minh City"
}
```

- **Normalization/validation:** Trim; nonblank; maximum 500 characters; reject unknown fields.
- **Success:** `200 OK` with zero to five normalized candidates.

```json
{
  "data": [
    {
      "displayName": "Ben Thanh Ward, District 1, Ho Chi Minh City, Vietnam",
      "latitude": 10.772341,
      "longitude": 106.697912
    }
  ]
}
```

- **Important errors:** `401`; `403`; `422`; `429 RATE_LIMITED`; `502 PROVIDER_UNAVAILABLE`.
- **Provider behavior:** Explicit requests only; bounded timeout/result count; identifying provider headers; no autocomplete, reverse geocoding, background request, or raw response fields.
- **Empty result:** `200` with `"data": []`.
- **Idempotency:** No local state mutation, but each call invokes the external provider; clients must not call on each keystroke.

### V1-23 — GET `/api/v1/favorites`

- **Purpose:** Return the tenant's currently public saved listings.
- **Authentication/role:** Active `TENANT`.
- **Query:** `page`, `pageSize` only.
- **Ordering:** Favorite `createdAt DESC`, then listing ID `DESC`.
- **Success:** `200 OK` with paginated public listing summaries.
- **Important errors:** `401`; `403`; `422`.
- **Visibility:** Join listing and landlord; require `APPROVED` and active landlord. Non-public favorite rows remain stored but are omitted.
- **Privacy:** Public summary projection only; no landlord contact.
- **Idempotency:** Safe and idempotent.

### V1-24 — PUT `/api/v1/favorites/:listingId`

- **Purpose:** Ensure the listing is favorited by the tenant.
- **Authentication/role:** Active `TENANT`.
- **Headers:** Allowed `Origin` required.
- **Path:** Positive listing ID.
- **Body:** None.
- **Visibility:** Target must currently be `APPROVED` with active landlord.
- **Success:** `204 No Content` for initial and repeated addition.
- **Important errors:** `404` for missing/non-public target; `401`; `403`; `422`.
- **Transaction:** Insert relationship or retain existing relationship without duplication.
- **Idempotency:** Fully idempotent.

### V1-25 — DELETE `/api/v1/favorites/:listingId`

- **Purpose:** Ensure the tenant/listing favorite relationship does not exist.
- **Authentication/role:** Active `TENANT`.
- **Headers:** Allowed `Origin` required.
- **Path:** Positive listing ID.
- **Body:** None.
- **Visibility:** Current listing visibility and existence are not required for relationship removal.
- **Success:** `204 No Content` whether or not the relationship currently exists.
- **Important errors:** `401`; `403`; `422` malformed ID.
- **Idempotency:** Fully idempotent.

### V1-26 — GET `/api/v1/admin/listings`

- **Purpose:** Return listings for moderation work.
- **Authentication/role:** Active `ADMIN`.
- **Query:** `status` (optional, defaults to `PENDING`), `page`, `pageSize`.
- **Ordering:** `updatedAt DESC`, then `id DESC`.
- **Success:** `200 OK` with paginated admin listing summaries.
- **Important errors:** `401`; `403`; `422`.
- **Privacy:** Admin-authorized landlord account/contact information may be included. Password/provider secrets are never included.
- **Idempotency:** Safe and idempotent.

### V1-27 — GET `/api/v1/admin/listings/:listingId`

- **Purpose:** Return exact listing and landlord data needed for moderation.
- **Authentication/role:** Active `ADMIN`.
- **Path:** Positive listing ID.
- **Success:** `200 OK` with `{ "data": <AdminListingDetail> }`.
- **Important errors:** `401`; `403`; `404`; `422`.
- **Privacy:** May include exact address/coordinates, landlord account/contact data, owner/admin image metadata, and current moderation reason. It omits password data and Cloudinary public IDs.
- **Idempotency:** Safe and idempotent.

### V1-28 — GET `/api/v1/admin/listings/:listingId/moderation-actions`

- **Purpose:** Return authoritative moderation history for a listing.
- **Authentication/role:** Active `ADMIN`.
- **Path:** Positive listing ID.
- **Query:** `page`, `pageSize`.
- **Ordering:** `createdAt DESC`, then history ID `DESC`.
- **Success:** `200 OK` with paginated moderation-history items.
- **Important errors:** `401`; `403`; `404`; `422`.
- **Retention:** History is append-only.
- **Idempotency:** Safe and idempotent.

### V1-29 — POST `/api/v1/admin/listings/:listingId/moderation-actions`

- **Purpose:** Perform one approved moderation transition and create its history item.
- **Authentication/role:** Active `ADMIN`.
- **Headers:** JSON; allowed `Origin` required.
- **Path:** Positive listing ID.
- **Body:**

```json
{
  "action": "REJECT",
  "reason": "The public area description does not match the submitted address."
}
```

- **Allowed actions/transitions:**
  - `APPROVE`: `PENDING -> APPROVED`
  - `REJECT`: `PENDING -> REJECTED`
  - `HIDE`: `APPROVED -> HIDDEN`
  - `RESTORE`: `HIDDEN -> APPROVED`
- **Reason:** Required, trimmed, and 1–1000 characters for `REJECT`/`HIDE`; optional nullable nonblank note for `APPROVE`/`RESTORE`.
- **Success:** `201 Created` with `{ "data": <ModerationHistoryItem> }`.
- **Important errors:** `404`; `409 INVALID_LISTING_TRANSITION` or `CONCURRENT_MODIFICATION`; `422`.
- **Transaction:** Lock listing; verify state; validate action/reason; update status and `updatedAt`; insert exactly one history row; commit both or neither.
- **Stale action:** `409`; no history row is inserted.
- **Idempotency:** Conflict-protected, not idempotent.

### V1-30 — GET `/api/v1/admin/users`

- **Purpose:** Return the basic user list for account management.
- **Authentication/role:** Active `ADMIN`.
- **Query:** `role` (optional), `isActive` (optional boolean), `page`, `pageSize`.
- **Ordering:** `createdAt DESC`, then `id DESC`.
- **Success:** `200 OK` with paginated user profiles.
- **Important errors:** `401`; `403`; `422`.
- **Privacy:** Admin-authorized account/contact fields only; never password/hash data.
- **Scope:** May list `ADMIN` accounts, but activation mutation remains forbidden for them.
- **Idempotency:** Safe and idempotent.

### V1-31 — PATCH `/api/v1/admin/users/:userId/activation`

- **Purpose:** Set a tenant or landlord account's active state.
- **Authentication/role:** Active `ADMIN`.
- **Headers:** JSON; allowed `Origin` required.
- **Path:** Positive user ID.
- **Body:**

```json
{
  "isActive": false
}
```

No other field is accepted.

- **Target authorization:** Target role must be `TENANT` or `LANDLORD`. `ADMIN` target returns `403`.
- **Success:** `200 OK` with updated `{ "data": <UserProfile> }`. Repeating the current value is a successful no-op.
- **Important errors:** `401`; `403`; `404`; `422`.
- **Landlord effect:** Change only the user account. Do not mutate listing statuses or create moderation history. Public/favorite queries suppress owned listings immediately; reactivation restores listings still `APPROVED`.
- **Existing JWT:** Protected authentication checks current activity, so a deactivated user's existing JWT no longer authorizes protected requests.
- **Transaction:** Lock or conditionally update the target user after verifying target role.
- **Idempotency:** Idempotent.

## 16. Cloudinary and image consistency behavior

### 16.1 Upload

1. Validate authentication, role, preliminary ownership, multipart syntax, size, and type.
2. Upload the provider asset.
3. Begin a database transaction and lock/recheck listing ownership, state, and current count.
4. Insert metadata and apply significant-edit status/`updatedAt` changes.
5. Commit.
6. If persistence fails after provider success, attempt immediate best-effort provider removal and log cleanup failure.

### 16.2 Image deletion

1. Begin and lock/recheck listing and associated image.
2. Verify the non-draft minimum image count.
3. Delete metadata and apply significant-edit status/`updatedAt` changes.
4. Commit.
5. Attempt provider removal.

Post-commit removal failure is logged and does not become `502`.

### 16.3 UI replacement

There is no atomic replacement operation:

- Fewer than eight images: upload the new image, then delete the old image.
- Exactly eight images: delete the old image, then upload the new image.

Each request commits independently. On `APPROVED` or `INACTIVE`, the first mutation moves the listing to `PENDING`; the second remains legal on `PENDING`. Hidden mutations leave the listing `HIDDEN`.

## 17. Nominatim behavior

- Backend-only forward geocoding.
- Active landlord authentication.
- Explicit user-triggered request only.
- Bounded timeout and maximum five candidates.
- Suitable per-user/provider rate limiting.
- Normalized candidate projection.
- Empty results use `200`.
- Timeout/provider failure before success uses `502`.
- Rate-limit rejection uses `429`.
- No autocomplete, reverse geocoding, background geocoding, raw response exposure, or separate geocoding-cache API.

## 18. Transaction and concurrency requirements

Use one checked-out PostgreSQL client from `BEGIN` through `COMMIT`/`ROLLBACK` for every multi-write workflow.

Listing-row locking is shared across:

- submission
- content/amenity PATCH
- image upload/delete/reorder
- hard deletion
- deactivate/reactivate
- moderation
- hidden submission

Required atomic groups:

- Listing content, amenity replacement, lifecycle status, and `updatedAt`.
- Image metadata mutation, lifecycle status, and `updatedAt`.
- Moderation status update and one moderation-history insert.
- Eligible listing deletion and database-cascaded child deletion.

Expected-state or conditional-write conflicts return `409`. A failed stale moderation action inserts no event. External providers never participate in PostgreSQL transactions; only the documented compensation behavior applies.

Public visibility changes caused by landlord activation require no listing write and no moderation event.

## 19. Idempotency

No `Idempotency-Key` system exists.

| Operation | Behavior |
|---|---|
| GET | Naturally safe/idempotent |
| Logout | Always converges to cleared cookie; `204` |
| Favorite PUT/DELETE | Always converges to requested relationship state; `204` |
| Activation PATCH | Setting the existing value is a `200` no-op |
| Profile/listing no-op PATCH | No-op; no `updatedAt` change |
| Image-order PUT | Same complete order is a no-op |
| Lifecycle action | Conflict-protected; repeat after success returns `409` |
| Moderation action | Conflict-protected; no duplicate history |
| Registration | Retry after committed creation may return duplicate-email `409` |
| Image upload | Not idempotent; no automatic blind retry |
| Listing/image DELETE | State is idempotent; repeat may return `404` |

## 20. Privacy and security rules

- Never return raw database rows.
- Never return plaintext passwords, hashes, JWTs, cookies, provider credentials, SQL errors, or stack traces.
- Never log sensitive request bodies or full contact information.
- Validate all external input, including path/query values and multipart metadata.
- Use parameterized SQL.
- Validate unsafe `Origin`; CORS is not CSRF protection.
- Configure credential-aware CORS with the exact frontend origin and no wildcard.
- Keep production frontend and API same-site and use HTTPS.
- Use narrow public projections that avoid selecting private address/contact fields.
- Calculate radius using exact coordinates; round only the returned public coordinates.
- Public text search uses only `title` and `area_name`.
- Public landlord identity is not exposed.
- Moderation reasons/history are owner/admin data, never public or favorite-list data.

## 21. Performance requirements

- Unified public search prevents duplicated map/radius query implementations.
- Search repositories must avoid N+1 image/amenity queries. Use an aggregate query or bounded bulk queries for the selected page.
- Apply public visibility and ordinary filters before Haversine where possible.
- Calculate Haversine once per candidate query and reuse it for filtering/order.
- Do not run a total-count query.
- Limit public pages/map markers to `pageSize <= 100`.
- Geocoding is explicit and not triggered on every keystroke.
- Public/detail queries should not load private columns merely to discard them.

## 22. Out-of-scope API capabilities

The MVP API does not include:

- duplicate current-user resources
- a generic client-controlled listing-status mutation
- separate map or radius collections
- atomic image replacement
- refresh/session management
- password-reset or email-change workflows
- public admin registration
- admin hierarchy or `SUPER_ADMIN`
- reverse geocoding or autocomplete
- PostGIS-specific API concepts
- messaging, notifications, booking, payments, leases, reviews, recommendations, or analytics
- image editing or automated image moderation
- generalized audit endpoints

## 23. Contract-relevant implementation notes

- The four business modules remain `auth`, `users`, `listings`, and `favorites`.
- Search, image coordination, and moderation remain internal concerns of `listings`.
- Nominatim and Cloudinary remain integration clients.
- Repository DTOs and API response DTOs must be distinct where private columns exist.
- PostgreSQL `numeric` values must be mapped deliberately. The approved rent range fits a safe JSON integer.
- `updatedAt` is application-managed; no timestamp trigger is assumed.
- Public lookup endpoints return active values, while detail/filter queries may still represent known retired values.
- Image database ordering is 1-based in API responses.
- Health is the only endpoint exempt from the normal `{ "data": ... }` envelope.

## 24. Final frozen decisions

- Exactly 31 versioned endpoints plus the separate health endpoint form API v1.
- The listing collection is the only public browse/map/radius endpoint.
- Current-user retrieval and update live under `users`.
- Landlord lifecycle uses explicit submit, deactivate, and reactivate actions.
- `INACTIVE` plus any significant edit becomes `PENDING` immediately.
- Hidden edits remain hidden until explicit submit; no revision proof is required.
- Public visibility always requires both approved listing and active landlord.
- Public discovery never searches exact address and never returns exact coordinates.
- Favorites use idempotent relationship semantics and filter current public visibility on retrieval.
- Image replacement is composed from upload/delete.
- Moderation status and history creation are atomic.
- Moderation history is preserved and remains restrictive against listing deletion.
- Hard deletion requires an owned unmoderated `DRAFT`.
- Email remains the immutable, required, email-only login identifier.
- Admin activation mutation targets only tenants and landlords.
- PostgreSQL without PostGIS, bounding-box filtering, and PostgreSQL Haversine remain fixed.
- No database schema decision is introduced by this HTTP contract.

This document freezes RentMate MVP API Specification v1.
