import type { ListingStatus } from "./mappers/owner-listing-mapper.js";

export const listingMutationSignificances = Object.freeze(["NO_STATUS_CHANGE", "SIGNIFICANT_CONTENT_CHANGE"] as const);

export type ListingMutationSignificance = (typeof listingMutationSignificances)[number];

export class ListingLifecycleInvariantError extends Error {
  constructor() {
    super("Listing lifecycle state is invalid.");
    this.name = "ListingLifecycleInvariantError";
  }
}

function significantStatus(currentStatus: ListingStatus): ListingStatus {
  switch (currentStatus) {
    case "DRAFT":
      return "DRAFT";
    case "PENDING":
      return "PENDING";
    case "REJECTED":
      return "DRAFT";
    case "APPROVED":
      return "PENDING";
    case "INACTIVE":
      return "PENDING";
    case "HIDDEN":
      return "HIDDEN";
  }
  throw new ListingLifecycleInvariantError();
}

function unchangedStatus(currentStatus: ListingStatus): ListingStatus {
  switch (currentStatus) {
    case "DRAFT":
    case "PENDING":
    case "REJECTED":
    case "APPROVED":
    case "INACTIVE":
    case "HIDDEN":
      return currentStatus;
  }
  throw new ListingLifecycleInvariantError();
}

export function resolveListingStatusAfterMutation(
  currentStatus: ListingStatus,
  significance: ListingMutationSignificance
): ListingStatus {
  switch (significance) {
    case "NO_STATUS_CHANGE":
      return unchangedStatus(currentStatus);
    case "SIGNIFICANT_CONTENT_CHANGE":
      return significantStatus(currentStatus);
  }
  throw new ListingLifecycleInvariantError();
}
