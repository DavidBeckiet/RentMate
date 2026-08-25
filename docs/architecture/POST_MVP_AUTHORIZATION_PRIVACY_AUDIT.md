# Post-MVP Authorization and Privacy Audit

This audit records the authorization and privacy checks completed while adding landlord contact verification and the
public verification badge. It preserves the existing service boundaries and does not introduce a public landlord
identity endpoint.

## Protected access

- Protected requests authenticate through the existing host-only session cookie and re-check the current account
  activity before service authorization.
- Landlord verification status, email-token actions, phone-OTP actions, and manual profile submission require an active
  `LANDLORD` account.
- Manual profile submission also checks verified email and phone in Identity Service, so the API cannot be bypassed by
  skipping the frontend panel.
- Manual verification queue and decisions require `ADMIN`; terminal decisions remain limited to `APPROVED` and
  `REJECTED`.
- Listing owner operations continue to authorize by the authenticated landlord ID in the repository query. Engagement
  notes, lead reminders, inquiries, reviews, favorites, and analytics keep their existing tenant/landlord ownership
  guards.
- Internal service routes require the internal service token. The browser gateway rejects `/internal/*` routes, and
  service clients require and validate the internal response contract.

## Public projection

- Public listing search and detail expose only the boolean `landlordVerified` badge. The internal landlord ID is used
  only for one batched Identity lookup and is removed before the DTO leaves Listing Service.
- Public listing responses do not expose the exact address, exact coordinates, landlord identity, moderation data,
  verification notes, reviewer identity, verification timestamps, raw verification token, or phone OTP.
- Public visibility still requires an approved listing, an available/unknown business status, and an active owning
  landlord.
- Landlord contact is still projected only for an authenticated active tenant viewing a currently public detail and is
  not included in search cards.

## Verification data handling

- Email tokens and phone OTPs are generated transiently, stored only as HMAC hashes, expire, are single-use, and have
  bounded failed-attempt counts.
- Contact verification resets when the landlord changes the phone number.
- A public verified badge requires all three conditions: active landlord, verified email, verified phone, and approved
  manual landlord profile.
- Delivery preview is registered only outside production and remains behind the internal service guard.

## Evidence

- `services/api-gateway/test/gateway.test.mjs` verifies unsafe origins and browser access to internal routes.
- `services/listing-service/test/public-listing-search-contract.test.ts` verifies batched badge lookup and removal of
  the internal landlord ID.
- `services/listing-service/test/service-contract.test.ts` verifies internal headers, DTO validation, and stripping of
  unexpected provider fields.
- `services/identity-service/test/contact-verification-service.test.ts` verifies role checks, delivery failures, failed
  OTP attempts, and successful confirmation without storing raw secrets.
- `frontend/features/auth/landlord-verification-panel.test.tsx` and
  `frontend/features/listings/listing-card.test.tsx` verify the landlord flow and public badge presentation without
  rendering landlord identity.

## Operational follow-up

Production must provide an HTTPS verification delivery endpoint and token. The new Identity migration must be applied
through the explicit migration runner mode selected for the target database; the external version record is advanced
only after the migration and schema verification succeed.
