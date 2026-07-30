# RentMate Requirement Specification v1

## 1. Project objective

RentMate is a smart, map-based room rental search and listing-management platform.

Its purpose is to help tenants find suitable rooms through searchable listings and an interactive map, while allowing landlords to submit and manage rental listings under an administrator moderation process.

The system will be implemented as a modular monolith. The MVP targets one defined city or region and focuses on monthly room rentals.

## 2. Actors

### Tenant

A registered user who searches approved rental listings, views their details and locations, saves preferred listings, and accesses landlord contact information to arrange viewing or renting.

### Landlord

A registered user who creates, submits, updates, and manages their own rental listings and provides contact information for authenticated tenants.

### Admin

A privileged user who reviews listings, controls listing visibility, and manages user accounts when necessary.

### External services

- **Nominatim:** Converts entered listing addresses into latitude and longitude coordinates.
- **Cloudinary:** Stores and delivers listing images.
- **OpenStreetMap and Leaflet:** Provide map tiles and interactive map functionality.

## 3. Functional requirements by actor

### 3.1 Tenant requirements

The system shall allow a tenant to:

- Register as a tenant.
- Log in and log out securely.
- Browse only publicly visible listings: listings with `APPROVED` status whose owning landlord account is active.
- Search listings by title or public-safe approximate area.
- View listings in both list and interactive map formats.
- View listing markers on the map.
- Search for listings within a selected radius of a chosen map point or the user’s current location.
- Filter listings by:
  - Minimum and maximum monthly price
  - Room area or size
  - Property or room type
  - Available amenities
- View listing details, including:
  - Title
  - Monthly rent
  - Description
  - Address or approximate location
  - Map location
  - Room area
  - Amenities
  - Images
- View the landlord’s phone number and email address on a publicly visible approved listing detail page when authenticated as a tenant.
- Not view landlord contact information when not authenticated.
- Add publicly visible approved listings to favorites.
- Remove listings from favorites.
- View their saved favorite listings.

### 3.2 Landlord requirements

The system shall allow a landlord to:

- Register as a landlord.
- Log in and log out securely.
- Provide the required login email and required phone number for tenant contact; phone is not an authentication identifier and has no SMS-verification workflow.
- Create rental listings.
- Save a listing as a draft before submitting it.
- Enter required listing information:
  - Title
  - Monthly rent
  - Address
  - Property or room type
  - Room area
  - Description
  - Amenities
  - Images
- Upload a limited number of listing images.
- Request geocoding of a listing address through Nominatim.
- Store the resulting latitude and longitude values.
- Confirm or manually adjust the listing position on a map before submission.
- Submit a listing for moderation.
- View their own listings and their current moderation status.
- Update their own listings.
- Deactivate their own available listings when they are no longer available.
- View the reason for rejection when a listing is rejected.

A landlord shall not be able to view, edit, submit, deactivate, or delete another landlord’s listings.

### 3.3 Admin requirements

The system shall allow an admin to:

- Log in securely.
- View listings submitted for moderation.
- View listing details, images, address, map location, and landlord contact information before moderation.
- Approve a pending listing.
- Reject a pending listing and provide a rejection reason.
- Hide an approved listing that is inappropriate, fraudulent, or no longer suitable for public display.
- View listing moderation history.
- View user accounts.
- Deactivate or reactivate `TENANT` and `LANDLORD` accounts when necessary; the MVP API shall not deactivate or reactivate `ADMIN` accounts.

## 4. Shared system functions

### 4.1 Authentication and authorization

The system shall:

- Support registration for tenant and landlord accounts.
- Store passwords only as bcrypt password hashes.
- Use JWT-based authentication for protected API requests.
- Enforce role-based access control for tenant, landlord, and admin functions.
- Enforce ownership checks for landlord listing operations.
- Reject unauthorized or forbidden requests with clear API error responses.

### 4.2 Listing lifecycle

Each listing shall have one of the following statuses:

- `DRAFT`: Created by a landlord but not submitted for review.
- `PENDING`: Submitted and awaiting admin review.
- `APPROVED`: Approved by an admin and eligible for tenant visibility while the owning landlord account is active.
- `REJECTED`: Rejected by an admin and not visible publicly.
- `HIDDEN`: Removed from public visibility by an admin.
- `INACTIVE`: Marked unavailable by the landlord.

The system shall enforce valid listing state transitions.

- A landlord may move a listing from `DRAFT` to `PENDING`.
- An admin may move a `PENDING` listing to `APPROVED` or `REJECTED`.
- An admin may move an `APPROVED` listing to `HIDDEN`.
- A landlord may mark their own listing as `INACTIVE`.
- Significant changes to an approved listing should return it to `PENDING` for re-moderation.
- A landlord may permanently delete an owned listing only when it is `DRAFT` and has never produced a moderation-history entry. A previously moderated listing cannot be hard-deleted even if a later edit returns it to `DRAFT`.
- A landlord may explicitly submit a `HIDDEN` listing for review, changing it to `PENDING`. The MVP does not require proof of a content difference before this submission.

