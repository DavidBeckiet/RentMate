# Landlord Analytics API Specification

This additive post-MVP contract provides basic inquiry analytics from data already owned by Engagement. It does not create synthetic view or favorite metrics.

## Endpoint

`GET /api/v1/landlord/analytics?period=30D`

- Active authenticated landlord only.
- `period` is one of `7D`, `30D`, or `90D`; default is `30D`.
- The period contains the current UTC calendar day and the preceding days in that window.

The response contains:

- period start, measurement timestamp, and selected period;
- inquiries created and unique tenants in the period;
- inquiries with at least one landlord reply;
- response rate and response-within-24-hours rate, both using inquiries created in the period as the denominator;
- average time to first landlord reply in minutes, or `null` when no reply exists;
- closed inquiries created in the period;
- current open inquiries whose latest message is from the tenant;
- one daily series containing inquiry creation and first-response counts;
- up to five listing IDs ranked by inquiry count in the period.

## Privacy and interpretation

Only rows whose `landlord_id` matches the current principal are aggregated. The response contains no tenant ID, contact, message body, private lead note, review, or individual event timestamp. Listing IDs are returned without cross-service titles. Rates are descriptive operational metrics and must not be represented as confirmed rentals or revenue.

No view metric exists until a deliberate tracking contract is implemented. Favorite counts are excluded because the current Engagement favorite record does not carry enough owner attribution to calculate landlord metrics safely.
