import type { ListingStatus } from "./owner-listing-mapper.js";

export type CurrentModerationReasonStatus = Extract<ListingStatus, "REJECTED" | "HIDDEN">;

export class CurrentModerationReasonInvariantError extends Error {
  constructor() {
    super("Current moderation reason is invalid.");
    this.name = "CurrentModerationReasonInvariantError";
  }
}

export function requiresCurrentModerationReason(status: ListingStatus): status is CurrentModerationReasonStatus {
  switch (status) {
    case "REJECTED":
    case "HIDDEN":
      return true;
    case "DRAFT":
    case "PENDING":
    case "APPROVED":
    case "INACTIVE":
      return false;
  }
  throw new CurrentModerationReasonInvariantError();
}

export function resolveCurrentModerationReason(status: ListingStatus, reason: unknown): string | null {
  if (requiresCurrentModerationReason(status)) {
    if (typeof reason !== "string" || reason.trim().length === 0 || [...reason].length > 1_000) {
      throw new CurrentModerationReasonInvariantError();
    }
    return reason;
  }

  if (reason !== null) {
    throw new CurrentModerationReasonInvariantError();
  }
  return null;
}
