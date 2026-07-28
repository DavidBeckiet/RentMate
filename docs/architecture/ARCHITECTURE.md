# RentMate System Architecture Specification v1

## 1. Architecture overview

RentMate uses a three-tier modular-monolith architecture designed for an eight-week MVP developed by one student.

The system consists of:

1. A Next.js frontend responsible for presentation and browser interaction.
2. A single Express application divided into internal business modules.
3. A single PostgreSQL database.

The backend is one codebase, process, and deployment unit. Module boundaries are logical boundaries inside the application and are not independently deployed services. Modules communicate through ordinary TypeScript function calls. RentMate does not use microservices, message queues, Redis, event buses, API gateways, or distributed transactions in the MVP.

The frontend communicates with the backend through REST/JSON. The backend is the only component that communicates with PostgreSQL and provider APIs that require controlled access or credentials.

## 2. Technology stack

### Frontend

- Next.js with the App Router
- React
- TypeScript
- Tailwind CSS
- Leaflet
- OpenStreetMap tiles

### Backend

- Node.js
- Express.js
- TypeScript
- `pg` PostgreSQL client
- JWT authentication
- bcrypt password hashing

### Database

- PostgreSQL
- Direct latitude and longitude storage
- Versioned SQL migrations
- No PostGIS in the MVP

### External services

- Nominatim for forward geocoding
- Cloudinary for listing-image storage and delivery

## 3. System components

### Browser and frontend

The browser renders the Next.js application, manages interactive forms and map controls, sends authenticated API requests to Express, downloads map tiles from OpenStreetMap, and displays images delivered by Cloudinary.

### Express modular monolith

The Express application exposes the RentMate API and owns authentication, authorization, validation, business rules, listing lifecycle, search, moderation, provider integration, response shaping, logging, and error handling.

### PostgreSQL

PostgreSQL is the authoritative store for application data. It is accessed only by backend repositories through a shared connection pool and parameterized SQL.

### External providers

Nominatim and Cloudinary are treated as replaceable infrastructure integrations. Provider-specific request and response formats must not leak into frontend components or business services.

## 4. Frontend architecture

The frontend uses the Next.js App Router and organizes pages by user workflow:

- Public search and listing details
- Authentication
- Tenant favorites
- Landlord listing management
- Admin moderation and basic user management

Server Components should be used for layouts and non-interactive page structure where practical. Client Components are used for Leaflet maps, forms, filters, uploads, favorites, and other browser-dependent interactions.

Leaflet must be loaded only in the browser because it depends on browser APIs and is not suitable for normal server-side rendering.

Frontend state remains simple:

- Local React state for forms and component interaction
- URL query parameters for search filters, map bounds, radius, sorting, and pagination
- A small authentication context only if current-user information is needed across client components
- A shared API client for the backend base URL, `credentials: "include"`, JSON handling, and consistent error conversion

No Redux or other global state-management framework is required for the MVP.

Frontend route checks improve navigation and user experience, but they are not security controls. The Express backend remains authoritative for roles, ownership, resource state, and protected fields.

## 5. Backend modular architecture

The backend contains four main business modules:

- `auth`
- `users`
- `listings`
- `favorites`

Search and moderation remain inside the listings module because they depend directly on listing visibility, lifecycle, and response rules.

The backend also contains shared infrastructure for configuration, database access, middleware, logging, validation, errors, health checking, and external-service clients.

Nominatim and Cloudinary are integration clients rather than business modules:

- `nominatim.client.ts`
- `cloudinary.client.ts`

The backend must not introduce independent deployment boundaries between these modules.

## 6. Backend module responsibilities

| Module or component | Responsibilities |
|---|---|
| `auth` | Tenant and landlord registration, login, logout, bcrypt password handling, JWT creation and verification, and public-admin-registration prevention |
| `users` | User profiles, roles, account activation state, landlord phone and optional email, and authorized contact-information access |
| `listings` | Listing drafts, ownership, updates, deletion of owned drafts, lifecycle transitions, public details, filtering, map search, radius search, image metadata coordination, moderation, and moderation history |
| `favorites` | Adding, removing, and retrieving tenant favorites with tenant and listing-visibility checks |
| `nominatim.client` | Nominatim request construction, timeout handling, identifying headers, response normalization, and provider-error conversion |
| `cloudinary.client` | Cloudinary upload and removal operations and provider-error conversion |
| `db` | PostgreSQL connection pooling, health checks, transaction helpers, and connection shutdown |
| `health` | Lightweight API and database availability reporting |
| `shared` | Common middleware, validation helpers, error types, response conventions, and logging utilities |