### 4.3 Moderation history

The system shall record a moderation history entry when an admin changes a listing’s moderation status.

Moderation history is authoritative and must not be deleted to make a previously moderated listing eligible for hard deletion.

Each entry shall include:

- Listing identifier
- Admin identifier
- Previous status
- New status
- Rejection or moderation reason where applicable
- Timestamp

### 4.4 Contact information visibility

The system shall store a landlord’s required phone number and required login email as account contact information.

The system shall:

- Display landlord contact information only on detail pages for publicly visible approved listings.
- Display contact information only to authenticated users with the tenant role.
- Not include landlord phone numbers or email addresses in responses intended for anonymous users.
- Not expose contact information on public listing cards, search results, or map markers.
- Allow landlords to update their mutable contact information, specifically their required phone number; the login email remains immutable in the MVP.
- Allow admins to view landlord contact information for moderation and account-management purposes.

The MVP shall provide direct contact-information display only. It shall not include in-app messaging, chat, contact requests, or communication tracking.

### 4.5 Search, filtering, and pagination

The system shall:

- Return only listings with `APPROVED` status and an active owning landlord to tenant-facing search endpoints.
- Support filtering by price, room area, property type, and amenities.
- Support pagination for listing search results.
- Support map-based search within the current visible map area or a selected search area.
- Provide loading, empty-result, and error states in the user interface.

### 4.6 Image handling

The system shall:

- Store listing images through Cloudinary.
- Validate allowed image file types.
- Enforce a maximum image size and image count per listing.
- Store image URLs and relevant metadata in the application database.
- Prevent unauthorized users from changing another landlord’s listing images.

## 5. Non-functional requirements

### Security

- Passwords shall be hashed using bcrypt.
- Protected endpoints shall require valid JWT authentication.
- Role and ownership authorization shall be checked server-side.
- All external input shall be validated.
- Authentication endpoints should use rate limiting.
- Image uploads shall restrict file type, file size, and image count.

### Performance

- Listing results shall use pagination.
- Common search fields such as status, price, property type, and landlord identifier should be indexed.
- Radius searches shall use a bounding-box pre-filter before applying Haversine distance calculation when useful.
- The MVP is designed for a small dataset within one city or region.

### Reliability

- The system shall handle geocoding failure without losing entered listing data.
- A landlord shall be able to adjust coordinates manually through the map if geocoding is inaccurate.
- Image-upload failures shall produce clear feedback and shall not publish incomplete listings.
- API responses shall use consistent error formats.

### Usability and accessibility

- The interface shall work on desktop and mobile screen sizes.
- Search filters and map controls shall be understandable and easy to reset.
- Listing information shall remain available in list form, not only through map markers.
- Interactive controls should support keyboard use where practical.
- Listing images shall include meaningful alternative text where applicable.

### Privacy

- Landlord phone numbers and email addresses shall be visible only to authenticated tenants on detail pages for publicly visible approved listings.
- Anonymous users shall not receive landlord contact information from public APIs or user-interface pages.
- Contact information shall not appear in listing cards, search results, map markers, or public metadata.
- Exact location display should be considered carefully to protect landlord and tenant privacy.

### Maintainability

- The application shall use a modular-monolith architecture.
- The backend shall separate concerns across the four main business modules: `auth`, `users`, `listings`, and `favorites`. Search, moderation, and listing-image workflows remain concerns of the `listings` module, while Nominatim and Cloudinary remain infrastructure integration clients rather than additional business modules.
- TypeScript shall be used in both frontend and backend codebases.
- API endpoints, database models, and major business rules shall be documented.

## 6. MVP scope

The MVP shall include:

- Next.js, React, TypeScript, and Tailwind CSS frontend.
- Node.js, Express.js, and TypeScript backend.
- PostgreSQL database.
- Tenant and landlord registration and login.
- JWT authentication and role-based access control.
- Landlord provision and update of the required phone number, with immutable login email.
- Direct display of landlord phone number and email only to authenticated tenants on detail pages for publicly visible approved listings.
- Landlord listing draft, submission, editing, status viewing, and deactivation.
- Cloudinary image upload with basic validation and limits.
- Nominatim address geocoding.
- Map-pin confirmation or adjustment before listing submission.
- Admin listing approval, rejection with reason, hiding, and moderation history.
- Public browsing of listings that are approved and owned by active landlords.
- Leaflet/OpenStreetMap listing map.
- Search and filters for price, room area, property type, and amenities.
- Map-area and radius-based listing search.
- Bounding-box pre-filtering and Haversine calculation for radius searches.
- Listing detail pages.
- Tenant favorites.
- Pagination, loading states, validation feedback, and basic error handling.

