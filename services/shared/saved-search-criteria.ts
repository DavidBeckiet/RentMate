/**
 * Canonical lookup codes accepted by the Saved Search contract.
 *
 * These values mirror the controlled lookup rows owned by Listing Service.
 * Keeping the allow-list in shared runtime code lets Engagement validate a
 * saved criterion without making a synchronous cross-service lookup request.
 */
export const savedSearchPropertyTypeCodes = Object.freeze([
  "ROOM",
  "STUDIO",
  "APARTMENT",
  "HOUSE",
  "DORMITORY"
] as const);

export const savedSearchAmenityCodes = Object.freeze([
  "AIR_CONDITIONING",
  "WIFI",
  "FURNISHED",
  "PRIVATE_BATHROOM",
  "KITCHEN",
  "REFRIGERATOR",
  "WASHING_MACHINE",
  "PARKING",
  "ELEVATOR",
  "SECURITY",
  "BALCONY",
  "PET_FRIENDLY"
] as const);

export const savedSearchTextMaximumLengths = Object.freeze({
  q: 160,
  areaName: 120,
  name: 120
});