The users module owns landlord contact information. The listings module decides whether that information may be included in a particular listing response.

## 7. Selective layering strategy

Route → Controller → Service → Repository is used only where every layer adds a clear responsibility.

### Routes

- Define HTTP paths and methods.
- Attach authentication, role, Origin-validation, and request-validation middleware.
- Delegate to a controller or a small handler.

### Controllers

- Read validated HTTP input.
- Call a service.
- Translate service results into HTTP responses.
- Contain no SQL or significant business rules.

### Services

- Apply business rules.
- Enforce ownership and resource-state rules.
- Coordinate transactions.
- Coordinate repositories and integration clients.
- Contain no Express-specific response logic.

### Repositories

- Execute parameterized SQL.
- Map database results into application data.
- Contain no Express request or response objects.
- Contain no HTTP status decisions.

Auth, users, listings, and favorites may use the full structure. Health checking may call the database health function directly. Nominatim and Cloudinary remain small clients called by listing services. Generic base controllers, base services, base repositories, and a dependency-injection framework are not required.

## 8. Database responsibility

PostgreSQL is responsible for durable application data, relational integrity, transactional updates, filtering, ordering, pagination, and the final Haversine distance calculation.

The backend uses the existing shared `pg` connection pool and parameterized SQL. An ORM is not required for the MVP. Repositories isolate SQL from HTTP and business logic.

Database transactions are used when multiple writes must succeed or fail together, especially moderation status updates and moderation-history creation.

PostgreSQL stores exact latitude and longitude values directly. PostGIS is explicitly excluded from the MVP.

Detailed tables, columns, SQL data types, keys, constraints, indexes, relationships, and the ERD are deferred to the Database Design step.

## 9. External service integrations

### OpenStreetMap

The browser requests OpenStreetMap tiles through Leaflet. Tile-provider attribution must remain visible. The application must avoid unnecessary tile requests.

### Nominatim

Only the backend calls Nominatim. The integration is limited to explicit forward-geocoding requests initiated by landlords. Autocomplete, reverse geocoding, background geocoding, and a separate geocoding cache are not included.

### Cloudinary

The backend controls image uploads and deletion attempts. Cloudinary credentials remain backend-only. Browsers retrieve stored images directly from Cloudinary delivery URLs.

All external calls must use bounded timeouts and convert provider-specific failures into consistent application errors.

## 10. Authentication and authorization architecture

Tenant and landlord registration is public. Admin registration is forbidden. Admin accounts are provisioned manually or through controlled seed data.

During registration, the backend validates the request, hashes the password using bcrypt, and stores the permitted user role. During login, the backend verifies the password and account activation state before issuing a JWT.

The JWT contains only the identity and authorization claims required by the MVP, including user identifier, role, issued time, and expiry. The JWT lifetime is two hours. The MVP has no refresh-token system; users log in again after token expiry.

Authorization is enforced through four checks where applicable:

1. Authentication: the JWT is valid and the account remains active.
2. Role: the user has the required `TENANT`, `LANDLORD`, or `ADMIN` role.
3. Ownership: the landlord owns the requested listing.
4. Resource and field policy: the listing state permits the action and the requester may receive the requested fields.

Frontend route protection does not replace backend authorization.

## 11. JWT cookie, CORS, CSRF/Origin-validation strategy

The JWT is stored in a host-only HttpOnly cookie. The application must not set a broad cookie `Domain` attribute unless a future deployment requires and justifies it.

Cookie settings are:

| Setting | Development | Production |
|---|---|---|
| `HttpOnly` | `true` | `true` |
| `SameSite` | `Lax` | `Lax` |
| `Secure` | `false` | `true` |
| Lifetime | 2 hours | 2 hours |
| Path | `/` | `/` |

Production frontend and backend must remain same-site. The preferred deployment is either one domain with `/api` routed to Express or frontend and API subdomains under the same parent domain. HTTPS is required in production.

The frontend API client sends `credentials: "include"` for authenticated requests.

When frontend and backend are cross-origin, such as local ports `3000` and `4000`, Express CORS configuration must use:

- The exact configured frontend origin
- `credentials: true`
- No wildcard origin

CORS is not treated as CSRF protection. For unsafe methods—`POST`, `PUT`, `PATCH`, and `DELETE`—the backend validates the `Origin` header against the configured frontend origin. State-changing operations must never use `GET`.

The combination of same-site deployment, `SameSite=Lax`, exact credential-aware CORS, unsafe-method Origin validation, and production HTTPS is the approved MVP strategy. A separate CSRF-token system is not required for this deployment model.

## 12. User contact-information visibility policy

Landlord contact information belongs to the user profile, not to individual listings.

A landlord must provide at least one valid phone number. Email is optional. Phone validity means server-side format validation; SMS verification is not included in the MVP.

The API applies the following field-level visibility policy:

- Anonymous search, map, listing-card, and listing-detail responses contain no landlord phone or email.
- An authenticated tenant viewing the detail of an `APPROVED` listing may receive the landlord phone number and optional email.
- A landlord may view and update their own contact information.
- An admin may view landlord contact information for moderation and user management.
- An authenticated landlord does not receive another landlord's private contact fields merely by viewing a public listing.

Public response objects must be explicitly mapped. Raw database rows containing private contact fields must not be returned directly.

## 13. Listing lifecycle and state-transition rules

The approved listing states are `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `INACTIVE`, and `HIDDEN`.

| Current state | Action | Next state | Authorized actor |
|---|---|---|---|
| `DRAFT` | Submit a complete listing | `PENDING` | Owner landlord |
| `DRAFT` | Permanently delete | Deleted | Owner landlord |
| `PENDING` | Approve | `APPROVED` | Admin |
| `PENDING` | Reject with a reason | `REJECTED` | Admin |
| `REJECTED` | Edit rejected content | `DRAFT` | Owner landlord |
| `DRAFT` after rejection | Resubmit | `PENDING` | Owner landlord |
| `APPROVED` | Make a significant edit | `PENDING` | Owner landlord |
| `APPROVED` | Deactivate | `INACTIVE` | Owner landlord |
| `APPROVED` | Hide with a reason | `HIDDEN` | Admin |
| `INACTIVE` | Reactivate without significant changes | `APPROVED` | Owner landlord |
| `INACTIVE` | Significantly edit and explicitly resubmit | `PENDING` | Owner landlord |
| `HIDDEN` | Remediate and explicitly resubmit | `PENDING` | Owner landlord |
| `HIDDEN` | Restore | `APPROVED` | Admin |

A `DRAFT` is the only listing state that the owner may permanently delete directly. A rejected listing must be edited, thereby returning to `DRAFT`, before it can be resubmitted or deleted.

A landlord may edit a `PENDING` listing, and it remains `PENDING`. Admin moderation must always act on the current stored listing data.

A hidden listing remains `HIDDEN` while the landlord performs remediation. It changes to `PENDING` only through explicit resubmission.

An unchanged inactive listing may return directly to `APPROVED`. Significant changes to an inactive listing require an explicit submit-for-review action and result in `PENDING`.

Listing revision or version tables are not used. A significant edit updates the listing in place and removes it from public results while it awaits approval.

## 14. Significant-edit and re-moderation policy

Any change to tenant-visible listing content is significant and requires re-moderation.

Significant edits include:

- Title
- Description
- Monthly price
- Property type
- Room area
- Public address information
- Exact latitude or longitude
- Amenities
- Adding an image
- Removing an image
- Replacing an image

The following actions are not significant content edits:

- Reordering the same existing images
- Deactivating an approved listing
- Reactivating an unchanged inactive listing
- Updating landlord profile contact information

An approved listing that receives a significant edit changes immediately to `PENDING`. Because the MVP does not retain an approved revision, the listing is temporarily removed from tenant-facing results until an admin approves the current content.

Property types and amenities use predefined controlled values. Their exact approved values are deferred to Database Design.

## 15. Moderation transaction rules

Rejection requires a non-empty reason. Hiding requires a non-empty reason.

Every admin moderation action that changes listing status must update the listing and create its moderation-history entry in one PostgreSQL transaction. This applies to:

- `PENDING → APPROVED`
- `PENDING → REJECTED`
- `APPROVED → HIDDEN`
- `HIDDEN → APPROVED`

The transaction must either commit both the status change and history record or commit neither. Moderation business rules belong in the listings service; controllers must not update status directly.

## 16. Location and coordinate privacy policy

PostgreSQL stores exact latitude and longitude internally.

Exact coordinates are used for:

- Bounding-box candidate filtering
- Haversine distance calculation
- Landlord editing of their own listing
- Admin moderation

Exact coordinates are available only to the backend, the listing owner, and admins.

Anonymous and tenant-facing map and listing responses receive latitude and longitude rounded deterministically to three decimal places. The system does not store separate rounded coordinates; rounding occurs during authorized API response mapping.

Unit numbers and excessively precise public address information are not exposed. Public address presentation should identify a useful approximate area without revealing private unit-level details.

Distance values may be calculated from exact coordinates even though the displayed map marker is rounded. The interface should describe the displayed position as approximate.

## 17. Map-area search architecture

Leaflet runs in a Client Component. When a user moves or zooms the map, the frontend records the visible north, south, east, and west bounds.

The user explicitly requests a refresh using an action such as “Search this area.” The frontend does not issue a new request for every map movement.

The backend validates the bounds, applies listing filters, restricts results to publicly visible `APPROVED` listings, and queries exact stored coordinates within the supplied ranges. The response provides rounded coordinates for display.

The map and listing-card view must use the same search parameters and backend response so they do not show inconsistent result sets. A maximum map-result limit prevents excessive browser markers.

## 18. Bounding-box + Haversine radius-search architecture

Radius search uses PostgreSQL without PostGIS.

The frontend sends:

- Center latitude
- Center longitude
- Radius in kilometres
- Listing filters
- Pagination parameters

The backend validates coordinate ranges, the supported geographic area, radius limits, filters, and pagination.

The listings search service calculates an approximate bounding box in TypeScript:

```text
latitude delta  ≈ radiusKm / 111.32
longitude delta ≈ radiusKm / (111.32 × cos(latitude))
```

The listings search repository then executes one parameterized PostgreSQL query:

1. A candidate step restricts approved listings using exact latitude and longitude ranges.
2. Haversine distance is calculated in PostgreSQL only for those candidates.
3. Candidates beyond the exact requested radius are removed.
4. Remaining results are ordered by distance with a stable listing-identifier tie-breaker.
5. Pagination is applied.

The Haversine expression must exist in one repository implementation rather than being duplicated across endpoints. It should be verified with known coordinate pairs.

The MVP uses ordinary limited pagination. Requesting one row beyond the page size may be used to determine whether a next page exists without requiring a separate total-count query.

The supported one-region scope means polar and international-date-line edge cases are outside the MVP. PostGIS is the documented upgrade when dataset size, geographic coverage, or query volume makes this approach insufficient.

## 19. Geocoding flow

1. An authenticated landlord enters an address and explicitly requests geocoding.
2. The backend validates the address and applies suitable request throttling.
3. The Nominatim client sends a bounded request with identifying headers, a timeout, and a limited result count.
4. The backend normalizes the provider response into display address, latitude, and longitude values.
5. The frontend displays the candidate position on a Leaflet map.
6. The landlord confirms or manually adjusts the marker.
7. The backend validates and stores the final exact coordinates with the listing draft.

Geocoding must not run on every keystroke. Once coordinates are saved, the address should not be geocoded again unless the landlord explicitly requests it.

Nominatim failure must not discard draft data. The frontend should allow retry or manual marker placement. Automatic retry loops, reverse geocoding, advanced autocomplete, and separate cache infrastructure are excluded.

## 20. Image-upload architecture

The MVP uses backend-mediated Cloudinary uploads.

1. A landlord creates a listing draft.
2. The frontend sends an image as multipart form data.
3. The backend verifies authentication, landlord role, listing ownership, and listing state.
4. The backend validates image count, size, and allowed type.
5. The Cloudinary client uploads the image.
6. The backend stores the returned Cloudinary identifier, secure delivery URL, and image order through the listings repository.
7. The browser later loads the image directly from Cloudinary.

Limits are:

- Maximum eight images per listing
- Maximum five megabytes per image
- Allowed image types restricted during implementation
- Image ordering supported

Uploads may be held in memory only within the enforced size limit. The backend must not keep permanent local upload files.

If Cloudinary succeeds but database persistence fails, the backend performs best-effort immediate removal of the uploaded asset and logs any cleanup failure. No queue or background cleanup service is introduced.

Adding, removing, or replacing an image is a significant edit. Reordering the same images is not.

## 21. Error-handling strategy

The backend uses centralized Express error middleware and a consistent JSON envelope:

```json
{
  "error": {
    "code": "LISTING_NOT_FOUND",
    "message": "The requested listing was not found.",
    "requestId": "..."
  }
}
```

Expected status categories are:

- `400` for malformed requests
- `401` for missing, invalid, or expired authentication
- `403` for role, ownership, Origin, or protected-field denial
- `404` for missing resources
- `409` for invalid state transitions or duplicate relationships
- `422` for business-data validation failures
- `429` for rate limiting
- `502` for Nominatim or Cloudinary failures
- `503` for database or service unavailability
- `500` for unexpected internal failures

Provider response formats, SQL errors, stack traces, secrets, passwords, hashes, cookies, and JWTs must not appear in client responses.

The frontend API client converts backend error envelopes into predictable application errors for field feedback, retryable provider failures, authentication redirects, and general error states.

## 22. Configuration and environment strategy

Local development uses the repository-root `.env` created from `.env.example`. Environment-specific values are not committed.

Backend configuration includes:

- Server port
- Exact frontend origin
- PostgreSQL connection settings
- JWT secret and two-hour expiry
- bcrypt cost
- Cookie security settings
- Cloudinary credentials
- Nominatim base URL and application identification
- Image limits
- Logging level

Frontend-public configuration uses `NEXT_PUBLIC_` only for values safe to expose to the browser, such as the API base URL. Database credentials, JWT secrets, Cloudinary secrets, and other backend credentials must never use `NEXT_PUBLIC_`.

The backend validates required production configuration during startup and fails clearly when a required value is absent or invalid.

Docker Compose remains focused on PostgreSQL for local development. Containerizing every component is not required by the MVP architecture.

## 23. Logging strategy

The MVP uses structured console logging without a separate logging platform.

Request logs should include:

- Timestamp
- Log level
- Request identifier
- HTTP method
- Request path
- Response status
- Duration
- Authenticated user identifier when available

Important events include application startup and shutdown, database availability, failed authentication attempts, moderation actions, provider failures, unexpected errors, and Cloudinary cleanup failures.

Logs must not include passwords, password hashes, JWTs, cookies, provider secrets, full contact information, or sensitive request bodies. Production logs must not expose stack traces to clients.

Moderation history stored in PostgreSQL is the authoritative business audit trail. Runtime logs do not replace it.

## 24. Versioned migration strategy

Database changes use ordered, versioned SQL migration files committed to source control.

Migrations must:

- Run in deterministic version order
- Reproduce the required database structure from a clean database
- Be applied consistently across environments
- Avoid silent modification after being shared or applied
- Remain separate from normal application startup logic

No migrations are created during this architecture step. Migration tooling and the detailed database structure will be finalized during Database Design.

## 25. Recommended target folder structure

```text
RentMate/
├── docs/
│   ├── requirements/
│   │   └── REQUIREMENTS.md
│   └── architecture/
│       └── ARCHITECTURE.md
├── frontend/
│   ├── app/
│   │   ├── (public)/
│   │   ├── (auth)/
│   │   ├── (tenant)/
│   │   ├── (landlord)/
│   │   ├── (admin)/
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/
│   │   └── map/
│   ├── features/
│   │   ├── auth/
│   │   ├── listings/
│   │   └── favorites/
│   ├── lib/
│   │   ├── api/
│   │   └── auth/
│   └── types/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── db/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── listings/
│   │   │   └── favorites/
│   │   ├── integrations/
│   │   │   ├── nominatim.client.ts
│   │   │   └── cloudinary.client.ts
│   │   ├── shared/
│   │   │   ├── errors/
│   │   │   ├── middleware/
│   │   │   ├── validation/
│   │   │   └── logging/
│   │   ├── app.ts
│   │   └── server.ts
│   └── migrations/
├── docker-compose.yml
├── .env.example
└── README.md
```

This is a target structure, not an instruction to create empty directories. A directory or layer should be added only when implementation requires it.

## 26. Architectural risks and trade-offs

| Risk or decision | Trade-off and mitigation |
|---|---|
| PostgreSQL without PostGIS | Simpler implementation and deployment but weaker geospatial scalability. Limit the MVP to one region and use bounding-box filtering, Haversine, limits, and pagination. |
| Haversine in SQL | Produces one specialized query that is harder than ordinary CRUD SQL. Isolate it in one repository and verify it with known distances. |
| Rounded public coordinates | Protects location privacy but makes displayed markers approximate. Calculate distance using exact coordinates and label public locations appropriately. |
| HttpOnly JWT cookie | Reduces token exposure to JavaScript but requires same-site deployment, credential-aware requests, and Origin validation. Keep production frontend and API same-site. |
| No refresh tokens | Simplifies authentication and reduces token-management risk but requires login after two hours. This is acceptable for the MVP. |
| Backend-mediated uploads | Simplifies authorization and validation but consumes backend memory and bandwidth. Enforce the eight-image and five-megabyte limits. |
| Cloudinary/database consistency | The two systems cannot share a transaction. Perform best-effort cleanup and log failures rather than adding a queue. |
| Nominatim dependency | Public usage limits and ambiguous addresses may cause failure. Use explicit requests, limited results, timeouts, throttling, and manual pin adjustment. |
| In-place re-moderation | Avoids revision tables but temporarily removes an edited approved listing from public results. Make the behavior clear to landlords. |
| Contact-information leakage | Joins or raw result objects could expose private data. Use explicit role-aware response mapping and separate public/detail queries where useful. |
| State-transition complexity | Rules may become inconsistent if distributed across controllers. Centralize them in the listings service and test allowed and forbidden transitions. |
| Map and list inconsistency | Different queries could show different results. Use the same backend search parameters and response for both views. |
| Excessive layering | Empty architectural layers slow solo development. Apply controller, service, and repository boundaries selectively. |
| Eight-week schedule | External integrations and map behavior can consume disproportionate time. Implement authentication, listing lifecycle, and moderation before integrations. |

## 27. Future upgrade path

PostGIS is the primary scalability upgrade. If listing volume, geographic coverage, or spatial-query complexity grows, RentMate can migrate exact coordinates to PostGIS-compatible geospatial storage, add spatial indexes, and replace bounding-box-plus-Haversine SQL with PostGIS distance functions.

Other future architectural upgrades may include:

- Marker clustering for large map result sets
- More advanced polygon or multi-region search
- A dedicated or paid geocoding provider if Nominatim limits become insufficient
- Signed direct-to-Cloudinary uploads if backend upload traffic becomes excessive
- Refresh-token rotation if longer authenticated sessions become necessary
- Centralized monitoring and log aggregation for a production-scale deployment

These upgrades are not part of the MVP and must not be introduced unless demonstrated scale or operational needs justify them.

## 28. Final text-based architecture diagram

```text
┌──────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│                                                              │
│  Next.js UI ───── Leaflet ──────────────→ OpenStreetMap      │
│      │                                      map tiles         │
│      │                                                       │
│      └────────────────────────────────→ Cloudinary CDN        │
│                                       image delivery         │
└───────────────────────┬──────────────────────────────────────┘
                        │ REST/JSON
                        │ credentials: include
                        │ host-only HttpOnly JWT cookie
                        ▼
┌──────────────────────────────────────────────────────────────┐
│ Express modular monolith                                     │
│                                                              │
│  ┌────────┐  ┌────────┐  ┌──────────┐  ┌───────────┐         │
│  │  auth  │  │ users  │  │ listings │  │ favorites │         │
│  └────────┘  └────────┘  │          │  └───────────┘         │
│                          │ search   │                        │
│                          │ moderation│                        │
│                          └────┬─────┘                        │
│                               │                              │
│            ┌──────────────────┴──────────────────┐           │
│            ▼                                     ▼           │
│     Nominatim client                      Cloudinary client   │
│            │                                     │           │
│            ▼                                     ▼           │
│       Nominatim API                        Cloudinary API      │
│                                                              │
│  Routes → Controllers → Services → Repositories               │
│                         │                                    │
│                  Shared PostgreSQL pool                       │
└─────────────────────────┬────────────────────────────────────┘
                          │ parameterized SQL
                          ▼
               ┌──────────────────────────┐
               │ PostgreSQL               │
               │                          │
               │ Exact latitude/longitude │
               │ Bounding-box candidates  │
               │ Haversine calculation    │
               │ Versioned SQL migrations │
               │ No PostGIS in MVP        │
               └──────────────────────────┘
```