## 7. Out-of-scope features

The following features are explicitly excluded from the MVP:

- Online payments, deposits, booking, and reservations.
- Lease generation and e-signatures.
- Real-time chat between tenants and landlords.
- In-app messaging or contact-request systems.
- Masked phone numbers or call-routing services.
- Email, SMS, push, or in-app notification systems.
- Ratings and reviews.
- AI-based recommendations, price prediction, or fraud detection.
- Social login.
- Native mobile applications.
- Multi-language support.
- Advanced analytics dashboards.
- Complex user-administration workflows.
- Advanced address autocomplete.
- Custom image editing or automated image moderation.
- Nationwide or multi-country search optimization.
- PostGIS integration.

## 8. Key technical features

### Map-based search

The system shall display approved listing locations as Leaflet markers using OpenStreetMap tiles.

Users shall be able to search based on a selected map location, selected radius, or visible map area.

### Latitude and longitude storage

For the MVP, each listing shall store:

- `latitude`
- `longitude`

Coordinates shall be validated before storage:

- Latitude must be between `-90` and `90`.
- Longitude must be between `-180` and `180`.

### Haversine radius search

The system shall calculate the distance between a search point and listing coordinates using the Haversine formula.

A listing shall appear in radius-search results only when its calculated distance is less than or equal to the selected radius.

### Bounding-box pre-filtering

Before executing Haversine distance calculations, the system should derive a latitude/longitude bounding box from the selected center point and radius.

The database query should first return candidate listings inside that bounding box. The Haversine calculation shall then identify the final listings within the requested radius.

This reduces unnecessary calculations and is appropriate for the expected MVP dataset size.

### Geocoding and location correction

The system shall use Nominatim to geocode landlord-entered addresses.

Because geocoding can return inaccurate or ambiguous results, the landlord shall be able to review and adjust the map marker before submitting the listing.

### Moderation workflow

Listings shall be visible in tenant-facing search and map views only when their status is `APPROVED` and their owning landlord account is active.

Moderation actions shall be recorded in listing moderation history.

### Contact-information protection

The system shall separate public listing data from protected landlord contact data.

The backend shall return landlord contact information only after verifying a valid authenticated tenant session and access to a publicly visible approved listing detail page.

### Role-based access control

The backend shall enforce permissions based on user roles and listing ownership. Frontend visibility controls alone shall not be treated as security controls.

## 9. Main assumptions and constraints

- The project will be developed by one student within approximately eight weeks.
- The student has prior experience with small full-stack projects but no prior PostGIS or microservices experience.
- The architecture shall remain a modular monolith; microservices are not part of the project.
- The MVP will initially support one defined city or region.
- The expected number of listings is small enough for PostgreSQL, bounding-box pre-filtering, and Haversine calculations.
- The primary rental period is monthly.
- The system will support a limited, predefined set of room types and amenities.
- Every user will provide the immutable login email, and landlords will additionally provide a phone number; tenant phone remains optional.
- Landlord contact information will be directly displayed only to authenticated tenants; the MVP does not mediate communication between users.
- Exact location display should be considered carefully to protect landlord and tenant privacy.
- Internet access is required for map tiles, Nominatim geocoding, and Cloudinary image services.
- Public Nominatim usage limits require controlled request frequency and, where practical, caching of geocoding results.
- Haversine calculations do not provide native spatial-index support and may become slower as the number of listings or geographic range increases.
- The project will prioritize a complete, reliable core workflow over advanced features.

## 10. Future upgrade path

When the project requires greater scale or more advanced location features, RentMate can be upgraded incrementally.

Potential future improvements include:

- Introduce **PostGIS** for geospatial columns, spatial indexes, and scalable proximity queries.
- Replace or supplement Haversine calculations with PostGIS distance and spatial functions.
- Add marker clustering for large numbers of map listings.
- Add more advanced map-bound and polygon-based search.
- Expand to multiple cities or regions.
- Add in-app messaging between tenants and landlords.
- Add contact-request approval before a tenant can initiate contact.
- Add masked phone numbers, call routing, or privacy-preserving contact methods.
- Add email or in-app notifications for moderation outcomes and listing activity.
- Add reservation or booking workflows.
- Add reviews, ratings, and reporting tools.
- Add analytics for landlords and administrators.
- Add address autocomplete through a suitable geocoding provider.
- Add stronger anti-fraud tools and automated moderation support.

PostGIS was evaluated during design but is intentionally postponed for the MVP. PostgreSQL with direct latitude/longitude storage, bounding-box pre-filtering, and Haversine calculations provides a simpler deployment and faster implementation path for the expected small initial dataset.
