export const listingBusinessStatuses = Object.freeze(["AVAILABLE", "PAUSED", "RENTED", "UNKNOWN"] as const);

export type ListingBusinessStatus = (typeof listingBusinessStatuses)[number];

export function isListingBusinessStatus(value: unknown): value is ListingBusinessStatus {
  return typeof value === "string" && listingBusinessStatuses.some((status) => status === value);
}
